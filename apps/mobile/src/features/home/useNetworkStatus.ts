/**
 * Monitor reale della connettività (expo-network): stato iniziale,
 * listener nativo addNetworkStateListener, ricontrollo al ritorno in
 * foreground e refresh manuale per il retry del banner offline (sez. 6).
 * Se la piattaforma non espone isConnected, conserva l'ultimo stato noto.
 */
import { useCallback, useEffect, useState } from 'react';
import { AppState } from 'react-native';
import * as Network from 'expo-network';

export interface NetworkStatus {
  /** true = banner offline visibile */
  offline: boolean;
  /** Ricontrolla davvero la rete (retry del banner) */
  refresh: () => Promise<void>;
}

function isOfflineState(state: Network.NetworkState): boolean | null {
  if (state.isConnected === false) return true;
  if (state.isConnected === true && state.isInternetReachable === false) return true;
  if (state.isConnected === true) return false;
  return null;
}

export function useNetworkStatus(): NetworkStatus {
  const [offline, setOffline] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const state = await Network.getNetworkStateAsync();
      const next = isOfflineState(state);
      if (next !== null) setOffline(next);
    } catch {
      // lettura non disponibile: conserva l'ultimo stato noto
    }
  }, []);

  useEffect(() => {
    void refresh();
    const networkSub = Network.addNetworkStateListener((event) => {
      const next = isOfflineState(event);
      if (next !== null) setOffline(next);
    });
    const appSub = AppState.addEventListener('change', (status) => {
      if (status === 'active') void refresh();
    });
    return () => {
      networkSub.remove();
      appSub.remove();
    };
  }, [refresh]);

  return { offline, refresh };
}
