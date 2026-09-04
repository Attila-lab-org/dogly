import React from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { QueryClientProvider } from '@tanstack/react-query';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { queryClient } from '../src/lib/queryClient';
import { colors } from '../src/theme/tokens';

/**
 * Root layout (Expo Router).
 * - TanStack Query provider (cache server scoped user+dog, sez. 5.3)
 * - Stack root: tab group + route modali/push della route map (sez. 5.2)
 * - L'auth gate è implementato in app/index.tsx: mock-driven via
 *   src/mocks/session.ts (sez. 7.1), da sostituire con la sessione Supabase
 *   in SecureStore quando il backend auth sarà collegato.
 */
export default function RootLayout() {
  return (
    <QueryClientProvider client={queryClient}>
      <SafeAreaProvider>
        <StatusBar style="dark" />
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: colors.background },
          }}
        >
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="(auth)" />
          <Stack.Screen name="paywall" options={{ presentation: 'modal' }} />
        </Stack>
      </SafeAreaProvider>
    </QueryClientProvider>
  );
}
