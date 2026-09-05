import React, { useEffect } from 'react';
import { Stack, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { QueryClientProvider } from '@tanstack/react-query';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { SessionProvider } from '../src/features/auth/SessionProvider';
import { queryClient } from '../src/lib/queryClient';
import { configureCareNotifications } from '../src/features/care/notifications';
import { registerNotificationResponseHandler } from '../src/features/home/notificationLinks';
import { colors } from '../src/theme/tokens';

/**
 * Root layout (Expo Router).
 * - TanStack Query + SessionProvider (Supabase Auth → SecureStore)
 * - Auth gate in app/index.tsx
 * - Notifiche: handler di presentazione + deep link da data.href
 *   (reminder agenda '/care/<id>', "risultato pronto" '/behavior/result/<id>').
 *   In __DEV__/Expo Go entrambe sono no-op: mock gate invariato, niente
 *   scheduling in dev.
 */
export default function RootLayout() {
  const router = useRouter();

  useEffect(() => {
    void configureCareNotifications();
    return registerNotificationResponseHandler((href) => {
      router.push(href as never);
    });
  }, [router]);

  return (
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
            <Stack.Screen name="paywall" options={{ presentation: 'modal' }} />
          </Stack>
        </SessionProvider>
      </SafeAreaProvider>
    </QueryClientProvider>
  );
}
