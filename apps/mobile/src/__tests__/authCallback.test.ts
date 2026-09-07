jest.mock('react-native', () => ({
  Platform: { OS: 'android' },
}));

const secureStoreMock: Record<string, string> = {};

jest.mock('expo-secure-store', () => ({
  setItemAsync: async (key: string, value: string) => {
    secureStoreMock[key] = value;
  },
  getItemAsync: async (key: string) => secureStoreMock[key] ?? null,
  deleteItemAsync: async (key: string) => {
    delete secureStoreMock[key];
  },
}));

import {
  assertValidAuthCallbackUrl,
  oauthRedirectTo,
  parseOAuthCallbackUrl,
  resolveAuthCallbackUrl,
  saveOAuthState,
  verifyOAuthState,
} from '../features/auth/oauthCallback';

describe('OAuth callback parser', () => {
  it('reads an implicit session from the URL fragment', () => {
    expect(
      parseOAuthCallbackUrl(
        'dogly://auth/callback#access_token=access&refresh_token=refresh',
      ),
    ).toEqual({
      accessToken: 'access',
      refreshToken: 'refresh',
      code: null,
      error: null,
    });
  });

  it('reads a PKCE code from the query string', () => {
    expect(
      parseOAuthCallbackUrl('dogly://auth/callback?code=oauth-code'),
    ).toEqual({
      accessToken: null,
      refreshToken: null,
      code: 'oauth-code',
      error: null,
    });
  });

  it('reads a PKCE code from an HTTP browser callback', () => {
    expect(
      parseOAuthCallbackUrl(
        'http://localhost:8083/auth/callback?code=oauth-code',
      ),
    ).toEqual({
      accessToken: null,
      refreshToken: null,
      code: 'oauth-code',
      error: null,
    });
  });
});

describe('Web OAuth URL resolution', () => {
  it('sends the browser origin, never the native scheme', () => {
    expect(oauthRedirectTo('web', 'http://localhost:8083')).toBe(
      'http://localhost:8083/auth/callback',
    );
    expect(oauthRedirectTo('android')).toBe('dogly://auth/callback');
  });

  it('prefers the real browser href over Expo Linking on web', () => {
    expect(
      resolveAuthCallbackUrl({
        platform: 'web',
        browserHref: 'http://localhost:8083/auth/callback?code=abc',
        linkingUrl: 'dogly://auth/callback',
      }),
    ).toBe('http://localhost:8083/auth/callback?code=abc');
  });
});

describe('Validazione URL di callback (anti token injection)', () => {
  it('accetta il deep link nativo dogly://auth/callback', () => {
    expect(
      assertValidAuthCallbackUrl('dogly://auth/callback?dogly_state=a&code=b').host,
    ).toBe('auth');
  });

  it('accetta il callback HTTP del browser', () => {
    expect(
      assertValidAuthCallbackUrl('http://localhost:8083/auth/callback?dogly_state=a')
        .protocol,
    ).toBe('http:');
  });

  it('rifiuta scheme arbitrari (intent maligno)', () => {
    expect(() =>
      assertValidAuthCallbackUrl('evil://auth/callback#access_token=x'),
    ).toThrow('Accesso non completato');
  });

  it('rifiuta host diversi sullo scheme dogly', () => {
    expect(() =>
      assertValidAuthCallbackUrl('dogly://fake/callback#access_token=x'),
    ).toThrow('Accesso non completato');
  });

  it('rifiuta percorsi diversi da /auth/callback', () => {
    expect(() =>
      assertValidAuthCallbackUrl('dogly://auth/other#access_token=x'),
    ).toThrow('Accesso non completato');
  });

  it('rifiuta URL malformati', () => {
    expect(() => assertValidAuthCallbackUrl('not-a-url')).toThrow(
      'Accesso non completato',
    );
  });
});

describe('Stato OAuth (lega il callback al login avviato)', () => {
  beforeEach(() => {
    Object.keys(secureStoreMock).forEach((k) => delete secureStoreMock[k]);
  });

  it('accetta il callback con lo stesso dogly_state e lo consuma', async () => {
    await saveOAuthState('nonce-123');
    const url = new URL('dogly://auth/callback?dogly_state=nonce-123&code=abc');
    await expect(verifyOAuthState(url)).resolves.toBeUndefined();
    // Seconda verifica con lo stesso nonce: il nonce è consumato, rifiutata.
    await expect(verifyOAuthState(url)).rejects.toThrow('Accesso non completato');
  });

  it('rifiuta un callback con state mancante (iniezione)', async () => {
    await saveOAuthState('nonce-123');
    const url = new URL('dogly://auth/callback#access_token=x');
    await expect(verifyOAuthState(url)).rejects.toThrow('Accesso non completato');
  });

  it('rifiuta un callback con state diverso (replay da altra sessione)', async () => {
    await saveOAuthState('nonce-123');
    const url = new URL('dogly://auth/callback?dogly_state=nonce-999&code=abc');
    await expect(verifyOAuthState(url)).rejects.toThrow('Accesso non completato');
  });

  it('rifiuta quando nessun login è stato avviato', async () => {
    const url = new URL('dogly://auth/callback?dogly_state=x&code=abc');
    await expect(verifyOAuthState(url)).rejects.toThrow('Accesso non completato');
  });
});
