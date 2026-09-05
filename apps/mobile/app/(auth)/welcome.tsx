/**
 * Welcome (Spec V1 sez. 6, 7.1.1) — schermata iniziale con logo Dogly.
 * Auth reale (Google / registrazione / login) arriverà con Supabase;
 * V1 demo: bottoni visualmente spenti ma tap → entrata in app.
 */
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { ScreenContainer } from '@/components';
import { DoglyLogo } from '@/features/brand/DoglyLogo';
import { colors, radius, spacing, typography } from '@/theme/tokens';

export default function WelcomeScreen() {
  const router = useRouter();

  /** Demo: entra comunque (cane Rocky già in mock). */
  const enterApp = () => {
    router.replace('/(tabs)/home');
  };

  return (
    <ScreenContainer contentStyle={styles.screen}>
      <View style={styles.hero}>
        <DoglyLogo width={240} />
        <Text style={styles.tagline}>
          Capisci cosa ti sta dicendo il tuo cane
        </Text>
      </View>

      <View style={styles.footer}>
        <View style={styles.actions}>
          <AuthEntry
            title="Continua con Google"
            icon="logo-google"
            onPress={enterApp}
            testID="welcome-google"
          />
          <AuthEntry
            title="Registrazione"
            icon="person-add-outline"
            onPress={enterApp}
            testID="welcome-register"
          />
          <AuthEntry
            title="Login"
            icon="log-in-outline"
            onPress={enterApp}
            testID="welcome-login"
          />
        </View>
        <Text style={styles.hint}>Auth in arrivo — tap per entrare in demo</Text>
        <Text style={styles.terms}>
          Continuando accetti i termini e l'informativa privacy del servizio.
        </Text>
      </View>
    </ScreenContainer>
  );
}

function AuthEntry({
  title,
  icon,
  onPress,
  testID,
}: {
  title: string;
  icon: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
  testID: string;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityHint="Modalità demo: entra direttamente nell'app"
      onPress={onPress}
      testID={testID}
      style={({ pressed }) => [
        styles.entry,
        pressed && styles.entryPressed,
      ]}
    >
      <Ionicons name={icon} size={20} color={colors.textMuted} />
      <Text style={styles.entryLabel}>{title}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    justifyContent: 'space-between',
  },
  hero: {
    alignItems: 'center',
    marginTop: spacing.xxxl,
    gap: spacing.xl,
  },
  tagline: {
    fontSize: typography.size.lg,
    fontWeight: typography.weight.semibold,
    color: colors.text,
    textAlign: 'center',
    lineHeight: typography.size.lg * typography.lineHeight.tight,
    paddingHorizontal: spacing.lg,
  },
  footer: {
    paddingBottom: spacing.md,
  },
  actions: {
    gap: spacing.md,
  },
  entry: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.xl,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.surfaceMuted,
    opacity: 0.48,
  },
  entryPressed: {
    opacity: 0.62,
  },
  entryLabel: {
    fontSize: typography.size.md,
    fontWeight: typography.weight.semibold,
    color: colors.textMuted,
  },
  hint: {
    marginTop: spacing.lg,
    fontSize: typography.size.xs,
    color: colors.textMuted,
    textAlign: 'center',
  },
  terms: {
    marginTop: spacing.sm,
    marginBottom: spacing.md,
    fontSize: typography.size.xs,
    color: colors.textMuted,
    textAlign: 'center',
    lineHeight: typography.size.xs * typography.lineHeight.relaxed,
  },
});
