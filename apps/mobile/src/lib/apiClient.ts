import { getAccessToken } from './secureStore';
import { createRequestTimeout } from './requestTimeout';
import { getSupabaseClient, isSupabaseConfigured } from './supabase';
import { ApiError, type ApiErrorBody } from './apiError';

// Re-export for callers that import ApiError from the api client module.
export { ApiError } from './apiError';
export type { ApiErrorBody } from './apiError';

/**
 * API client per il backend pubblico (FastAPI deployato su Vercel,
 * Amendment V1.1). Base URL da EXPO_PUBLIC_API_URL (vedi .env.example).
 * JWT Supabase in Authorization: Bearer, letto da SecureStore (sez. 5.3).
 */

/**
 * Refresh sessione dedup: se più chiamate 401 arrivano contemporaneamente
 * (es. resume da background con token scaduto), condividono un unico
 * refresh Supabase invece di lanciarne uno per richiesta.
 */
let refreshPromise: Promise<boolean> | null = null;

async function refreshSessionOnce(): Promise<boolean> {
  if (refreshPromise) return refreshPromise;
  if (!isSupabaseConfigured()) return false;
  refreshPromise = (async () => {
    try {
      const { data } = await getSupabaseClient().auth.refreshSession();
      return Boolean(data.session);
    } catch {
      return false;
    } finally {
      refreshPromise = null;
    }
  })();
  return refreshPromise;
}

export function getApiBaseUrl(): string {
  const url = process.env.EXPO_PUBLIC_API_URL;
  if (!url) {
    throw new Error(
      'EXPO_PUBLIC_API_URL non configurata: imposta l’URL del deployment Vercel (staging/prod) in .env',
    );
  }
  return url.replace(/\/$/, '');
}

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  /** Salta l'header Authorization (route pubbliche) */
  skipAuth?: boolean;
  headers?: Record<string, string>;
  /** Evita loading infiniti su reti mobili degradate. */
  timeoutMs?: number;
  /** Interno: marca un retry dopo refresh token (evita loop). */
  _isRetry?: boolean;
  /** Caller-provided request id; echoed back by the server for correlation. */
  requestId?: string;
}

export const DEFAULT_API_TIMEOUT_MS = 15_000;

/** Generate a client-side request id (FIX 1.7) for X-Request-ID. */
function _newClientRequestId(): string {
  // crypto.randomUUID is available on React Native / Expo (Hermes / JSC).
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
  } catch {
    // fall through to manual generation
  }
  return 'c-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
}

async function buildHeaders(
  skipAuth: boolean,
  extra?: Record<string, string>,
): Promise<Record<string, string>> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...extra,
  };
  if (!skipAuth) {
    const token = await getAccessToken();
    if (token) headers.Authorization = `Bearer ${token}`;
  }
  return headers;
}

export async function apiRequest<T>(
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  const {
    method = 'GET',
    body,
    skipAuth,
    headers,
    timeoutMs = DEFAULT_API_TIMEOUT_MS,
    requestId,
  } = options;
  const timeout = createRequestTimeout(timeoutMs);
  let response: Response;
  try {
    const mergedHeaders = await buildHeaders(skipAuth ?? false, headers);
    // FIX 1.7: send X-Request-ID so the server can correlate logs; generate
    // one when the caller doesn't supply one.
    if (requestId) {
      mergedHeaders['X-Request-ID'] = requestId;
    } else if (!mergedHeaders['X-Request-ID']) {
      mergedHeaders['X-Request-ID'] = _newClientRequestId();
    }
    response = await fetch(`${getApiBaseUrl()}${path}`, {
      method,
      headers: mergedHeaders,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: timeout.controller.signal,
    });
  } catch (error) {
    if (timeout.controller.signal.aborted) {
      throw new ApiError(
        0,
        'REQUEST_TIMEOUT',
        'La richiesta sta impiegando troppo tempo. Riprova.',
        true, // retryable: a timeout is worth retrying
      );
    }
    if (error instanceof ApiError) throw error;
    throw new ApiError(
      0,
      'NETWORK_ERROR',
      'Non riesco a raggiungere Dogly. Controlla la connessione e riprova.',
      true, // retryable: a transient network failure is worth retrying
    );
  } finally {
    timeout.clear();
  }

  if (!response.ok) {
    // 401 con token probabilmente scaduto: refresh Supabase (dedup) e retry
    // una sola volta. Su 403 (permessi) o se il refresh fallisce, propaga.
    if (
      response.status === 401 &&
      !skipAuth &&
      !options._isRetry
    ) {
      const refreshed = await refreshSessionOnce();
      if (refreshed) {
        return apiRequest<T>(path, { ...options, _isRetry: true });
      }
    }

    let code = 'UNKNOWN';
    let message = `Errore API (${response.status})`;
    let retryable = false;
    let correlationId: string | null = null;
    // FIX: keep retryable and correlation_id from the server body so the UI
    // can show retry CTAs and support can correlate by request id.
    try {
      const errBody = (await response.json()) as ApiErrorBody;
      if (errBody.code) code = errBody.code;
      if (errBody.message) message = errBody.message;
      if (typeof errBody.retryable === 'boolean') retryable = errBody.retryable;
      if (errBody.correlation_id) correlationId = errBody.correlation_id;
    } catch {
      // body non JSON: mantieni il fallback
    }
    // The response header is the canonical request id (FIX 1.7); prefer it
    // over the body's correlation_id when both are present.
    const headerRid = response.headers.get('X-Request-ID');
    if (headerRid) correlationId = headerRid;
    // 429 / 5xx are retryable by convention when the body doesn't say.
    if (!retryable && (response.status === 429 || response.status >= 500)) {
      retryable = true;
    }
    throw new ApiError(response.status, code, message, retryable, correlationId);
  }

  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

/** Convenzioni V1 (sez. 9.1): rotte versionate /v1. */
export const api = {
  get: <T>(path: string, opts?: Omit<RequestOptions, 'method' | 'body'>) =>
    apiRequest<T>(path, { ...opts, method: 'GET' }),
  post: <T>(path: string, body?: unknown, opts?: Omit<RequestOptions, 'method'>) =>
    apiRequest<T>(path, { ...opts, method: 'POST', body }),
  patch: <T>(path: string, body?: unknown, opts?: Omit<RequestOptions, 'method'>) =>
    apiRequest<T>(path, { ...opts, method: 'PATCH', body }),
  delete: <T>(path: string, opts?: Omit<RequestOptions, 'method' | 'body'>) =>
    apiRequest<T>(path, { ...opts, method: 'DELETE' }),
};
