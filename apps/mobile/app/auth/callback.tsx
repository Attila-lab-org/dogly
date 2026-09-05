import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import * as Linking from 'expo-linking';
import { useRouter } from 'expo-router';

import { Button, ScreenContainer } from '@/components';
import { completeOAuthCallback } from '@/features/auth/actions';
import { colors, spacing, typography } from '@/theme/tokens';

export default function OAuthCallbackScreen() {
  const router = useRouter();
  const currentUrl = Linking.useURL();
  const started = useRef(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    void (async () => {
      try {
        const callbackUrl = currentUrl ?? (await Linking.getInitialURL());
        if (!callbackUrl) {
          throw new Error('URL di accesso mancante');
        }
        await completeOAuthCallback(callbackUrl);
        router.replace('/');
      } catch (err) {
        setError(
          err instanceof Error ? err.message : 'Accesso non completato',
        );
      }
    })();
  }, [currentUrl, router]);

  return (
    <ScreenContainer>
      <View style={styles.content}>
        {error ? (
          <>
            <Text style={styles.title}>Accesso non completato</Text>
            <Text style={styles.message}>{error}</Text>
            <Button
              title="Torna all’accesso"
              onPress={() => router.replace('/(auth)/sign-in')}
            />
          </>
        ) : (
          <>
            <ActivityIndicator size="large" color={colors.accent} />
            <Text style={styles.title}>Accesso in corso…</Text>
          </>
        )}
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
  },
  title: {
    fontSize: typography.size.xxl,
    fontWeight: typography.weight.bold,
    color: colors.text,
    textAlign: 'center',
  },
  message: {
    fontSize: typography.size.md,
    lineHeight: typography.size.md * typography.lineHeight.normal,
    color: colors.textMuted,
    textAlign: 'center',
  },
});
