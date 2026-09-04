import { getAccessToken } from './secureStore';

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
  const { method = 'GET', body, skipAuth, headers } = options;
  const response = await fetch(`${getApiBaseUrl()}${path}`, {
    method,
    headers: await buildHeaders(skipAuth ?? false, headers),
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

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
