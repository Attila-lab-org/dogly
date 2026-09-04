/**
 * Sign-in (Spec V1 sez. 6) — Supabase Auth: Continue / Apple / Google.
 * Stati obbligatori: loading, auth error, account exists, offline.
 * Sessione in SecureStore (sez. 5.3); niente token in AsyncStorage.
 * Dopo il login: onboarding cane se non esiste, altrimenti Home (7.1).
 */
import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Button, ScreenContainer } from '@/components';
import { colors, radius, spacing, typography } from '@/theme/tokens';
import { demoFlags, type DemoSignInError } from '@/mocks/demo';

type AuthProvider = 'apple' | 'google' | 'email';
type AuthError = DemoSignInError | null;

const ERROR_COPY: Record<Exclude<AuthError, null>, string> = {
  auth_error: 'Accesso non riuscito. Controlla le credenziali e riprova.',
  account_exists:
    'Esiste già un account con questa email: accedi con il metodo usato in precedenza.',
  offline:
    'Sei offline. L’accesso richiede connessione: riprova quando torni online.',
};

export default function SignInScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState<AuthProvider | null>(null);
  const [error, setError] = useState<AuthError>(null);

  const signIn = (provider: AuthProvider) => {
    setError(null);
    setLoading(provider);
    // Mock V1: Supabase Auth OAuth arriverà con il backend; qui simuliamo
    // l'accesso riuscito e instradiamo al flusso 7.1 (onboarding cane).
    // Stati errore (sez. 6) raggiungibili in dev via demoFlags.signInError:
    // il tap su un provider mostra l'errore simulato invece di accedere.
    setTimeout(() => {
      setLoading(null);
      if (demoFlags.signInError) {
        setError(demoFlags.signInError);
        return;
      }
      router.replace('/onboarding/dog');
    }, 900);
  };

  return (
    <ScreenContainer>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Indietro"
        onPress={() => router.back()}
        hitSlop={12}
        style={styles.back}
      >
        <Ionicons name="chevron-back" size={26} color={colors.text} />
      </Pressable>

      <View style={styles.header}>
        <Text style={styles.title}>Accedi</Text>
        <Text style={styles.subtitle}>
          Un account per tenere al sicuro ciò che imparo su Rocky, su tutti i
          tuoi dispositivi.
        </Text>
      </View>

      {error && (
        <View style={styles.errorBanner} accessibilityLiveRegion="polite">
          <Ionicons name="alert-circle-outline" size={18} color={colors.danger} />
          <Text style={styles.errorText}>{ERROR_COPY[error]}</Text>
        </View>
      )}

      <View style={styles.buttons}>
        <Button
          title="Continua con Apple"
          variant="primary"
          loading={loading === 'apple'}
          disabled={loading !== null}
          onPress={() => signIn('apple')}
          icon={<Ionicons name="logo-apple" size={20} color={colors.textOnPrimary} />}
          testID="signin-apple"
        />
        <Button
          title="Continua con Google"
          variant="outline"
          loading={loading === 'google'}
          disabled={loading !== null}
          onPress={() => signIn('google')}
          icon={<Ionicons name="logo-google" size={18} color={colors.accent} />}
          testID="signin-google"
        />
        <Button
          title="Continua con email"
          variant="outline"
          loading={loading === 'email'}
          disabled={loading !== null}
          onPress={() => signIn('email')}
          icon={<Ionicons name="mail-outline" size={18} color={colors.accent} />}
          testID="signin-email"
        />
      </View>

      <Text style={styles.footer}>
        Il consenso per ricerca e miglioramento del modello è separato e
        facoltativo: lo trovi in Impostazioni, sempre modificabile.
      </Text>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  back: {
    marginBottom: spacing.lg,
    alignSelf: 'flex-start',
  },
  header: {
    marginBottom: spacing.xl,
  },
  title: {
    fontSize: typography.size.xxl,
    fontWeight: typography.weight.bold,
    color: colors.text,
  },
  subtitle: {
    marginTop: spacing.sm,
    fontSize: typography.size.md,
    color: colors.textSecondary,
    lineHeight: typography.size.md * typography.lineHeight.relaxed,
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    backgroundColor: colors.dangerSoft,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.lg,
  },
  errorText: {
    flex: 1,
    fontSize: typography.size.sm,
    color: colors.text,
    lineHeight: typography.size.sm * typography.lineHeight.normal,
  },
  buttons: {
    gap: spacing.md,
  },
  footer: {
    marginTop: spacing.xl,
    fontSize: typography.size.xs,
    color: colors.textMuted,
    textAlign: 'center',
    lineHeight: typography.size.xs * typography.lineHeight.relaxed,
  },
});
