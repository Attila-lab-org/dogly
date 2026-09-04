import * as SecureStore from 'expo-secure-store';

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

export async function saveSession(tokens: SessionTokens): Promise<void> {
  await SecureStore.setItemAsync(KEYS.accessToken, tokens.accessToken);
  if (tokens.refreshToken !== undefined) {
    await SecureStore.setItemAsync(KEYS.refreshToken, tokens.refreshToken);
  }
}

export async function getAccessToken(): Promise<string | null> {
  return SecureStore.getItemAsync(KEYS.accessToken);
}

export async function getRefreshToken(): Promise<string | null> {
  return SecureStore.getItemAsync(KEYS.refreshToken);
}

/** Logout / revoca: rimuove tutto il materiale di sessione. */
export async function clearSession(): Promise<void> {
  await SecureStore.deleteItemAsync(KEYS.accessToken);
  await SecureStore.deleteItemAsync(KEYS.refreshToken);
}
