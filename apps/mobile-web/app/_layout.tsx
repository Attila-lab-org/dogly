import React, { useEffect } from 'react';
import { Platform } from 'react-native';
import { Stack, usePathname } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { onlineManager, QueryClientProvider } from '@tanstack/react-query';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import {
  addNetworkStateListener,
  getNetworkStateAsync,
} from 'expo-network';
import * as Sentry from '@sentry/react-native';
import { SessionProvider } from '../src/features/auth/SessionProvider';
import { queryClient } from '../src/lib/queryClient';
import { configureCareNotifications } from '../src/features/care/notifications';
import { NotificationNavigator } from '../src/features/home/NotificationNavigator';
import { applyAvailableUpdate } from '../src/features/updates/applyAvailableUpdate';
import { colors } from '../src/theme/tokens';
import { AppErrorBoundary } from '../src/components/AppErrorBoundary';

const sentryDsn = process.env.EXPO_PUBLIC_SENTRY_DSN;
if (sentryDsn) {
  Sentry.init({
    dsn: sentryDsn,
    enableAutoSessionTracking: true,
  });
}

/**
 * Root layout (Expo Router).
 * - TanStack Query + SessionProvider (Supabase Auth → SecureStore)
 * - Auth gate in app/index.tsx (consuma anche i deep link da notifica
 *   in cold-start tramite NotificationNavigator + pendingNotificationHref)
 * - Notifiche: handler di presentazione + deep link da data.href
 *   (reminder agenda '/care/<id>', "risultato pronto" '/behavior/result/<id>').
 *   In __DEV__/Expo Go entrambe sono no-op: mock gate invariato, niente
 *   scheduling in dev.
 */
/**
 * Expo Router / RN Web marks off-screen stacks with aria-hidden while the
 * tapped button can keep focus. Chrome then warns. On a hidden ancestor we
 * blur; on a visible one we drop the incorrect aria-hidden.
 */
function repairWebAriaHiddenFocus() {
  if (Platform.OS !== 'web' || typeof document === 'undefined') return;
  const active = document.activeElement;
  if (!(active instanceof HTMLElement) || active === document.body) return;
  let node: HTMLElement | null = active.parentElement;
  while (node) {
    if (node.getAttribute('aria-hidden') === 'true') {
      if (window.getComputedStyle(node).display === 'none') {
        active.blur();
        return;
      }
      node.removeAttribute('aria-hidden');
    }
    node = node.parentElement;
  }
}

function RootLayout() {
  const pathname = usePathname();

  useEffect(() => {
    repairWebAriaHiddenFocus();
  }, [pathname]);

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;
    const observer = new MutationObserver(repairWebAriaHiddenFocus);
    observer.observe(document.body, {
      attributes: true,
      subtree: true,
      attributeFilter: ['aria-hidden'],
    });
    document.addEventListener('focusin', repairWebAriaHiddenFocus, true);
    return () => {
      observer.disconnect();
      document.removeEventListener('focusin', repairWebAriaHiddenFocus, true);
    };
  }, []);

  useEffect(() => {
    const setOnline = (state: {
      isConnected?: boolean | null;
      isInternetReachable?: boolean | null;
    }) => {
      onlineManager.setOnline(
        state.isConnected !== false && state.isInternetReachable !== false,
      );
    };
    void getNetworkStateAsync().then(setOnline).catch(() => undefined);
    const subscription = addNetworkStateListener(setOnline);
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    void applyAvailableUpdate().catch((error) => {
      Sentry.captureException(error, {
        tags: { subsystem: 'eas-update' },
      });
    });
  }, []);

  useEffect(() => {
    void configureCareNotifications();
  }, []);

  return (
    <AppErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <SafeAreaProvider>
          <SessionProvider>
            <NotificationNavigator />
            <StatusBar style="dark" />
            <Stack
              screenOptions={{
                headerShown: false,
                freezeOnBlur: true,
                contentStyle: { backgroundColor: colors.background },
              }}
            >
              <Stack.Screen name="(tabs)" />
              <Stack.Screen name="auth/callback" />
              <Stack.Screen name="connection-error" />
              <Stack.Screen name="paywall" options={{ presentation: 'modal' }} />
            </Stack>
          </SessionProvider>
        </SafeAreaProvider>
      </QueryClientProvider>
    </AppErrorBoundary>
  );
}

export default Sentry.wrap(RootLayout);
