/**
 * Sign-in (Spec V1 sez. 6) — Supabase Auth: email OTP (niente password: il
 * codice copre sia l'accesso sia la creazione dell'account) + Google +
 * Apple (solo iOS, ADR-001). Sessione in SecureStore via SessionProvider;
 * dopo login → onboarding o Home.
 */
import React, { useEffect, useRef, useState } from 'react';
import {
  Image,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as AppleAuthentication from 'expo-apple-authentication';
import { Button, ScreenContainer } from '@/components';
import { colors, gradients, radius, shadows, spacing, typography } from '@/theme/tokens';
import { useSession } from '@/features/auth/SessionProvider';
import {
  mapAuthError,
  sendEmailOtp,
  signInWithApple,
  signInWithGoogle,
  verifyEmailOtp,
  type AuthErrorKind,
} from '@/features/auth/actions';
import { shouldOfferAppleSignIn } from '@/features/auth/appleSignIn';
import { demoFlags } from '@/mocks/demo';

const logoMarkSource = require('../../assets/brand/dogly-logo-mark.png');

type AuthProvider = 'google' | 'apple' | 'email';
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
  const { sessionState, usingMockGate, loading, authConfigured } = useSession();
  const [loadingProvider, setLoadingProvider] = useState<AuthProvider | null>(
    null,
  );
  const [error, setError] = useState<AuthErrorKind | null>(null);
  const [emailStep, setEmailStep] = useState<EmailStep>('idle');
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [appleAvailable, setAppleAvailable] = useState(false);
  const oauthInFlight = useRef(false);

  const configIncomplete = !usingMockGate && !authConfigured;

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
    if (oauthInFlight.current) return;
    if (usingMockGate) {
      runMockSignIn('google');
      return;
    }
    oauthInFlight.current = true;
    setError(null);
    setLoadingProvider('google');
    try {
      await signInWithGoogle();
      // SessionProvider onAuthStateChange → redirect via useEffect
    } catch (err) {
      setError(mapAuthError(err));
    } finally {
      oauthInFlight.current = false;
      setLoadingProvider(null);
    }
  };

  const signInApple = async () => {
    if (oauthInFlight.current) return;
    // Mock gate dev: stesso comportamento della demo Google.
    if (usingMockGate) {
      runMockSignIn('apple');
      return;
    }
    oauthInFlight.current = true;
    setError(null);
    setLoadingProvider('apple');
    try {
      await signInWithApple();
      // SessionProvider onAuthStateChange → redirect via useEffect
    } catch (err) {
      if (err instanceof Error && err.message.includes('annullat')) {
        return; // annullamento utente: nessun errore da mostrare
      }
      setError(mapAuthError(err));
    } finally {
      oauthInFlight.current = false;
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

  const showApple = shouldOfferAppleSignIn(Platform.OS, appleAvailable);

  return (
    <ScreenContainer style={styles.safe} contentStyle={styles.screen} padded={false}>
      <LinearGradient
        colors={[...gradients.authWash]}
        locations={[0, 0.45, 1]}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <View style={styles.content}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Indietro"
          onPress={() => router.back()}
          hitSlop={12}
          style={styles.back}
        >
          <Ionicons name="chevron-back" size={26} color="#1A2B48" />
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
          <Text style={styles.wordmark}>DOGLY</Text>
          <Text style={styles.tagline}>Il tuo cane, finalmente capito.</Text>
          {emailStep !== 'idle' ? (
            <Text style={styles.subtitle}>
              Un account per tenere al sicuro ciò che imparo sul tuo cane, su tutti
              i tuoi dispositivi.
            </Text>
          ) : null}
        </View>

        {error && (
          <View style={styles.errorBanner} accessibilityLiveRegion="polite">
            <Ionicons name="alert-circle-outline" size={18} color={colors.danger} />
            <Text style={styles.errorText}>{ERROR_COPY[error]}</Text>
          </View>
        )}

        {configIncomplete && (
          <View style={styles.errorBanner} accessibilityLiveRegion="polite">
            <Ionicons name="alert-circle-outline" size={18} color={colors.danger} />
            <Text style={styles.errorText}>
              Configurazione incompleta: mancano le variabili Supabase. Contatta
              l’amministratore.
            </Text>
          </View>
        )}

        {emailStep === 'enter_email' && (
          <View style={styles.emailBlock}>
            <Text style={styles.emailExplain}>
              Ti inviamo un codice via email: niente password. Vale sia per
              accedere sia per creare il tuo account.
            </Text>
            <Text style={styles.label}>Email</Text>
            <View style={styles.inputCard}>
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
            </View>
            <Button
              title="Invia il codice"
              loading={loadingProvider === 'email'}
              onPress={() => void sendOtp()}
              testID="signin-send-otp"
            />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Torna ai metodi di accesso"
              onPress={() => setEmailStep('idle')}
            >
              <Text style={styles.link}>Torna ai metodi di accesso</Text>
            </Pressable>
          </View>
        )}

        {emailStep === 'enter_code' && (
          <View style={styles.emailBlock}>
            <Text style={styles.label}>Codice ricevuto via email</Text>
            <View style={styles.inputCard}>
              <TextInput
                keyboardType="number-pad"
                value={otp}
                onChangeText={setOtp}
                placeholder="123456"
                placeholderTextColor={colors.textMuted}
                style={styles.input}
                testID="signin-otp-input"
              />
            </View>
            <Button
              title="Verifica e accedi"
              loading={loadingProvider === 'email'}
              onPress={() => void confirmOtp()}
              testID="signin-verify-otp"
            />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Reinvia codice"
              onPress={() => void sendOtp()}
            >
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
              disabled={loadingProvider !== null || configIncomplete}
              onPress={() => void signInOAuth()}
              icon={
                <Ionicons name="logo-google" size={18} color={colors.textOnPrimary} />
              }
              testID="signin-google"
            />
            {showApple ? (
              <Button
                title="Continua con Apple"
                variant="secondary"
                loading={loadingProvider === 'apple'}
                disabled={loadingProvider !== null}
                onPress={() => void signInApple()}
                icon={
                  <Ionicons name="logo-apple" size={18} color={colors.textOnPrimary} />
                }
                testID="signin-apple"
              />
            ) : null}
            <Button
              title="Continua con email"
              variant="outline"
              loading={loadingProvider === 'email'}
              disabled={loadingProvider !== null}
              onPress={startEmail}
              testID="signin-email"
            />
          </View>
        )}

        <Text style={styles.footer}>
          Continuando accetti i termini e l'informativa privacy del servizio.
          Il consenso per ricerca e miglioramento del modello è separato e
          facoltativo: lo trovi in Impostazioni, sempre modificabile.
        </Text>
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
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xl,
  },
  back: {
    marginTop: spacing.sm,
    marginBottom: spacing.lg,
    alignSelf: 'flex-start',
  },
  header: {
    alignItems: 'center',
    marginBottom: spacing.xl,
    gap: spacing.sm,
  },
  logoBadge: {
    width: 96,
    height: 96,
    borderRadius: radius.full,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
    ...shadows.raised,
  },
  logoMark: {
    width: 68,
    height: 50,
  },
  wordmark: {
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
  subtitle: {
    marginTop: spacing.sm,
    fontSize: typography.size.md,
    color: colors.textSecondary,
    lineHeight: typography.size.md * typography.lineHeight.relaxed,
    textAlign: 'center',
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
  emailExplain: {
    fontSize: typography.size.sm,
    color: colors.textSecondary,
    lineHeight: typography.size.sm * typography.lineHeight.relaxed,
  },
  label: {
    fontSize: typography.size.sm,
    fontWeight: typography.weight.semibold,
    color: '#1A2B48',
  },
  inputCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#EDF2F7',
    ...shadows.card,
  },
  input: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    fontSize: typography.size.md,
    color: '#1A2B48',
  },
  link: {
    textAlign: 'center',
    color: '#2DAAAB',
    fontWeight: typography.weight.semibold,
    fontSize: typography.size.sm,
  },
  footer: {
    marginTop: 'auto',
    paddingTop: spacing.xl,
    fontSize: typography.size.xs,
    color: colors.textMuted,
    textAlign: 'center',
    lineHeight: typography.size.xs * typography.lineHeight.relaxed,
  },
});
