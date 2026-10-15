jest.mock('expo/virtual/env', () => ({ env: process.env }));
import { apiRequest } from '../lib/apiClient';

jest.mock('../lib/secureStore', () => ({ getAccessToken: jest.fn(async () => null) }));
jest.mock('../lib/supabase', () => ({ isSupabaseConfigured: () => false }));

describe('API retry contract', () => {
  const originalFetch = globalThis.fetch;
  const originalUrl = process.env.EXPO_PUBLIC_API_URL;
  beforeEach(() => { process.env.EXPO_PUBLIC_API_URL = 'https://api.example.test'; });
  afterEach(() => {
    globalThis.fetch = originalFetch;
    if (originalUrl === undefined) delete process.env.EXPO_PUBLIC_API_URL;
    else process.env.EXPO_PUBLIC_API_URL = originalUrl;
  });
  it.each([429, 500, 503])('respects explicit non-retryable errors for HTTP %i', async (status) => {
    globalThis.fetch = jest.fn(async () => new Response(JSON.stringify({
      code: 'PERMANENT_FAILURE', message: 'Stop', retryable: false,
      correlation_id: 'body-id',
    }), { status, headers: { 'X-Request-ID': 'header-id' } })) as typeof fetch;
    await expect(apiRequest('/v1/test')).rejects.toMatchObject({
      status, retryable: false, correlationId: 'header-id', code: 'PERMANENT_FAILURE',
    });
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });
  it.each([429, 500, 503])('defaults HTTP %i to retryable without a server decision', async (status) => {
    globalThis.fetch = jest.fn(async () => new Response('upstream unavailable', { status })) as typeof fetch;
    await expect(apiRequest('/v1/test')).rejects.toMatchObject({ status, retryable: true });
  });
  it('preserves an explicit retryable client error', async () => {
    globalThis.fetch = jest.fn(async () => new Response(JSON.stringify({ retryable: true }), { status: 409 })) as typeof fetch;
    await expect(apiRequest('/v1/test')).rejects.toMatchObject({ status: 409, retryable: true });
  });
});