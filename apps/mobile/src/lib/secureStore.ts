import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

/**
 * SecureStore contiene il materiale di sessione (Spec V1 sez. 5.3).
 * MAI persistere access token in AsyncStorage in chiaro.
 */

const KEYS = {
  accessToken: 'cbi.session.accessToken',
  refreshToken: 'cbi.session.refreshToken',
} as const;

export interface SessionTokens {
  accessToken: string;
  refreshToken?: string;
}

function webStorage(): Storage | null {
  return typeof globalThis.sessionStorage === 'undefined'
    ? null
    : globalThis.sessionStorage;
}

export async function saveSession(tokens: SessionTokens): Promise<void> {
  if (Platform.OS === 'web') {
    webStorage()?.setItem(KEYS.accessToken, tokens.accessToken);
    if (tokens.refreshToken !== undefined) {
      webStorage()?.setItem(KEYS.refreshToken, tokens.refreshToken);
    }
    return;
  }
  await SecureStore.setItemAsync(KEYS.accessToken, tokens.accessToken);
  if (tokens.refreshToken !== undefined) {
    await SecureStore.setItemAsync(KEYS.refreshToken, tokens.refreshToken);
  }
}

export async function getAccessToken(): Promise<string | null> {
  if (Platform.OS === 'web') return webStorage()?.getItem(KEYS.accessToken) ?? null;
  return SecureStore.getItemAsync(KEYS.accessToken);
}

export async function getRefreshToken(): Promise<string | null> {
  if (Platform.OS === 'web') return webStorage()?.getItem(KEYS.refreshToken) ?? null;
  return SecureStore.getItemAsync(KEYS.refreshToken);
}

/** Logout / revoca: rimuove tutto il materiale di sessione. */
export async function clearSession(): Promise<void> {
  if (Platform.OS === 'web') {
    webStorage()?.removeItem(KEYS.accessToken);
    webStorage()?.removeItem(KEYS.refreshToken);
    return;
  }
  await SecureStore.deleteItemAsync(KEYS.accessToken);
  await SecureStore.deleteItemAsync(KEYS.refreshToken);
}
