import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

import {
  getSupabasePublishableKey,
  getSupabaseUrl,
  isSupabaseConfigured,
} from '../features/auth/env';

/**
 * Supabase Auth storage → SecureStore nativo / localStorage web. Sul web la
 * sessione deve restare disponibile tra schede e ricaricamenti, così l'accesso
 * non ricompare ogni volta che si apre una pagina nuova. Valori lunghi spezzati
 * in chunk (limite SecureStore ~2KB).
 */

const CHUNK = 1800;

const webAuthStorage = {
  async getItem(key: string): Promise<string | null> {
    const local = globalThis.localStorage?.getItem(key);
    if (local !== null && local !== undefined) return local;

    // Migrazione trasparente delle sessioni create dalle versioni precedenti.
    const legacy = globalThis.sessionStorage?.getItem(key);
    if (legacy !== null && legacy !== undefined) {
      globalThis.localStorage?.setItem(key, legacy);
      return legacy;
    }
    return null;
  },
  async setItem(key: string, value: string): Promise<void> {
    globalThis.localStorage?.setItem(key, value);
    globalThis.sessionStorage?.removeItem(key);
  },
  async removeItem(key: string): Promise<void> {
    globalThis.localStorage?.removeItem(key);
    globalThis.sessionStorage?.removeItem(key);
  },
};

const secureAuthStorage = {
  async getItem(key: string): Promise<string | null> {
    const meta = await SecureStore.getItemAsync(key);
    if (meta === null) return null;
    const chunks = Number(meta);
    if (!Number.isFinite(chunks) || chunks <= 0) return meta;
    const parts: string[] = [];
    for (let i = 0; i < chunks; i += 1) {
      const part = await SecureStore.getItemAsync(`${key}.${i}`);
      if (part === null) return null;
      parts.push(part);
    }
    return parts.join('');
  },
  async setItem(key: string, value: string): Promise<void> {
    await clearStaleChunks(key);
    if (value.length <= CHUNK) {
      await SecureStore.setItemAsync(key, value);
      return;
    }
    const count = Math.ceil(value.length / CHUNK);
    await SecureStore.setItemAsync(key, String(count));
    for (let i = 0; i < count; i += 1) {
      await SecureStore.setItemAsync(
        `${key}.${i}`,
        value.slice(i * CHUNK, (i + 1) * CHUNK),
      );
    }
  },
  async removeItem(key: string): Promise<void> {
    const meta = await SecureStore.getItemAsync(key);
    if (meta !== null) {
      const chunks = Number(meta);
      if (Number.isFinite(chunks) && chunks > 0) {
        for (let i = 0; i < chunks; i += 1) {
          await SecureStore.deleteItemAsync(`${key}.${i}`);
        }
      }
    }
    await SecureStore.deleteItemAsync(key);
  },
};

async function clearStaleChunks(key: string): Promise<void> {
  const meta = await SecureStore.getItemAsync(key);
  const chunks = Number(meta);
  if (!Number.isFinite(chunks) || chunks <= 0) return;
  for (let i = 0; i < chunks; i += 1) {
    await SecureStore.deleteItemAsync(`${key}.${i}`);
  }
}

type DoglyGlobal = typeof globalThis & {
  __doglySupabaseClient?: SupabaseClient;
};

const doglyGlobal = globalThis as DoglyGlobal;
let client: SupabaseClient | undefined = doglyGlobal.__doglySupabaseClient;

export { isSupabaseConfigured };

export function getSupabaseClient(): SupabaseClient {
  if (client) return client;

  const url = getSupabaseUrl();
  const publishableKey = getSupabasePublishableKey();

  if (!url || !publishableKey) {
    throw new Error(
      'Supabase non configurato: mancano EXPO_PUBLIC_SUPABASE_URL o EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY (o ANON).',
    );
  }

  client = createClient(url, publishableKey, {
    auth: {
      storage: Platform.OS === 'web' ? webAuthStorage : secureAuthStorage,
      autoRefreshToken: true,
      persistSession: true,
      flowType: 'pkce',
      // The callback route exchanges the PKCE code explicitly. Keeping
      // Supabase's automatic URL detector enabled here would race that
      // exchange and consume the one-time code before the route can finish.
      detectSessionInUrl: false,
    },
  });
  // Fast Refresh può rivalutare il modulo sul web. Conservare il client sul
  // global evita più GoTrueClient concorrenti sulla stessa chiave OAuth.
  doglyGlobal.__doglySupabaseClient = client;

  return client;
}
