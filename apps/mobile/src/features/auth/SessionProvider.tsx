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
  useRef,
  useState,
} from 'react';
import type { Session } from '@supabase/supabase-js';
import { AppState, type AppStateStatus } from 'react-native';
import { addNetworkStateListener } from 'expo-network';

import { api, ApiError } from '../../lib/apiClient';
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
import {
  clearUploadsForUser,
  recoverAndDrainUploads,
} from '../behavior/upload';
import { clearCareState } from '../care/store';
import { isApiConfigured } from './env';
import {
  resolveEntryRoute,
  type EntryRoute,
  type SessionState,
} from './sessionRouting';

type DogListResponse = { items: Array<{ id: string; name: string }> };
type DogLookupResult = {
  reachable: boolean;
  hasDog: boolean;
  primaryDogId: string | null;
  /** 401/403 dal backend: sessione non valida, va ri-autenticata. */
  authFailed: boolean;
};

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
  /** Kept for API compatibility; always false in the real-only runtime. */
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

async function fetchHasDog(): Promise<DogLookupResult> {
  if (!isApiConfigured()) {
    return {
      reachable: false,
      hasDog: false,
      primaryDogId: null,
      authFailed: false,
    };
  }
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const list = await api.get<DogListResponse>('/v1/dogs');
      const first = list.items[0];
      return {
        reachable: true,
        hasDog: list.items.length > 0,
        primaryDogId: first?.id ?? null,
        authFailed: false,
      };
    } catch (error) {
      if (
        error instanceof ApiError &&
        (error.status === 401 || error.status === 403)
      ) {
        // Token non valido: non è un problema di connessione.
        // Il chiamante gestirà il sign-out.
        return {
          reachable: false,
          hasDog: false,
          primaryDogId: null,
          authFailed: true,
        };
      }
      if (attempt < 2) {
        await new Promise((resolve) =>
          setTimeout(resolve, attempt === 0 ? 250 : 750),
        );
      }
    }
  }
  return {
    reachable: false,
    hasDog: false,
    primaryDogId: null,
    authFailed: false,
  };
}

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const usingMockGate = false;
  const authConfigured = isSupabaseConfigured();

  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState<Session | null>(null);
  const sessionUserIdRef = useRef<string | null>(null);
  sessionUserIdRef.current = session?.user?.id ?? null;
  const [hasDog, setHasDog] = useState(false);
  const [primaryDogId, setPrimaryDogId] = useState<string | null>(null);
  const [dogStatusUnknown, setDogStatusUnknown] = useState(false);

  /**
   * Sign-out condiviso: pulisce cache, token, stato care (notifiche fantasma)
   * e resetta lo stato sessione. Usato sia dal pulsante "Esci" sia dal
   * rilevamento di token non validi (401/403 su /v1/dogs).
   */
  const doSignOut = useCallback(async () => {
    clearProtectedCache();
    if (sessionUserIdRef.current) {
      await clearUploadsForUser(sessionUserIdRef.current).catch(() => {
        // Logout must continue even if the OS already removed a local file.
      });
    }
    await clearSession();
    await clearCareState();
    setHasDog(false);
    setPrimaryDogId(null);
    setDogStatusUnknown(false);
    setSession(null);
    if (authConfigured) {
      try {
        await getSupabaseClient().auth.signOut();
      } catch {
        // già pulito localmente
      }
    }
  }, [authConfigured]);

  const refreshDogs = useCallback(async () => {
    if (!session?.user?.id) {
      setHasDog(false);
      setPrimaryDogId(null);
      setDogStatusUnknown(false);
      return;
    }
    const result = await fetchHasDog();
    if (result.authFailed) {
      // Sessione non valida: forza il sign-out invece di mostrare
      // la schermata "connection-error" (che è per problemi di rete).
      void doSignOut();
      return;
    }
    if (!result.reachable) {
      setDogStatusUnknown(true);
      return;
    }
    setDogStatusUnknown(false);
    setHasDog(result.hasDog);
    setPrimaryDogId(result.primaryDogId);
    if (result.hasDog && session.user.id) {
      await queryClient.invalidateQueries({
        queryKey: queryKeys.dogs(session.user.id),
      });
    }
  }, [session?.user?.id, doSignOut]);

  /**
   * Sync leggero: aggiorna solo i token in SecureStore per l'apiClient.
   * Da chiamare su ogni evento auth (incluso TOKEN_REFRESHED) senza
   * eseguire il bootstrap pesante (GET /v1/dogs, drain upload, push token).
   */
  const syncTokens = useCallback(async (next: Session | null) => {
    await syncTokensFromSession(next);
  }, []);

  /**
   * Bootstrap pesante: sync token + lookup dogs + drain upload + push token.
   * Da chiamare solo su SIGNED_IN / SIGNED_OUT / al boot, NON su TOKEN_REFRESHED
   * (altrimenti ogni refresh orario rilancia GET /v1/dogs e, su rete ballerina,
   * degrada la sessione a dog-status-unknown).
   */
  const bootstrapSession = useCallback(
    async (next: Session | null) => {
      await syncTokensFromSession(next);
      if (!next?.user?.id) {
        setSession(null);
        setHasDog(false);
        setPrimaryDogId(null);
        setDogStatusUnknown(false);
        return;
      }
      const dogs = await fetchHasDog();
      if (dogs.authFailed) {
        // Token non valido: forza il sign-out.
        void doSignOut();
        return;
      }
      setSession(next);
      if (!dogs.reachable) {
        setHasDog(false);
        setPrimaryDogId(null);
        setDogStatusUnknown(true);
        return;
      }
      setDogStatusUnknown(false);
      setHasDog(dogs.hasDog);
      setPrimaryDogId(dogs.primaryDogId);
      void recoverAndDrainUploads(next.user.id).catch(() => undefined);
      const { ensureServiceTermsRecorded } = await import('../privacy/consents');
      const { registerDevicePushToken } = await import(
        '../notifications/pushToken'
      );
      void ensureServiceTermsRecorded().then(() => registerDevicePushToken());
    },
    [doSignOut],
  );

  useEffect(() => {
    if (!authConfigured) {
      setLoading(false);
      return;
    }

    let cancelled = false;
    const supabase = getSupabaseClient();

    (async () => {
      try {
        const { data } = await supabase.auth.getSession();
        if (cancelled) return;
        await bootstrapSession(data.session);
      } catch {
        if (!cancelled) {
          setSession(null);
          setHasDog(false);
          setPrimaryDogId(null);
          setDogStatusUnknown(false);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    const { data: sub } = supabase.auth.onAuthStateChange((event, next) => {
      // TOKEN_REFRESHED: aggiorna solo i token (sync leggero). Il bootstrap
      // pesante è già stato fatto al SIGNED_IN/INITIAL_SESSION; rilanciarlo
      // ad ogni refresh orario causerebbe GET /v1/dogs ripetute e, su rete
      // ballerina, degradi a dog-status-unknown durante l'uso dell'app.
      if (event === 'TOKEN_REFRESHED') {
        void syncTokens(next);
        return;
      }
      // INITIAL_SESSION è già gestito dalla getSession() esplicita sopra;
      // saltarlo evita un doppio bootstrap al boot.
      if (event === 'INITIAL_SESSION') return;

      if (event === 'SIGNED_IN') setLoading(true);
      void (async () => {
        try {
          await bootstrapSession(next);
        } catch {
          if (!cancelled) {
            setSession(next);
            setHasDog(false);
            setPrimaryDogId(null);
            setDogStatusUnknown(Boolean(next?.user));
          }
        } finally {
          if (!cancelled) setLoading(false);
        }
      })();
    });

    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, [authConfigured, bootstrapSession, syncTokens]);

  // Ripresa upload dopo background / restart
  useEffect(() => {
    const userId = session?.user?.id;
    if (!userId) return;

    const onChange = (state: AppStateStatus) => {
      if (state === 'active') {
        void recoverAndDrainUploads(userId);
      }
    };
    const appStateSub = AppState.addEventListener('change', onChange);
    const networkSub = addNetworkStateListener((state) => {
      if (state.isConnected && state.isInternetReachable !== false) {
        void recoverAndDrainUploads(userId);
      }
    });
    return () => {
      appStateSub.remove();
      networkSub.remove();
    };
  }, [session?.user?.id]);

  const signOut = doSignOut;

  const markDogCreated = useCallback((dogId: string) => {
    setHasDog(true);
    setPrimaryDogId(dogId);
    setDogStatusUnknown(false);
  }, []);

  const sessionState: SessionState = useMemo(() => {
    if (!session?.user) return 'unauthenticated';
    if (dogStatusUnknown) return 'authenticated-dog-status-unknown';
    if (!hasDog) return 'authenticated-no-dog';
    return 'authenticated-with-dog';
  }, [session?.user, dogStatusUnknown, hasDog]);

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
