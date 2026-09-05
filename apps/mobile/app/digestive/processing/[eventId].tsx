import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { ScreenContainer } from '@/components';
import { colors, radius, spacing, typography } from '@/theme/tokens';
import { useDogProfile } from '@/features/core/useDogProfile';

const STEP_DURATION_MS = 1100;

export default function DigestiveProcessingScreen() {
  const params = useLocalSearchParams<{ eventId?: string | string[] }>();
  const eventId = Array.isArray(params.eventId)
    ? params.eventId[0] ?? 'fecal-ok-1'
    : params.eventId ?? 'fecal-ok-1';
  const router = useRouter();
  const { dog } = useDogProfile();
  const [stepIndex, setStepIndex] = useState(0);
  const steps = useMemo(
    () => [
      'Preparo la foto',
      'Osservo forma e colore',
      `Confronto con il solito di ${dog.name}`,
    ],
    [dog.name],
  );

  useEffect(() => {
    if (stepIndex >= steps.length) {
      router.replace(`/digestive/result/${eventId}`);
      return undefined;
    }
    const timer = setTimeout(
      () => setStepIndex((current) => current + 1),
      STEP_DURATION_MS,
    );
    return () => clearTimeout(timer);
  }, [eventId, router, stepIndex, steps.length]);

  const visibleStep = steps[Math.min(stepIndex, steps.length - 1)];

  return (
    <ScreenContainer contentStyle={styles.screen}>
      <View style={styles.visual}>
        <View style={styles.orbit}>
          <View style={styles.iconCircle}>
            <Ionicons name="leaf" size={38} color={colors.accent} />
          </View>
          <ActivityIndicator
            size="large"
            color={colors.primary}
            style={styles.loader}
          />
        </View>
      </View>

      <Text style={styles.title}>Controllo in corso</Text>
      <Text style={styles.currentStep}>{visibleStep}</Text>

      <View style={styles.progress}>
        {steps.map((step, index) => (
          <View
            key={step}
            style={[
              styles.progressSegment,
              index <= stepIndex && styles.progressSegmentActive,
            ]}
          />
        ))}
      </View>

      <Text style={styles.wait}>Ci vorranno solo pochi secondi.</Text>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
  },
  visual: {
    marginBottom: spacing.xxl,
  },
  orbit: {
    width: 128,
    height: 128,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconCircle: {
    width: 92,
    height: 92,
    borderRadius: 46,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accentSoft,
  },
  loader: {
    position: 'absolute',
    transform: [{ scale: 1.5 }],
  },
  title: {
    color: colors.text,
    fontSize: typography.size.xl,
    fontWeight: typography.weight.bold,
    textAlign: 'center',
  },
  currentStep: {
    minHeight: 24,
    marginTop: spacing.sm,
    color: colors.textSecondary,
    fontSize: typography.size.md,
    textAlign: 'center',
  },
  progress: {
    width: '72%',
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.xl,
  },
  progressSegment: {
    flex: 1,
    height: 6,
    borderRadius: radius.full,
    backgroundColor: colors.border,
  },
  progressSegmentActive: {
    backgroundColor: colors.accent,
  },
  wait: {
    marginTop: spacing.xl,
    color: colors.textMuted,
    fontSize: typography.size.xs,
  },
});
