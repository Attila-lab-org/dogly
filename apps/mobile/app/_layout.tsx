import React from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { QueryClientProvider } from '@tanstack/react-query';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { SessionProvider } from '../src/features/auth/SessionProvider';
import { queryClient } from '../src/lib/queryClient';
import { colors } from '../src/theme/tokens';

/**
 * Root layout (Expo Router).
 * - TanStack Query + SessionProvider (Supabase Auth → SecureStore)
 * - Auth gate in app/index.tsx
 */
export default function RootLayout() {
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
