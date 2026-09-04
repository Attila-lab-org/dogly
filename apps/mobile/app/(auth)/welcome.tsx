/**
 * Welcome (Spec V1 sez. 6, 7.1.1) — welcome/privacy summary prima del sign-in.
 * Privacy summary (sez. 23.1): consenso servizio qui; ricerca/training
 * separato e opt-in (mai preselezionato); "keep clip" separato.
 * Nessun permesso OS alla prima apertura (sez. 13.1).
 */
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { Button, ScreenContainer } from '@/components';
import { colors, gradients, radius, spacing, typography } from '@/theme/tokens';

const PRIVACY_POINTS: { icon: keyof typeof Ionicons.glyphMap; text: string }[] = [
  {
    icon: 'lock-closed-outline',
    text: 'I video di Rocky restano privati e puoi eliminarli quando vuoi.',
  },
  {
    icon: 'flask-outline',
    text: 'Uso per ricerca e miglioramento solo se lo scegli tu, a parte.',
  },
  {
    icon: 'videocam-outline',
    text: "L'AI lavora solo quando registri tu: niente analisi in background.",
  },
];

export default function WelcomeScreen() {
  const router = useRouter();

  return (
    <ScreenContainer>
      <View style={styles.hero}>
        <LinearGradient
          colors={[...gradients.cta]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.heroBadge}
        >
          <Ionicons name="paw" size={44} color={colors.textOnPrimary} />
        </LinearGradient>
        <Text style={styles.title}>Capisci cosa ti sta{'\n'}dicendo il tuo cane</Text>
        <Text style={styles.subtitle}>
          Registra pochi secondi di video: osservo i segnali di Rocky e te li
          spiego in parole semplici.
        </Text>
      </View>

      {/* Privacy summary (sez. 7.1.1 + 23.1) */}
      <View style={styles.privacyCard}>
        {PRIVACY_POINTS.map((point) => (
          <View key={point.icon} style={styles.privacyRow}>
            <View style={styles.privacyIcon}>
              <Ionicons name={point.icon} size={18} color={colors.accent} />
            </View>
            <Text style={styles.privacyText}>{point.text}</Text>
          </View>
        ))}
      </View>

      <Button
        title="Inizia"
        onPress={() => router.push('/(auth)/sign-in')}
        testID="welcome-continue"
      />
      <Text style={styles.terms}>
        Continuando accetti i termini e l'informativa privacy del servizio.
      </Text>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  hero: {
    alignItems: 'center',
    marginTop: spacing.xxxl,
    marginBottom: spacing.xl,
  },
  heroBadge: {
    width: 96,
    height: 96,
    borderRadius: radius.lg * 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xl,
  },
  title: {
    fontSize: typography.size.xxl,
    fontWeight: typography.weight.bold,
    color: colors.text,
    textAlign: 'center',
    lineHeight: typography.size.xxl * typography.lineHeight.tight,
  },
  subtitle: {
    marginTop: spacing.md,
    fontSize: typography.size.md,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: typography.size.md * typography.lineHeight.relaxed,
  },
  privacyCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.md,
    marginBottom: spacing.xl,
  },
  privacyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  privacyIcon: {
    width: 36,
    height: 36,
    borderRadius: radius.full,
    backgroundColor: colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  privacyText: {
    flex: 1,
    fontSize: typography.size.sm,
    color: colors.text,
    lineHeight: typography.size.sm * typography.lineHeight.normal,
  },
  terms: {
    marginTop: spacing.md,
    fontSize: typography.size.xs,
    color: colors.textMuted,
    textAlign: 'center',
  },
});
