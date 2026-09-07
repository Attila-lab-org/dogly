import { getAccessToken } from './secureStore';
import { createRequestTimeout } from './requestTimeout';

/**
 * API client per il backend pubblico (FastAPI deployato su Vercel,
 * Amendment V1.1). Base URL da EXPO_PUBLIC_API_URL (vedi .env.example).
 * JWT Supabase in Authorization: Bearer, letto da SecureStore (sez. 5.3).
 */

export function getApiBaseUrl(): string {
  const url = process.env.EXPO_PUBLIC_API_URL;
  if (!url) {
    throw new Error(
      'EXPO_PUBLIC_API_URL non configurata: imposta l’URL del deployment Vercel (staging/prod) in .env',
    );
  }
  return url.replace(/\/$/, '');
}

export interface ApiErrorBody {
  code?: string;
  message?: string;
}

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  /** Salta l'header Authorization (route pubbliche) */
  skipAuth?: boolean;
  headers?: Record<string, string>;
  /** Evita loading infiniti su reti mobili degradate. */
  timeoutMs?: number;
}

export const DEFAULT_API_TIMEOUT_MS = 15_000;

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
  } = options;
  const timeout = createRequestTimeout(timeoutMs);
  let response: Response;
  try {
    response = await fetch(`${getApiBaseUrl()}${path}`, {
      method,
      headers: await buildHeaders(skipAuth ?? false, headers),
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: timeout.controller.signal,
    });
  } catch (error) {
    if (timeout.controller.signal.aborted) {
      throw new ApiError(
        0,
        'REQUEST_TIMEOUT',
        'La richiesta sta impiegando troppo tempo. Riprova.',
      );
    }
    if (error instanceof ApiError) throw error;
    throw new ApiError(
      0,
      'NETWORK_ERROR',
      'Non riesco a raggiungere Dogly. Controlla la connessione e riprova.',
    );
  } finally {
    timeout.clear();
  }

  if (!response.ok) {
    let code = 'UNKNOWN';
    let message = `Errore API (${response.status})`;
    try {
      const errBody = (await response.json()) as ApiErrorBody;
      if (errBody.code) code = errBody.code;
      if (errBody.message) message = errBody.message;
    } catch {
      // body non JSON: mantieni il fallback
    }
    throw new ApiError(response.status, code, message);
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
