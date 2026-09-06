export type OAuthCallback = {
  accessToken: string | null;
  refreshToken: string | null;
  code: string | null;
  error: string | null;
};

/** Redirect dopo Google: HTTP sul browser, scheme nativo sul telefono. */
export function oauthRedirectTo(platform: string, origin?: string): string {
  if (platform === 'web') {
    const base = (origin ?? '').replace(/\/$/, '');
    if (!base.startsWith('http')) {
      throw new Error('Redirect web non valido');
    }
    return `${base}/auth/callback`;
  }
  return 'dogly://auth/callback';
}

/**
 * Sul web Linking di Expo restituisce lo scheme `dogly://`, che Windows
 * non sa aprire. La sessione sta nell'URL reale del browser.
 */
export function resolveAuthCallbackUrl(input: {
  platform: string;
  browserHref?: string | null;
  linkingUrl?: string | null;
}): string | null {
  if (input.platform === 'web') {
    return input.browserHref || null;
  }
  return input.linkingUrl ?? input.browserHref ?? null;
}

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
