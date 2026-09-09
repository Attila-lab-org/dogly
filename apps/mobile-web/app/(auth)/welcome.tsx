/**
 * Welcome (Spec V1 sez. 6, 7.1.1) — brand Dogly + Google / Apple (solo iOS,
 * ADR-001) / email OTP (vale sia per accedere sia per creare l'account).
 */
import React, { useEffect, useState } from 'react';
import { Image, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as AppleAuthentication from 'expo-apple-authentication';
import { Button, ScreenContainer } from '@/components';
import { colors, radius, shadows, spacing, typography } from '@/theme/tokens';
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
  const { sessionState, usingMockGate, loading } = useSession();
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

  const oauth = async () => {
    if (usingMockGate) {
      enterMock();
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
    <ScreenContainer contentStyle={styles.screen}>
      <LinearGradient
        colors={['#DCEBFE', 'rgba(220, 235, 254, 0)']}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={styles.heroWash}
      />
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
      </View>

      <View style={styles.footer}>
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <View style={styles.actions}>
          <Button
            title="Continua con Google"
            variant="primary"
            loading={busy === 'google'}
            disabled={busy !== null}
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
              disabled={busy !== null}
              onPress={() => void oauthApple()}
              icon={
                <Ionicons name="logo-apple" size={19} color={colors.textOnPrimary} />
              }
              testID="welcome-apple"
            />
          ) : null}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Continua con email"
            onPress={() => router.push('/(auth)/sign-in')}
            hitSlop={8}
            style={({ pressed }) => [
              styles.emailLink,
              pressed && styles.emailLinkPressed,
            ]}
            testID="welcome-register"
          >
            <Text style={styles.emailLinkText}>Oppure continua con email</Text>
          </Pressable>
        </View>
        <Text style={styles.terms}>
          Continuando accetti i termini e l'informativa privacy del servizio.
        </Text>
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    justifyContent: 'space-between',
  },
  heroWash: {
    position: 'absolute',
    top: -spacing.lg,
    left: -spacing.lg,
    right: -spacing.lg,
    height: 400,
  },
  hero: {
    alignItems: 'center',
    marginTop: spacing.xxxl * 2,
    gap: spacing.md,
  },
  logoBadge: {
    width: 132,
    height: 132,
    borderRadius: radius.full,
    backgroundColor: colors.surface,
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
    color: colors.text,
    letterSpacing: 5,
  },
  tagline: {
    fontSize: typography.size.md,
    fontWeight: typography.weight.semibold,
    color: colors.accent,
    letterSpacing: 0.4,
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
  emailLink: {
    alignItems: 'center',
    paddingVertical: spacing.sm,
  },
  emailLinkPressed: {
    opacity: 0.6,
  },
  emailLinkText: {
    fontSize: typography.size.md,
    fontWeight: typography.weight.semibold,
    color: colors.accent,
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
