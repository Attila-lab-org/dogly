export type OAuthCallback = {
  code: string | null;
  error: string | null;
};

/** Solo questi percorsi possono consegnare una sessione OAuth. Blocca
 * intent/deep link arbitrari che puntino token finti all'app. */
export function assertValidAuthCallbackUrl(callbackUrl: string): URL {
  let url: URL;
  try {
    url = new URL(callbackUrl);
  } catch {
    throw new Error('Accesso non completato. Riprova.');
  }
  if (url.protocol === 'dogly:') {
    if (url.host !== 'auth' || url.pathname !== '/callback') {
      throw new Error('Accesso non completato. Riprova.');
    }
    return url;
  }
  if (url.protocol === 'http:' || url.protocol === 'https:') {
    if (url.pathname !== '/auth/callback') {
      throw new Error('Accesso non completato. Riprova.');
    }
    return url;
  }
  throw new Error('Accesso non completato. Riprova.');
}

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
    code: value('code'),
    error: value('error_description') ?? value('error'),
  };
}
