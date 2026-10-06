import React, { useEffect } from 'react';
import { Stack } from 'expo-router';
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
import { hydrateNotificationPreferences } from '../src/features/notifications/store';
import { hydrateCheckIn } from '../src/features/checkin/store';
import { useDogProfile } from '../src/features/core/useDogProfile';
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
function RuntimeHydration() {
  const { dog } = useDogProfile();

  useEffect(() => {
    if (!dog.id) return;
    void hydrateCheckIn(dog.id);
  }, [dog.id]);

  useEffect(() => {
    void hydrateNotificationPreferences().then(() => configureCareNotifications());
  }, []);

  return null;
}

function RootLayout() {
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

  return (
    <AppErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <SafeAreaProvider>
          <SessionProvider>
            <RuntimeHydration />
            <NotificationNavigator />
            <StatusBar style="dark" />
            <Stack
              screenOptions={{
                headerShown: false,
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
