/**
 * Auth helpers: email OTP + Google OAuth (Supabase).
 */
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';

import { getSupabaseClient } from '../../lib/supabase';
import { isSupabaseConfigured } from './env';

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

export async function signInWithGoogle(): Promise<void> {
  if (!isSupabaseConfigured()) {
    throw new Error('Supabase non configurato');
  }
  const supabase = getSupabaseClient();
  const redirectTo = Linking.createURL('auth/callback');
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo,
      skipBrowserRedirect: true,
    },
  });
  if (error) throw error;
  if (!data.url) throw new Error('URL OAuth mancante');

  const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
  if (result.type !== 'success' || !result.url) {
    throw new Error('Accesso Google annullato');
  }

  const url = new URL(result.url);
  const params = new URLSearchParams(
    url.hash.startsWith('#') ? url.hash.slice(1) : url.search.slice(1),
  );
  const accessToken = params.get('access_token');
  const refreshToken = params.get('refresh_token');
  const code = params.get('code');

  if (accessToken && refreshToken) {
    const { error: sessionError } = await supabase.auth.setSession({
      access_token: accessToken,
      refresh_token: refreshToken,
    });
    if (sessionError) throw sessionError;
    return;
  }

  if (code) {
    const { error: exchangeError } =
      await supabase.auth.exchangeCodeForSession(code);
    if (exchangeError) throw exchangeError;
    return;
  }

  throw new Error('Sessione Google non ricevuta');
}
