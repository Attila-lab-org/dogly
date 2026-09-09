/**
 * Canonical API error type for the mobile client.
 *
 * Kept in a standalone module (no expo / supabase imports) so it can be unit-
 * tested in isolation and imported by feature modules without pulling in the
 * full apiClient dependency graph.
 */

export interface ApiErrorBody {
  code?: string;
  message?: string;
  retryable?: boolean;
  correlation_id?: string;
}

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  /** Whether the caller should retry (e.g. 429, 503, network). Defaults false. */
  readonly retryable: boolean;
  /** Server-side correlation id (X-Request-ID) for support lookup. */
  readonly correlationId: string | null;

  constructor(
    status: number,
    code: string,
    message: string,
    retryable = false,
    correlationId: string | null = null,
  ) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.retryable = retryable;
    this.correlationId = correlationId;
  }
}
