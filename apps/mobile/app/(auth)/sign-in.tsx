/**
 * Sign-in (Spec V1 sez. 6) — Supabase Auth: email OTP/password + Google.
 * Sessione in SecureStore via SessionProvider; dopo login → onboarding o Home.
 */
import React, { useEffect, useState } from 'react';
import { Image, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Button, ScreenContainer } from '@/components';
import { colors, radius, shadows, spacing, typography } from '@/theme/tokens';
import { useSession } from '@/features/auth/SessionProvider';
import {
  mapAuthError,
  sendEmailOtp,
  signInWithGoogle,
  signInWithPassword,
  verifyEmailOtp,
  type AuthErrorKind,
} from '@/features/auth/actions';
import { demoFlags } from '@/mocks/demo';

const logoMarkSource = require('../../assets/brand/dogly-logo-mark.png');

type AuthProvider = 'google' | 'email';
type EmailStep = 'idle' | 'enter_email' | 'enter_code';

const ERROR_COPY: Record<AuthErrorKind, string> = {
  auth_error: 'Accesso non riuscito. Controlla le credenziali e riprova.',
  account_exists:
    'Esiste già un account con questa email: accedi con il metodo usato in precedenza.',
  offline:
    'Sei offline. L’accesso richiede connessione: riprova quando torni online.',
};

export default function SignInScreen() {
  const router = useRouter();
  const { sessionState, usingMockGate, loading } = useSession();
  const [loadingProvider, setLoadingProvider] = useState<AuthProvider | null>(
    null,
  );
  const [error, setError] = useState<AuthErrorKind | null>(null);
  const [emailStep, setEmailStep] = useState<EmailStep>('idle');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [otp, setOtp] = useState('');

  useEffect(() => {
    if (loading) return;
    if (sessionState === 'authenticated-no-dog') {
      router.replace('/onboarding/dog');
    } else if (sessionState === 'authenticated-with-dog') {
      router.replace('/(tabs)/home');
    }
  }, [sessionState, loading, router]);

  const runMockSignIn = (provider: AuthProvider) => {
    setError(null);
    setLoadingProvider(provider);
    setTimeout(() => {
      setLoadingProvider(null);
      if (demoFlags.signInError) {
        setError(demoFlags.signInError);
        return;
      }
      router.replace('/onboarding/dog');
    }, 600);
  };

  const signInOAuth = async () => {
    if (usingMockGate) {
      runMockSignIn('google');
      return;
    }
    setError(null);
    setLoadingProvider('google');
    try {
      await signInWithGoogle();
      // SessionProvider onAuthStateChange → redirect via useEffect
    } catch (err) {
      setError(mapAuthError(err));
    } finally {
      setLoadingProvider(null);
    }
  };

  const startEmail = () => {
    if (usingMockGate) {
      runMockSignIn('email');
      return;
    }
    setError(null);
    setEmailStep('enter_email');
  };

  const sendOtp = async () => {
    if (!email.trim()) {
      setError('auth_error');
      return;
    }
    setLoadingProvider('email');
    setError(null);
    try {
      await sendEmailOtp(email);
      setEmailStep('enter_code');
    } catch (err) {
      setError(mapAuthError(err));
    } finally {
      setLoadingProvider(null);
    }
  };

  const confirmPassword = async () => {
    if (!email.trim() || !password) {
      setError('auth_error');
      return;
    }
    setLoadingProvider('email');
    setError(null);
    try {
      await signInWithPassword(email, password);
    } catch (err) {
      setError(mapAuthError(err));
    } finally {
      setLoadingProvider(null);
    }
  };

  const confirmOtp = async () => {
    setLoadingProvider('email');
    setError(null);
    try {
      await verifyEmailOtp(email, otp);
    } catch (err) {
      setError(mapAuthError(err));
    } finally {
      setLoadingProvider(null);
    }
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
        <View style={styles.logoBadge}>
          <Image
            source={logoMarkSource}
            style={styles.logoMark}
            resizeMode="contain"
            accessibilityLabel="Dogly"
          />
        </View>
        <Text style={styles.title}>Accedi</Text>
        <Text style={styles.subtitle}>
          Un account per tenere al sicuro ciò che imparo sul tuo cane, su tutti
          i tuoi dispositivi.
        </Text>
      </View>

      {error && (
        <View style={styles.errorBanner} accessibilityLiveRegion="polite">
          <Ionicons name="alert-circle-outline" size={18} color={colors.danger} />
          <Text style={styles.errorText}>{ERROR_COPY[error]}</Text>
        </View>
      )}

      {emailStep === 'enter_email' && (
        <View style={styles.emailBlock}>
          <Text style={styles.label}>Email</Text>
          <TextInput
            autoCapitalize="none"
            keyboardType="email-address"
            autoComplete="email"
            value={email}
            onChangeText={setEmail}
            placeholder="tu@email.com"
            placeholderTextColor={colors.textMuted}
            style={styles.input}
            testID="signin-email-input"
          />
          <Text style={styles.label}>Password</Text>
          <TextInput
            autoCapitalize="none"
            autoComplete="current-password"
            secureTextEntry
            value={password}
            onChangeText={setPassword}
            placeholder="La tua password"
            placeholderTextColor={colors.textMuted}
            style={styles.input}
            testID="signin-password-input"
          />
          <Button
            title="Accedi con password"
            loading={loadingProvider === 'email'}
            onPress={() => void confirmPassword()}
            testID="signin-password-submit"
          />
          <Button
            title="Oppure invia un codice"
            variant="outline"
            loading={loadingProvider === 'email'}
            onPress={() => void sendOtp()}
            testID="signin-send-otp"
          />
          <Pressable onPress={() => setEmailStep('idle')}>
            <Text style={styles.link}>Torna ai metodi di accesso</Text>
          </Pressable>
        </View>
      )}

      {emailStep === 'enter_code' && (
        <View style={styles.emailBlock}>
          <Text style={styles.label}>Codice ricevuto via email</Text>
          <TextInput
            keyboardType="number-pad"
            value={otp}
            onChangeText={setOtp}
            placeholder="123456"
            placeholderTextColor={colors.textMuted}
            style={styles.input}
            testID="signin-otp-input"
          />
          <Button
            title="Verifica e accedi"
            loading={loadingProvider === 'email'}
            onPress={() => void confirmOtp()}
            testID="signin-verify-otp"
          />
          <Pressable onPress={() => void sendOtp()}>
            <Text style={styles.link}>Reinvia codice</Text>
          </Pressable>
        </View>
      )}

      {emailStep === 'idle' && (
        <View style={styles.buttons}>
          <Button
            title="Continua con Google"
            variant="primary"
            loading={loadingProvider === 'google'}
            disabled={loadingProvider !== null}
            onPress={() => void signInOAuth()}
            icon={<Ionicons name="logo-google" size={18} color={colors.accent} />}
            testID="signin-google"
          />
          <Button
            title="Continua con email"
            variant="outline"
            loading={loadingProvider === 'email'}
            disabled={loadingProvider !== null}
            onPress={startEmail}
            icon={<Ionicons name="mail-outline" size={18} color={colors.accent} />}
            testID="signin-email"
          />
        </View>
      )}

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
  logoBadge: {
    width: 64,
    height: 64,
    borderRadius: radius.full,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.lg,
    ...shadows.card,
  },
  logoMark: {
    width: 48,
    height: 35,
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
  emailBlock: {
    gap: spacing.md,
  },
  label: {
    fontSize: typography.size.sm,
    fontWeight: typography.weight.semibold,
    color: colors.text,
  },
  input: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    fontSize: typography.size.md,
    color: colors.text,
  },
  link: {
    textAlign: 'center',
    color: colors.accent,
    fontWeight: typography.weight.semibold,
    fontSize: typography.size.sm,
  },
  footer: {
    marginTop: spacing.xl,
    fontSize: typography.size.xs,
    color: colors.textMuted,
    textAlign: 'center',
    lineHeight: typography.size.xs * typography.lineHeight.relaxed,
  },
});
