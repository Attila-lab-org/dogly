import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Platform, StyleSheet, Text, View } from 'react-native';
import * as Linking from 'expo-linking';
import { useRouter } from 'expo-router';

import { Button, ScreenContainer } from '@/components';
import { completeOAuthCallback } from '@/features/auth/actions';
import { resolveAuthCallbackUrl } from '@/features/auth/oauthCallback';
import { useSession } from '@/features/auth/SessionProvider';
import { colors, spacing, typography } from '@/theme/tokens';

const CALLBACK_TIMEOUT_MS = 10_000;

export default function OAuthCallbackScreen() {
  const router = useRouter();
  const linkingUrl = Linking.useURL();
  const { session } = useSession();
  const started = useRef(false);
  const [error, setError] = useState<string | null>(null);

  // openAuthSessionAsync può completare la sessione prima che Expo Router
  // consegni il deep link a questa route. In quel caso la sessione è la fonte
  // autorevole: non mostrare un falso errore di callback.
  useEffect(() => {
    if (session?.user) {
      router.replace('/');
    }
  }, [router, session?.user]);

  useEffect(() => {
    if (started.current) return;
    let cancelled = false;

    void (async () => {
      try {
        const callbackUrl = resolveAuthCallbackUrl({
          platform: Platform.OS,
          browserHref:
            typeof globalThis.location === 'undefined'
              ? null
              : globalThis.location.href,
          linkingUrl: linkingUrl ?? (await Linking.getInitialURL()),
        });
        if (!callbackUrl) {
          // Linking.useURL() parte spesso da null su Android e si aggiorna
          // subito dopo. Non consumare il tentativo: l'effect ripartirà
          // quando il deep link sarà disponibile.
          return;
        }
        if (cancelled || started.current) return;
        started.current = true;
        await completeOAuthCallback(callbackUrl);
        if (cancelled) return;
        router.replace('/');
      } catch (err) {
        if (cancelled) return;
        setError(
          err instanceof Error ? err.message : 'Accesso non completato',
        );
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [linkingUrl, router]);

  useEffect(() => {
    if (session?.user || started.current || error) return;
    const timeout = setTimeout(() => {
      if (!started.current) {
        setError('Il ritorno da Google non è arrivato. Riprova l’accesso.');
      }
    }, CALLBACK_TIMEOUT_MS);
    return () => clearTimeout(timeout);
  }, [error, session?.user]);

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
