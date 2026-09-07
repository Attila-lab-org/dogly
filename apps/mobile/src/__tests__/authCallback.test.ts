jest.mock('react-native', () => ({
  Platform: { OS: 'android' },
}));

import {
  assertValidAuthCallbackUrl,
  oauthRedirectTo,
  parseOAuthCallbackUrl,
  resolveAuthCallbackUrl,
} from '../features/auth/oauthCallback';

describe('OAuth callback parser', () => {
  it('non accetta token implicit dal deep link', () => {
    expect(
      parseOAuthCallbackUrl(
        'dogly://auth/callback#access_token=access&refresh_token=refresh',
      ),
    ).toEqual({
      code: null,
      error: null,
    });
  });

  it('reads a PKCE code from the query string', () => {
    expect(
      parseOAuthCallbackUrl('dogly://auth/callback?code=oauth-code'),
    ).toEqual({
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
      assertValidAuthCallbackUrl('dogly://auth/callback?code=b').host,
    ).toBe('auth');
  });

  it('accetta il callback HTTP del browser', () => {
    expect(
      assertValidAuthCallbackUrl('http://localhost:8083/auth/callback?code=a')
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
