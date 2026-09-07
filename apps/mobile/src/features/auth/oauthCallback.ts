import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

export type OAuthCallback = {
  accessToken: string | null;
  refreshToken: string | null;
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

const OAUTH_STATE_KEY = 'dogly.oauth.state';

function webSessionStorage(): Storage | null {
  return typeof globalThis.sessionStorage === 'undefined'
    ? null
    : globalThis.sessionStorage;
}

export function createOAuthState(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 18)}`;
}

/** Il nonce lega il callback al login appena avviato: un URL senza lo stesso
 * dogly_state (iniettato da altra app/link) non può impostare la sessione. */
export async function saveOAuthState(state: string): Promise<void> {
  if (Platform.OS === 'web') {
    webSessionStorage()?.setItem(OAUTH_STATE_KEY, state);
    return;
  }
  await SecureStore.setItemAsync(OAUTH_STATE_KEY, state);
}

export async function verifyOAuthState(url: URL): Promise<void> {
  const expected =
    Platform.OS === 'web'
      ? (webSessionStorage()?.getItem(OAUTH_STATE_KEY) ?? null)
      : await SecureStore.getItemAsync(OAUTH_STATE_KEY);
  if (Platform.OS === 'web') {
    webSessionStorage()?.removeItem(OAUTH_STATE_KEY);
  } else {
    await SecureStore.deleteItemAsync(OAUTH_STATE_KEY);
  }
  const received = url.searchParams.get('dogly_state');
  if (!expected || !received || received !== expected) {
    throw new Error('Accesso non completato. Riprova.');
  }
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
    accessToken: value('access_token'),
    refreshToken: value('refresh_token'),
    code: value('code'),
    error: value('error_description') ?? value('error'),
  };
}
