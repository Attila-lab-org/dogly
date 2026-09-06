import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

import {
  getSupabasePublishableKey,
  getSupabaseUrl,
  isSupabaseConfigured,
} from '../features/auth/env';

/**
 * Supabase Auth storage → SecureStore (Spec V1 sez. 5.3).
 * Valori lunghi spezzati in chunk (limite SecureStore ~2KB su Android).
 */

const CHUNK = 1800;

const webAuthStorage = {
  async getItem(key: string): Promise<string | null> {
    return globalThis.localStorage?.getItem(key) ?? null;
  },
  async setItem(key: string, value: string): Promise<void> {
    globalThis.localStorage?.setItem(key, value);
  },
  async removeItem(key: string): Promise<void> {
    globalThis.localStorage?.removeItem(key);
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

let client: SupabaseClient | undefined;

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
      detectSessionInUrl: false,
    },
  });

  return client;
}
