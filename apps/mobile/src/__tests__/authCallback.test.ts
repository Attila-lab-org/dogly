import { parseOAuthCallbackUrl } from '../features/auth/oauthCallback';

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
});
