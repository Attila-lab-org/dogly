/**
 * Digestive processing (Spec V1 sez. 6): stepper breve mentre l'evento
 * fecale viene osservato. Mock: avanza deterministicamente e porta al
 * risultato. Niente loop di polling stretto lato client (sez. 22).
 */
import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Card, ScreenContainer } from '@/components';
import { colors, radius, spacing, typography } from '@/theme/tokens';

const STEPS = [
  { key: 'QUEUED', label: 'Foto caricata', icon: 'cloud-done-outline' },
  { key: 'OBSERVING', label: 'Osservo la foto…', icon: 'eye-outline' },
  { key: 'COMPARING', label: 'Confronto con la baseline di Rocky', icon: 'analytics-outline' },
  { key: 'DONE', label: 'Quasi fatto', icon: 'checkmark-circle-outline' },
] as const;

const STEP_DURATION_MS = 1200;

export default function DigestiveProcessingScreen() {
  const { eventId } = useLocalSearchParams<{ eventId: string }>();
  const router = useRouter();
  const [stepIndex, setStepIndex] = useState(0);

  useEffect(() => {
    if (stepIndex >= STEPS.length) {
      router.replace(`/digestive/result/${eventId ?? 'fecal-ok-1'}`);
      return undefined;
    }
    const timer = setTimeout(() => setStepIndex((i) => i + 1), STEP_DURATION_MS);
    return () => clearTimeout(timer);
  }, [stepIndex, eventId, router]);

  return (
    <ScreenContainer>
      <View style={styles.center}>
        <Text style={styles.title}>Analisi in corso</Text>
        <Text style={styles.subtitle}>
          Puoi restare qui o tornare dopo: ti avvisiamo quando è pronto.
        </Text>
        <Card style={styles.card}>
          {STEPS.map((step, index) => {
            const done = index < stepIndex;
            const active = index === stepIndex;
            return (
              <View key={step.key} style={styles.stepRow}>
                <View
                  style={[
                    styles.stepIcon,
                    done && styles.stepIconDone,
                    active && styles.stepIconActive,
                  ]}
                >
                  <Ionicons
                    name={done ? 'checkmark' : (step.icon as keyof typeof Ionicons.glyphMap)}
                    size={16}
                    color={
                      done
                        ? colors.textOnPrimary
                        : active
                          ? colors.accent
                          : colors.textMuted
                    }
                  />
                </View>
                <Text
                  style={[
                    styles.stepLabel,
                    active && styles.stepLabelActive,
                    done && styles.stepLabelDone,
                  ]}
                >
                  {step.label}
                </Text>
              </View>
            );
          })}
        </Card>
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    justifyContent: 'center',
  },
  title: {
    fontSize: typography.size.xl,
    fontWeight: typography.weight.bold,
    color: colors.text,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: typography.size.sm,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: spacing.xs,
    marginBottom: spacing.xl,
  },
  card: {
    paddingVertical: spacing.xl,
  },
  stepRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.sm,
  },
  stepIcon: {
    width: 28,
    height: 28,
    borderRadius: radius.full,
    backgroundColor: colors.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepIconDone: {
    backgroundColor: colors.accent,
  },
  stepIconActive: {
    backgroundColor: colors.accentSoft,
  },
  stepLabel: {
    fontSize: typography.size.sm,
    color: colors.textMuted,
  },
  stepLabelActive: {
    color: colors.text,
    fontWeight: typography.weight.semibold,
  },
  stepLabelDone: {
    color: colors.textSecondary,
  },
});
