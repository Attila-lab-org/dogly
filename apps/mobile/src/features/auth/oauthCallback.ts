export type OAuthCallback = {
  accessToken: string | null;
  refreshToken: string | null;
  code: string | null;
  error: string | null;
};

export function parseOAuthCallbackUrl(callbackUrl: string): OAuthCallback {
  const url = new URL(callbackUrl);
  const query = new URLSearchParams(url.search.slice(1));
  const fragment = new URLSearchParams(
    url.hash.startsWith('#') ? url.hash.slice(1) : '',
  );
  const value = (key: string) => fragment.get(key) ?? query.get(key);

  return {
    accessToken: value('access_token'),
    refreshToken: value('refresh_token'),
    code: value('code'),
    error: value('error_description') ?? value('error'),
  };
}
