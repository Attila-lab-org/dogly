/**
 * ApiError contract: the mobile client must keep retryable and correlation_id
 * from the server body / X-Request-ID header so the UI can show retry CTAs
 * and support can correlate by request id.
 *
 * Imports from the standalone apiError module (no expo dependency) so the test
 * runs under the minimal jest config.
 */
import { ApiError } from '../lib/apiError';

describe('ApiError', () => {
  it('keeps retryable and correlation_id from the constructor', () => {
    const err = new ApiError(429, 'RATE_LIMITED', 'slow down', true, 'req-123');
    expect(err.retryable).toBe(true);
    expect(err.correlationId).toBe('req-123');
    expect(err.code).toBe('RATE_LIMITED');
    expect(err.status).toBe(429);
    expect(err.message).toBe('slow down');
  });

  it('defaults retryable=false and correlationId=null', () => {
    const err = new ApiError(400, 'VALIDATION_FAILED', 'bad input');
    expect(err.retryable).toBe(false);
    expect(err.correlationId).toBeNull();
  });

  it('is still an Error (instanceof + name)', () => {
    const err = new ApiError(500, 'INTERNAL_ERROR', 'oops');
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(ApiError);
    expect(err.name).toBe('ApiError');
  });
});
