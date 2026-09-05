import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { Button, ErrorState, ScreenContainer } from '@/components';
import { colors, radius, spacing, typography } from '@/theme/tokens';
import { useDogProfile } from '@/features/core/useDogProfile';
import {
  getDigestiveEvent,
  isFailedDigestiveStatus,
  isTerminalDigestiveStatus,
} from '@/features/digestive/api';
import { isApiConfigured } from '@/features/auth/env';

const STEP_DURATION_MS = 1100;

export default function DigestiveProcessingScreen() {
  const params = useLocalSearchParams<{ eventId?: string | string[] }>();
  const eventId = Array.isArray(params.eventId)
    ? params.eventId[0] ?? 'fecal-ok-1'
    : params.eventId ?? 'fecal-ok-1';
  const router = useRouter();
  const { dog } = useDogProfile();
  const [stepIndex, setStepIndex] = useState(0);
  // Mock gate dev: gli id fecal-* seguono lo stepper finto; gli id reali
  // fanno polling su GET /v1/digestive/events/{id}.
  const useApi = isApiConfigured() && !eventId.startsWith('fecal-');

  const query = useQuery({
    queryKey: ['digestive-event', eventId],
    queryFn: () => getDigestiveEvent(eventId),
    enabled: useApi,
    refetchInterval: (q) => {
      const status = q.state.data?.status;
      if (!status || isTerminalDigestiveStatus(status)) return false;
      return 2000;
    },
  });

  const steps = useMemo(
    () => [
      'Preparo la foto',
      'Osservo forma e colore',
      `Confronto con il solito di ${dog.name}`,
    ],
    [dog.name],
  );

  useEffect(() => {
    if (useApi) return undefined;
    if (stepIndex >= steps.length) {
      router.replace(`/digestive/result/${eventId}`);
      return undefined;
    }
    const timer = setTimeout(
      () => setStepIndex((current) => current + 1),
      STEP_DURATION_MS,
    );
    return () => clearTimeout(timer);
  }, [useApi, eventId, router, stepIndex, steps.length]);

  useEffect(() => {
    if (!useApi || !query.data) return;
    if (query.data.status === 'COMPLETED' || query.data.status === 'INSUFFICIENT_IMAGE') {
      router.replace(`/digestive/result/${query.data.id}`);
    }
  }, [useApi, query.data, router]);

  if (useApi && query.isError) {
    return (
      <ScreenContainer>
        <ErrorState
          title="Analisi non trovata"
          message="Non riesco a trovare questa analisi. Torna indietro e riprova."
        />
        <Button
          title="Torna alla Home"
          onPress={() => router.replace('/(tabs)/rocky')}
        />
      </ScreenContainer>
    );
  }

  if (useApi && query.data && isFailedDigestiveStatus(query.data.status)) {
    return (
      <ScreenContainer>
        <View style={styles.failedPage}>
          <View style={styles.failedIcon}>
            <Ionicons
              name="cloud-offline-outline"
              size={36}
              color={colors.danger}
            />
          </View>
          <Text style={styles.failedTitle}>Qualcosa non ha funzionato</Text>
          <Text style={styles.failedText}>
            C'è stato un problema tecnico dall'altra parte. Non è colpa della
            foto: l'analisi non è stata conteggiata.
          </Text>
          <Button
            title="Riprova"
            onPress={() => router.replace('/digestive/capture')}
          />
          <Button
            title="Torna alla Home"
            variant="outline"
            onPress={() => router.replace('/(tabs)/rocky')}
          />
        </View>
      </ScreenContainer>
    );
  }

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
  failedPage: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.lg,
    padding: spacing.lg,
  },
  failedIcon: {
    width: 88,
    height: 88,
    borderRadius: 44,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.dangerSoft,
  },
  failedTitle: {
    color: colors.text,
    fontSize: typography.size.xl,
    fontWeight: typography.weight.bold,
    textAlign: 'center',
  },
  failedText: {
    color: colors.textSecondary,
    fontSize: typography.size.md,
    textAlign: 'center',
    lineHeight: typography.size.md * typography.lineHeight.relaxed,
  },
});
