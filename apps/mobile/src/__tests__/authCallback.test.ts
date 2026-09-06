import {
  oauthRedirectTo,
  parseOAuthCallbackUrl,
  resolveAuthCallbackUrl,
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
