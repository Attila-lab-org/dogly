/**
 * Sessione reale Supabase Auth + sync SecureStore per apiClient (sez. 5.3 / 7.1).
 * Gate: unauthenticated | authenticated-no-dog | authenticated-with-dog.
 */
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import type { Session } from '@supabase/supabase-js';
import { AppState, type AppStateStatus } from 'react-native';

import { api } from '../../lib/apiClient';
import {
  clearProtectedCache,
  queryClient,
  queryKeys,
} from '../../lib/queryClient';
import {
  clearSession,
  saveSession,
} from '../../lib/secureStore';
import { getSupabaseClient, isSupabaseConfigured } from '../../lib/supabase';
import { recoverAndDrainUploads } from '../behavior/upload';
import {
  isApiConfigured,
  shouldUseMockAuthGate,
} from './env';
import {
  resolveEntryRoute,
  sessionMock,
  type EntryRoute,
  type SessionState,
} from '../../mocks/session';

type DogListResponse = { items: Array<{ id: string; name: string }> };

export type SessionContextValue = {
  /** Bootstrapping auth + dogs */
  loading: boolean;
  session: Session | null;
  userId: string | null;
  sessionState: SessionState;
  entryRoute: EntryRoute;
  hasDog: boolean;
  primaryDogId: string | null;
  /** Env real auth disponibile */
  authConfigured: boolean;
  /** __DEV__ fallback quando manca env */
  usingMockGate: boolean;
  refreshDogs: () => Promise<void>;
  signOut: () => Promise<void>;
  /** Dopo create dog: aggiorna gate senza re-login */
  markDogCreated: (dogId: string) => void;
};

const SessionContext = createContext<SessionContextValue | null>(null);

async function syncTokensFromSession(session: Session | null): Promise<void> {
  if (!session?.access_token) {
    await clearSession();
    return;
  }
  await saveSession({
    accessToken: session.access_token,
    refreshToken: session.refresh_token,
  });
}

async function fetchHasDog(): Promise<{ hasDog: boolean; primaryDogId: string | null }> {
  if (!isApiConfigured()) {
    return { hasDog: false, primaryDogId: null };
  }
  try {
    const list = await api.get<DogListResponse>('/v1/dogs');
    const first = list.items[0];
    return {
      hasDog: list.items.length > 0,
      primaryDogId: first?.id ?? null,
    };
  } catch {
    return { hasDog: false, primaryDogId: null };
  }
}

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const usingMockGate = shouldUseMockAuthGate();
  const authConfigured = isSupabaseConfigured();

  const [loading, setLoading] = useState(!usingMockGate);
  const [session, setSession] = useState<Session | null>(null);
  const [hasDog, setHasDog] = useState(false);
  const [primaryDogId, setPrimaryDogId] = useState<string | null>(null);

  const refreshDogs = useCallback(async () => {
    if (!session?.user?.id) {
      setHasDog(false);
      setPrimaryDogId(null);
      return;
    }
    const result = await fetchHasDog();
    setHasDog(result.hasDog);
    setPrimaryDogId(result.primaryDogId);
    if (result.hasDog && session.user.id) {
      await queryClient.invalidateQueries({
        queryKey: queryKeys.dogs(session.user.id),
      });
    }
  }, [session?.user?.id]);

  const applySession = useCallback(async (next: Session | null) => {
    await syncTokensFromSession(next);
    setSession(next);
    if (!next?.user?.id) {
      setHasDog(false);
      setPrimaryDogId(null);
      return;
    }
    const dogs = await fetchHasDog();
    setHasDog(dogs.hasDog);
    setPrimaryDogId(dogs.primaryDogId);
    void recoverAndDrainUploads(next.user.id);
  }, []);

  useEffect(() => {
    if (usingMockGate) {
      setLoading(false);
      return;
    }
    if (!authConfigured) {
      setLoading(false);
      return;
    }

    let cancelled = false;
    const supabase = getSupabaseClient();

    (async () => {
      const { data } = await supabase.auth.getSession();
      if (cancelled) return;
      await applySession(data.session);
      if (!cancelled) setLoading(false);
    })();

    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      void (async () => {
        await applySession(next);
        if (!cancelled) setLoading(false);
      })();
    });

    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, [authConfigured, usingMockGate, applySession]);

  // Ripresa upload dopo background / restart
  useEffect(() => {
    const userId = session?.user?.id;
    if (!userId) return;

    const onChange = (state: AppStateStatus) => {
      if (state === 'active') {
        void recoverAndDrainUploads(userId);
      }
    };
    const sub = AppState.addEventListener('change', onChange);
    return () => sub.remove();
  }, [session?.user?.id]);

  const signOut = useCallback(async () => {
    clearProtectedCache();
    await clearSession();
    setHasDog(false);
    setPrimaryDogId(null);
    setSession(null);
    if (authConfigured) {
      try {
        await getSupabaseClient().auth.signOut();
      } catch {
        // già pulito localmente
      }
    }
  }, [authConfigured]);

  const markDogCreated = useCallback((dogId: string) => {
    setHasDog(true);
    setPrimaryDogId(dogId);
  }, []);

  const sessionState: SessionState = useMemo(() => {
    if (usingMockGate) return sessionMock;
    if (!session?.user) return 'unauthenticated';
    if (!hasDog) return 'authenticated-no-dog';
    return 'authenticated-with-dog';
  }, [usingMockGate, session?.user, hasDog]);

  const value = useMemo<SessionContextValue>(
    () => ({
      loading,
      session,
      userId: session?.user?.id ?? null,
      sessionState,
      entryRoute: resolveEntryRoute(sessionState),
      hasDog,
      primaryDogId,
      authConfigured,
      usingMockGate,
      refreshDogs,
      signOut,
      markDogCreated,
    }),
    [
      loading,
      session,
      sessionState,
      hasDog,
      primaryDogId,
      authConfigured,
      usingMockGate,
      refreshDogs,
      signOut,
      markDogCreated,
    ],
  );

  return (
    <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
  );
}

export function useSession(): SessionContextValue {
  const ctx = useContext(SessionContext);
  if (!ctx) {
    throw new Error('useSession deve essere usato dentro SessionProvider');
  }
  return ctx;
}
