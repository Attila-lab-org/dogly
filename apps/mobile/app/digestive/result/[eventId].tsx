/**
 * Risultato digestivo: lettura immediata, dettagli utili e safety deterministica.
 * Le anomalie non osservate non vengono elencate per evitare falsa rassicurazione.
 */
import React, { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { Button, Card, ErrorState, ScreenContainer } from '@/components';
import { colors, radius, spacing, typography } from '@/theme/tokens';
import { fecalEventsMock } from '@/mocks/secondary';
import {
  candidateText,
  ConfidenceBandPill,
  StackScreenHeader,
} from '@/features/secondary/components';
import {
  ABSENCE_NOT_PROOF_NOTE,
  DIGESTIVE_DISCLAIMER,
  SAFETY_COPY,
} from '@/features/secondary/safetyCopy';
import { useDogProfile } from '@/features/core/useDogProfile';
import {
  getDigestiveEvent,
  mapApiDigestiveEventToResult,
} from '@/features/digestive/api';
import { isApiConfigured } from '@/features/auth/env';
import type {
  CandidateLevel,
  SafetyFlagCode,
} from '@/features/secondary/types';

type Candidate = {
  label: string;
  level: CandidateLevel;
  coveredBy?: SafetyFlagCode;
};

export default function DigestiveResultScreen() {
  const params = useLocalSearchParams<{ eventId?: string | string[] }>();
  const eventId = Array.isArray(params.eventId)
    ? params.eventId[0] ?? ''
    : params.eventId ?? '';
  const router = useRouter();
  const { dog } = useDogProfile();
  // Mock gate dev: gli id fecal-* leggono i mock; gli id reali fanno GET.
  const useApi =
    isApiConfigured() && Boolean(eventId) && !eventId.startsWith('fecal-');

  const query = useQuery({
    queryKey: ['digestive-event', eventId],
    queryFn: () => getDigestiveEvent(eventId),
    enabled: useApi,
  });

  const event = useApi
    ? query.data
      ? mapApiDigestiveEventToResult(query.data)
      : undefined
    : eventId
      ? fecalEventsMock[eventId]
      : undefined;

  const stillProcessing = event !== undefined && event.status === 'PROCESSING';
  useEffect(() => {
    if (stillProcessing && event) {
      router.replace(`/digestive/processing/${event.eventId}`);
    }
  }, [stillProcessing, event, router]);

  if (useApi && query.isLoading) {
    return (
      <ScreenContainer>
        <ErrorState title="Caricamento" message="Sto aprendo il risultato…" />
      </ScreenContainer>
    );
  }

  if (stillProcessing) {
    return (
      <ScreenContainer>
        <ErrorState
          title="Analisi in corso"
          message="Ti porto allo stato dell'analisi…"
        />
      </ScreenContainer>
    );
  }

  if (!event) {
    return (
      <ScreenContainer>
        <StackScreenHeader title="Digestione" />
        <ErrorState
          title="Risultato non disponibile"
          message="Puoi ritrovare le osservazioni precedenti nel Diario."
        />
        <Button
          title="Apri il Diario"
          onPress={() => router.replace('/(tabs)/diary')}
        />
      </ScreenContainer>
    );
  }

  if (
    event.status === 'INSUFFICIENT_IMAGE' ||
    event.imageQuality === 'insufficient'
  ) {
    return (
      <ScreenContainer scroll contentStyle={styles.content}>
        <StackScreenHeader title="Digestione" />
        <View style={styles.emptyVisual}>
          <View style={styles.warningIcon}>
            <Ionicons name="camera-outline" size={34} color={colors.warning} />
          </View>
          <Text style={styles.emptyTitle}>Serve un’altra foto</Text>
          <Text style={styles.emptySubtitle}>
            Questa non è abbastanza nitida per un risultato affidabile.
          </Text>
        </View>

        <Card style={styles.improveCard}>
          <Text style={styles.cardTitle}>Per migliorarla</Text>
          {event.qualityWarnings.map((warning) => (
            <View key={warning} style={styles.tipRow}>
              <Ionicons name="checkmark" size={17} color={colors.accent} />
              <Text style={styles.tipText}>{warning}</Text>
            </View>
          ))}
        </Card>

        <Button
          title="Scatta di nuovo"
          icon={
            <Ionicons name="camera" size={18} color={colors.textOnPrimary} />
          }
          onPress={() => router.replace('/digestive/capture')}
          testID="digestive-retake"
        />
        <Button
          title="Chiudi"
          variant="outline"
          onPress={() => router.replace('/(tabs)/rocky')}
          style={styles.secondaryAction}
        />
      </ScreenContainer>
    );
  }

  const hasSafetyFlags = event.safetyFlags.length > 0;
  const candidates: Candidate[] = [
    { label: 'Possibile muco', level: event.mucusCandidate },
    {
      label: 'Possibile sangue',
      level: event.bloodCandidate,
      coveredBy: 'BLOOD_CANDIDATE',
    },
    {
      label: 'Colore molto scuro',
      level: event.melenaCandidate,
      coveredBy: 'MELENA_CANDIDATE',
    },
    { label: 'Possibile materiale estraneo', level: event.foreignMaterialCandidate },
  ];
  const notableCandidates = candidates.filter(
    ({ level, coveredBy }) =>
      (level === 'possible' || level === 'clear_candidate') &&
      (!coveredBy || !event.safetyFlags.includes(coveredBy)),
  );

  return (
    <ScreenContainer scroll contentStyle={styles.content}>
      <StackScreenHeader title="Digestione" />

      <View
        style={[
          styles.resultHero,
          hasSafetyFlags ? styles.resultHeroAttention : styles.resultHeroRegular,
        ]}
      >
        <View
          style={[
            styles.resultIcon,
            hasSafetyFlags
              ? styles.resultIconAttention
              : styles.resultIconRegular,
          ]}
        >
          <Ionicons
            name={hasSafetyFlags ? 'alert-outline' : 'checkmark'}
            size={30}
            color={hasSafetyFlags ? colors.danger : colors.accent}
          />
        </View>
        <Text style={styles.resultTitle}>
          {hasSafetyFlags
            ? 'C’è qualcosa da controllare'
            : 'Sembra tutto regolare'}
        </Text>
        <Text style={styles.resultSummary}>
          {event.baselineComparison.replace(/Rocky/g, dog.name)}
        </Text>
        <ConfidenceBandPill band={event.confidenceBand} style={styles.pill} />
      </View>

      {event.safetyFlags.map((flag) => {
        const copy = SAFETY_COPY[flag];
        return (
          <View key={flag} style={styles.safetyCard}>
            <View style={styles.safetyHeading}>
              <Ionicons name="medkit" size={20} color={colors.danger} />
              <Text style={styles.safetyTitle}>{copy.title}</Text>
            </View>
            <Text style={styles.safetyMessage}>{copy.message}</Text>
            <Text style={styles.safetyAction}>{copy.action}</Text>
          </View>
        );
      })}

      <Text style={styles.sectionTitle}>In breve</Text>
      <View style={styles.metrics}>
        <MetricCard
          icon="shapes-outline"
          label="Consistenza"
          value={capitalize(event.consistency)}
        />
        <MetricCard
          icon="color-palette-outline"
          label="Colore"
          value={capitalize(event.color)}
        />
      </View>

      <Card style={styles.scoreCard}>
        <View style={styles.scoreBadge}>
          <Text style={styles.scoreNumber}>{event.fecalScoreEstimate ?? '—'}</Text>
          <Text style={styles.scoreTotal}>/7</Text>
        </View>
        <View style={styles.scoreCopy}>
          <Text style={styles.scoreTitle}>Stima visiva</Text>
          <Text style={styles.scoreSubtitle}>
            Basata sulla forma osservata nella foto.
          </Text>
        </View>
      </Card>

      {notableCandidates.length > 0 ? (
        <Card style={styles.notableCard}>
          <Text style={styles.cardTitle}>Da tenere d’occhio</Text>
          {notableCandidates.map((candidate) => (
            <View key={candidate.label} style={styles.notableRow}>
              <View style={styles.notableDot} />
              <Text style={styles.notableLabel}>{candidate.label}</Text>
              <Text style={styles.notableValue}>
                {candidateText(candidate.level)}
              </Text>
            </View>
          ))}
        </Card>
      ) : null}

      {event.activeFoodName ? (
        <View style={styles.foodRow}>
          <View style={styles.foodIcon}>
            <Ionicons name="nutrition-outline" size={20} color={colors.primary} />
          </View>
          <View style={styles.foodCopy}>
            <Text style={styles.foodLabel}>Cibo attuale</Text>
            <Text style={styles.foodValue} numberOfLines={2}>
              {event.activeFoodName}
            </Text>
          </View>
        </View>
      ) : null}

      <View style={styles.disclaimer}>
        <Ionicons
          name="information-circle-outline"
          size={18}
          color={colors.textSecondary}
        />
        <View style={styles.disclaimerCopy}>
          <Text style={styles.disclaimerText}>{DIGESTIVE_DISCLAIMER}</Text>
          <Text style={styles.disclaimerText}>{ABSENCE_NOT_PROOF_NOTE}</Text>
        </View>
      </View>

      <Button
        title="Fatto"
        onPress={() => router.replace('/(tabs)/rocky')}
      />
      <Button
        title="Apri il Diario"
        variant="outline"
        onPress={() => router.replace('/(tabs)/diary')}
        style={styles.secondaryAction}
      />
    </ScreenContainer>
  );
}

function MetricCard({
  icon,
  label,
  value,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
}) {
  return (
    <View style={styles.metricCard}>
      <View style={styles.metricIcon}>
        <Ionicons name={icon} size={20} color={colors.accent} />
      </View>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={styles.metricValue} numberOfLines={2}>
        {value}
      </Text>
    </View>
  );
}

function capitalize(value: string): string {
  return value ? `${value[0].toUpperCase()}${value.slice(1)}` : value;
}

const styles = StyleSheet.create({
  content: {
    paddingBottom: spacing.xxxl,
  },
  resultHero: {
    alignItems: 'center',
    padding: spacing.xl,
    borderRadius: radius.lg,
    marginBottom: spacing.lg,
  },
  resultHeroRegular: {
    backgroundColor: colors.accentSoft,
  },
  resultHeroAttention: {
    backgroundColor: colors.dangerSoft,
  },
  resultIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  resultIconRegular: {
    backgroundColor: colors.surface,
  },
  resultIconAttention: {
    backgroundColor: colors.surface,
  },
  resultTitle: {
    color: colors.text,
    fontSize: typography.size.xl,
    fontWeight: typography.weight.bold,
    textAlign: 'center',
  },
  resultSummary: {
    marginTop: spacing.sm,
    color: colors.textSecondary,
    fontSize: typography.size.sm,
    lineHeight: typography.size.sm * typography.lineHeight.relaxed,
    textAlign: 'center',
  },
  pill: {
    marginTop: spacing.md,
  },
  safetyCard: {
    padding: spacing.lg,
    borderRadius: radius.lg,
    backgroundColor: colors.dangerSoft,
    marginBottom: spacing.lg,
  },
  safetyHeading: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  safetyTitle: {
    flex: 1,
    color: colors.danger,
    fontSize: typography.size.md,
    fontWeight: typography.weight.bold,
  },
  safetyMessage: {
    marginTop: spacing.sm,
    color: colors.text,
    fontSize: typography.size.sm,
    lineHeight: typography.size.sm * typography.lineHeight.relaxed,
  },
  safetyAction: {
    marginTop: spacing.md,
    color: colors.danger,
    fontSize: typography.size.sm,
    fontWeight: typography.weight.bold,
  },
  sectionTitle: {
    marginTop: spacing.sm,
    marginBottom: spacing.md,
    color: colors.text,
    fontSize: typography.size.lg,
    fontWeight: typography.weight.bold,
  },
  metrics: {
    flexDirection: 'row',
    gap: spacing.md,
    marginBottom: spacing.md,
  },
  metricCard: {
    flex: 1,
    minHeight: 132,
    padding: spacing.lg,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
  },
  metricIcon: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accentSoft,
  },
  metricLabel: {
    marginTop: spacing.md,
    color: colors.textSecondary,
    fontSize: typography.size.xs,
  },
  metricValue: {
    marginTop: spacing.xs,
    color: colors.text,
    fontSize: typography.size.md,
    fontWeight: typography.weight.bold,
  },
  scoreCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginBottom: spacing.lg,
  },
  scoreBadge: {
    width: 68,
    height: 68,
    borderRadius: 34,
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'center',
    paddingTop: spacing.md,
    backgroundColor: colors.primarySoft,
  },
  scoreNumber: {
    color: colors.primary,
    fontSize: typography.size.xxl,
    fontWeight: typography.weight.bold,
  },
  scoreTotal: {
    color: colors.primary,
    fontSize: typography.size.xs,
    fontWeight: typography.weight.semibold,
  },
  scoreCopy: {
    flex: 1,
  },
  scoreTitle: {
    color: colors.text,
    fontSize: typography.size.md,
    fontWeight: typography.weight.bold,
  },
  scoreSubtitle: {
    marginTop: spacing.xs,
    color: colors.textSecondary,
    fontSize: typography.size.sm,
  },
  notableCard: {
    marginBottom: spacing.lg,
  },
  cardTitle: {
    marginBottom: spacing.md,
    color: colors.text,
    fontSize: typography.size.md,
    fontWeight: typography.weight.bold,
  },
  notableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: 40,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  notableDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.warning,
  },
  notableLabel: {
    flex: 1,
    color: colors.text,
    fontSize: typography.size.sm,
  },
  notableValue: {
    color: colors.warning,
    fontSize: typography.size.sm,
    fontWeight: typography.weight.semibold,
  },
  foodRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.lg,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    marginBottom: spacing.lg,
  },
  foodIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primarySoft,
  },
  foodCopy: {
    flex: 1,
  },
  foodLabel: {
    color: colors.textSecondary,
    fontSize: typography.size.xs,
  },
  foodValue: {
    marginTop: spacing.xs,
    color: colors.text,
    fontSize: typography.size.sm,
    fontWeight: typography.weight.semibold,
  },
  disclaimer: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceMuted,
    marginBottom: spacing.lg,
  },
  disclaimerCopy: {
    flex: 1,
    gap: spacing.xs,
  },
  disclaimerText: {
    color: colors.textSecondary,
    fontSize: typography.size.xs,
    lineHeight: typography.size.xs * typography.lineHeight.relaxed,
  },
  secondaryAction: {
    marginTop: spacing.sm,
  },
  emptyVisual: {
    alignItems: 'center',
    paddingVertical: spacing.xl,
  },
  warningIcon: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.warningSoft,
    marginBottom: spacing.md,
  },
  emptyTitle: {
    color: colors.text,
    fontSize: typography.size.xl,
    fontWeight: typography.weight.bold,
  },
  emptySubtitle: {
    marginTop: spacing.sm,
    color: colors.textSecondary,
    fontSize: typography.size.sm,
    textAlign: 'center',
  },
  improveCard: {
    marginBottom: spacing.lg,
  },
  tipRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.xs,
  },
  tipText: {
    flex: 1,
    color: colors.text,
    fontSize: typography.size.sm,
  },
});
