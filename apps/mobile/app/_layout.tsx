import React, { useEffect } from 'react';
import { Stack, useRouter } from 'expo-router';
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
import { registerNotificationResponseHandler } from '../src/features/home/notificationLinks';
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
 * - Auth gate in app/index.tsx
 * - Notifiche: handler di presentazione + deep link da data.href
 *   (reminder agenda '/care/<id>', "risultato pronto" '/behavior/result/<id>').
 *   In __DEV__/Expo Go entrambe sono no-op: mock gate invariato, niente
 *   scheduling in dev.
 */
function RootLayout() {
  const router = useRouter();

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
    return registerNotificationResponseHandler((href) => {
      router.push(href as never);
    });
  }, [router]);

  return (
    <AppErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <SafeAreaProvider>
          <SessionProvider>
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
