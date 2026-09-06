/**
 * Auth helpers: email OTP + Google OAuth + Sign in with Apple (Supabase).
 */
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { Platform } from 'react-native';

import { getSupabaseClient } from '../../lib/supabase';
import { isSupabaseConfigured } from './env';
import { parseOAuthCallbackUrl } from './oauthCallback';

WebBrowser.maybeCompleteAuthSession();

export type AuthErrorKind = 'auth_error' | 'account_exists' | 'offline';

export function mapAuthError(err: unknown): AuthErrorKind {
  const message =
    err instanceof Error ? err.message.toLowerCase() : String(err).toLowerCase();
  if (
    message.includes('network') ||
    message.includes('offline') ||
    message.includes('fetch')
  ) {
    return 'offline';
  }
  if (
    message.includes('already registered') ||
    message.includes('already exists') ||
    message.includes('identity is already')
  ) {
    return 'account_exists';
  }
  return 'auth_error';
}

export async function sendEmailOtp(email: string): Promise<void> {
  if (!isSupabaseConfigured()) {
    throw new Error('Supabase non configurato');
  }
  const { error } = await getSupabaseClient().auth.signInWithOtp({
    email: email.trim(),
    options: { shouldCreateUser: true },
  });
  if (error) throw error;
}

export async function verifyEmailOtp(
  email: string,
  token: string,
): Promise<void> {
  if (!isSupabaseConfigured()) {
    throw new Error('Supabase non configurato');
  }
  const { error } = await getSupabaseClient().auth.verifyOtp({
    email: email.trim(),
    token: token.trim(),
    type: 'email',
  });
  if (error) throw error;
}

export async function signInWithPassword(
  email: string,
  password: string,
): Promise<void> {
  if (!isSupabaseConfigured()) {
    throw new Error('Supabase non configurato');
  }
  const { error } = await getSupabaseClient().auth.signInWithPassword({
    email: email.trim(),
    password,
  });
  if (error) throw error;
}

const oauthCompletions = new Map<string, Promise<void>>();

async function runOAuthCallback(callbackUrl: string): Promise<void> {
  const supabase = getSupabaseClient();
  const callback = parseOAuthCallbackUrl(callbackUrl);

  if (callback.error) {
    throw new Error(callback.error);
  }
  if (callback.accessToken && callback.refreshToken) {
    const { error } = await supabase.auth.setSession({
      access_token: callback.accessToken,
      refresh_token: callback.refreshToken,
    });
    if (error) throw error;
    return;
  }
  if (callback.code) {
    const { error } = await supabase.auth.exchangeCodeForSession(callback.code);
    if (error) throw error;
    return;
  }
  throw new Error('Sessione OAuth non ricevuta');
}

export async function completeOAuthCallback(callbackUrl: string): Promise<void> {
  const existing = oauthCompletions.get(callbackUrl);
  if (existing) return existing;

  const completion = runOAuthCallback(callbackUrl);
  oauthCompletions.set(callbackUrl, completion);
  try {
    await completion;
  } catch (error) {
    oauthCompletions.delete(callbackUrl);
    throw error;
  }
}

export async function signInWithGoogle(): Promise<void> {
  if (!isSupabaseConfigured()) {
    throw new Error('Supabase non configurato');
  }
  const supabase = getSupabaseClient();
  const web = Platform.OS === 'web';
  const redirectTo = web
    ? `${globalThis.location.origin}/auth/callback`
    : Linking.createURL('auth/callback');
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo,
      skipBrowserRedirect: !web,
    },
  });
  if (error) throw error;
  // Sul web Supabase trasferisce la pagina corrente a Google e ritorna
  // sull'URL HTTP sopra. WebBrowser serve solo alla build nativa.
  if (web) return;
  if (!data.url) throw new Error('URL OAuth mancante');

  const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
  if (result.type !== 'success' || !result.url) {
    throw new Error('Accesso Google annullato');
  }

  await completeOAuthCallback(result.url);
}

/**
 * Sign in with Apple (ADR-001 LOCKED): credential Apple nativa → Supabase
 * signInWithIdToken (provider 'apple'). Errori mappati come Google tramite
 * mapAuthError; l'annullamento utente diventa "Accesso Apple annullato".
 * NOTA: richiede una development build (EAS/dev-client) con il capability
 * "Sign In with Apple" — in Expo Go il modulo nativo non è disponibile.
 */
export async function signInWithApple(): Promise<void> {
  if (!isSupabaseConfigured()) {
    throw new Error('Supabase non configurato');
  }
  const AppleAuthentication = await import('expo-apple-authentication');
  let credential;
  try {
    credential = await AppleAuthentication.signInAsync({
      requestedScopes: [
        AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
        AppleAuthentication.AppleAuthenticationScope.EMAIL,
      ],
    });
  } catch (err) {
    if (
      typeof err === 'object' &&
      err !== null &&
      (err as { code?: string }).code === 'ERR_REQUEST_CANCELED'
    ) {
      throw new Error('Accesso Apple annullato');
    }
    throw err;
  }
  if (!credential.identityToken) {
    throw new Error('Token Apple mancante');
  }
  const { error } = await getSupabaseClient().auth.signInWithIdToken({
    provider: 'apple',
    token: credential.identityToken,
  });
  if (error) throw error;
}
