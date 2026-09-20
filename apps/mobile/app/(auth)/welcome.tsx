/**
 * Welcome (Spec V1 sez. 6, 7.1.1) — brand Dogly + Google / Apple (solo iOS,
 * ADR-001) / email OTP (vale sia per accedere sia per creare l'account).
 */
import React, { useEffect, useState } from 'react';
import { Image, Platform, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as AppleAuthentication from 'expo-apple-authentication';
import { Button, ScreenContainer } from '@/components';
import { colors, gradients, radius, shadows, spacing, typography } from '@/theme/tokens';
import { useSession } from '@/features/auth/SessionProvider';
import {
  mapAuthError,
  signInWithApple,
  signInWithGoogle,
} from '@/features/auth/actions';
import { shouldOfferAppleSignIn } from '@/features/auth/appleSignIn';

const logoMarkSource = require('../../assets/brand/dogly-logo-mark.png');

export default function WelcomeScreen() {
  const router = useRouter();
  const { sessionState, usingMockGate, loading, authConfigured } = useSession();
  const [busy, setBusy] = useState<'google' | 'apple' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [appleAvailable, setAppleAvailable] = useState(false);

  useEffect(() => {
    if (Platform.OS !== 'ios') return;
    let mounted = true;
    AppleAuthentication.isAvailableAsync()
      .then((available) => {
        if (mounted) setAppleAvailable(available);
      })
      .catch(() => undefined);
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (loading) return;
    if (sessionState === 'authenticated-no-dog') {
      router.replace('/onboarding/dog');
    } else if (sessionState === 'authenticated-with-dog') {
      router.replace('/(tabs)/home');
    }
  }, [sessionState, loading, router]);

  const enterMock = () => {
    router.replace('/(tabs)/home');
  };

  const errorMessage = (err: unknown) =>
    mapAuthError(err) === 'offline'
      ? 'Sei offline. Riprova quando hai connessione.'
      : 'Accesso non riuscito. Riprova.';

  const configIncomplete = !usingMockGate && !authConfigured;

  const oauth = async () => {
    if (usingMockGate) {
      enterMock();
      return;
    }
    if (configIncomplete) {
      return;
    }
    setError(null);
    setBusy('google');
    try {
      await signInWithGoogle();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(null);
    }
  };

  const oauthApple = async () => {
    // Mock gate dev: stesso comportamento della demo Google.
    if (usingMockGate) {
      enterMock();
      return;
    }
    if (configIncomplete) {
      return;
    }
    setError(null);
    setBusy('apple');
    try {
      await signInWithApple();
    } catch (err) {
      if (err instanceof Error && err.message.includes('annullat')) {
        return; // annullamento utente: nessun errore da mostrare
      }
      setError(errorMessage(err));
    } finally {
      setBusy(null);
    }
  };

  const showApple = shouldOfferAppleSignIn(Platform.OS, appleAvailable);

  return (
    <ScreenContainer
      style={styles.safe}
      contentStyle={styles.screen}
      padded={false}
    >
      <LinearGradient
        colors={[...gradients.authWash]}
        locations={[0, 0.45, 1]}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <View style={styles.content}>
        <View style={styles.hero}>
          <View style={styles.logoBadge}>
            <Image
              source={logoMarkSource}
              style={styles.logoMark}
              resizeMode="contain"
              accessibilityLabel="Dogly"
            />
          </View>
          <Text style={styles.wordmark}>DOGLY</Text>
          <Text style={styles.tagline}>Il tuo cane, finalmente capito.</Text>
          <Text style={styles.promise}>
            Mostra un momento del tuo cane. Ti aiuto a capirlo con parole semplici.
          </Text>
        </View>

        <View style={styles.footer}>
          {configIncomplete ? (
            <Text style={styles.error}>
              Configurazione incompleta: mancano le variabili Supabase. Contatta
              l’amministratore.
            </Text>
          ) : error ? (
            <Text style={styles.error}>{error}</Text>
          ) : null}
          <View style={styles.actions}>
            <Button
              title="Continua con Google"
              variant="primary"
              loading={busy === 'google'}
              disabled={busy !== null || configIncomplete}
              onPress={() => void oauth()}
              icon={
                <Ionicons name="logo-google" size={19} color={colors.textOnPrimary} />
              }
              testID="welcome-google"
            />
            {showApple ? (
              <Button
                title="Continua con Apple"
                variant="secondary"
                loading={busy === 'apple'}
                disabled={busy !== null || configIncomplete}
                onPress={() => void oauthApple()}
                icon={
                  <Ionicons name="logo-apple" size={19} color={colors.textOnPrimary} />
                }
                testID="welcome-apple"
              />
            ) : null}
            <Button
              title="Continua con email"
              variant="outline"
              disabled={busy !== null}
              onPress={() => router.push('/(auth)/sign-in')}
              testID="welcome-register"
            />
          </View>
          <Text style={styles.terms}>
            Continuando accetti i termini e l'informativa privacy del servizio.
          </Text>
        </View>
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  safe: {
    backgroundColor: '#FFFFFF',
  },
  screen: {
    flex: 1,
  },
  content: {
    flex: 1,
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xxxl * 2,
    paddingBottom: spacing.xl,
  },
  hero: {
    alignItems: 'center',
    gap: spacing.md,
  },
  logoBadge: {
    width: 132,
    height: 132,
    borderRadius: radius.full,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.raised,
  },
  logoMark: {
    width: 96,
    height: 71,
  },
  wordmark: {
    marginTop: spacing.sm,
    fontSize: typography.size.xxl,
    fontWeight: typography.weight.bold,
    color: '#1A2B48',
    letterSpacing: 5,
  },
  tagline: {
    fontSize: typography.size.md,
    fontWeight: typography.weight.medium,
    color: '#2DAAAB',
    letterSpacing: 0.4,
    textAlign: 'center',
  },
  promise: {
    maxWidth: 320,
    marginTop: spacing.xs,
    color: colors.textSecondary,
    fontSize: typography.size.sm,
    lineHeight: typography.size.sm * typography.lineHeight.relaxed,
    textAlign: 'center',
  },
  footer: {
    paddingBottom: spacing.md,
  },
  error: {
    marginBottom: spacing.md,
    color: colors.danger,
    textAlign: 'center',
    fontSize: typography.size.sm,
  },
  actions: {
    gap: spacing.md,
  },
  terms: {
    marginTop: spacing.lg,
    marginBottom: spacing.md,
    fontSize: typography.size.xs,
    color: colors.textMuted,
    textAlign: 'center',
    lineHeight: typography.size.xs * typography.lineHeight.relaxed,
  },
});
