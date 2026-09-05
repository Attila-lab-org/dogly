/**
 * Welcome (Spec V1 sez. 6, 7.1.1) — brand Dogly + Google / email.
 */
import React, { useEffect, useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Button, ScreenContainer } from '@/components';
import { colors, radius, shadows, spacing, typography } from '@/theme/tokens';
import { useSession } from '@/features/auth/SessionProvider';
import { mapAuthError, signInWithGoogle } from '@/features/auth/actions';

const logoMarkSource = require('../../assets/brand/dogly-logo-mark.png');

export default function WelcomeScreen() {
  const router = useRouter();
  const { sessionState, usingMockGate, loading } = useSession();
  const [busy, setBusy] = useState<'google' | null>(null);
  const [error, setError] = useState<string | null>(null);

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
      const kind = mapAuthError(err);
      setError(
        kind === 'offline'
          ? 'Sei offline. Riprova quando hai connessione.'
          : 'Accesso non riuscito. Riprova.',
      );
    } finally {
      setBusy(null);
    }
  };

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
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Registrati con email"
            onPress={() => router.push('/(auth)/sign-in')}
            hitSlop={8}
            style={({ pressed }) => [
              styles.emailLink,
              pressed && styles.emailLinkPressed,
            ]}
            testID="welcome-register"
          >
            <Text style={styles.emailLinkText}>Oppure registrati con email</Text>
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
