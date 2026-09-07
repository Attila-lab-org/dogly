/**
 * Risultato digestivo: lettura immediata, dettagli utili e safety deterministica.
 * Le anomalie non osservate non vengono elencate per evitare falsa rassicurazione.
 */
import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Button,
  Card,
  DogIllustration,
  ErrorState,
  ScreenContainer,
} from '@/components';
import { colors, radius, spacing, typography } from '@/theme/tokens';
import { fecalEventsMock } from '@/mocks/secondary';
import {
  candidateText,
  StackScreenHeader,
} from '@/features/secondary/components';
import {
  DIGESTIVE_DISCLAIMER,
  SAFETY_COPY,
} from '@/features/secondary/safetyCopy';
import { useDogProfile } from '@/features/core/useDogProfile';
import {
  getDigestiveEvent,
  mapApiDigestiveEventToResult,
  updateDigestiveContext,
} from '@/features/digestive/api';
import { isApiConfigured } from '@/features/auth/env';
import { useSession } from '@/features/auth/SessionProvider';
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
  const queryClient = useQueryClient();
  const { dog } = useDogProfile();
  const { usingMockGate } = useSession();
  const [detailsOpen, setDetailsOpen] = useState(false);
  const useApi = isApiConfigured() && !usingMockGate && Boolean(eventId);

  const query = useQuery({
    queryKey: ['digestive-event', eventId],
    queryFn: () => getDigestiveEvent(eventId),
    enabled: useApi,
  });
  const contextMutation = useMutation({
    mutationFn: ({
      key,
      value,
    }: {
      key: 'vomiting_today' | 'reduced_activity_today' | 'unusual_food_48h';
      value: boolean;
    }) => updateDigestiveContext(eventId, { [key]: value }),
    onSuccess: (updated) => {
      queryClient.setQueryData(['digestive-event', eventId], updated);
    },
  });

  const event = useApi
    ? query.data
      ? mapApiDigestiveEventToResult(query.data)
      : undefined
    : eventId && (usingMockGate || !isApiConfigured())
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
  const needsAttention =
    hasSafetyFlags ||
    event.overallState === 'ATTENTION' ||
    event.overallState === 'VET_CONTACT';
  const headline =
    event.consumerHeadline ??
    digestiveHeadline(event.baselineComparison, dog.name, hasSafetyFlags);
  const summary =
    event.consumerSummary ??
    event.baselineComparison.replace(/Rocky/g, dog.name);

  return (
    <ScreenContainer scroll contentStyle={styles.content}>
      <StackScreenHeader title="Digestione" />

      <View
        style={[
          styles.resultHero,
          needsAttention ? styles.resultHeroAttention : styles.resultHeroRegular,
        ]}
      >
        <DogIllustration
          mood={needsAttention ? 'thinking' : 'welcome'}
          size={180}
        />
        <View
          style={[
            styles.resultIcon,
            needsAttention
              ? styles.resultIconAttention
              : styles.resultIconRegular,
          ]}
        >
          <Ionicons
            name={
              needsAttention
                ? 'alert-outline'
                : event.overallState === 'MONITOR'
                  ? 'eye-outline'
                  : 'checkmark'
            }
            size={30}
            color={needsAttention ? colors.danger : colors.accent}
          />
        </View>
        <Text style={styles.resultTitle}>{headline}</Text>
        <Text style={styles.resultSummary}>{summary}</Text>
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

      <Text style={styles.sectionTitle}>Rispetto a {dog.name}</Text>
      <Card style={styles.comparisonCard}>
        <Ionicons name="git-compare-outline" size={22} color={colors.primary} />
        <Text style={styles.comparisonText}>
          {event.baselineComparison.replace(/Rocky/g, dog.name)}
        </Text>
      </Card>

      {(event.possibleAssociations?.length ?? 0) > 0 ? (
        <>
          <Text style={styles.sectionTitle}>Un elemento da considerare</Text>
          <Card style={styles.contextCard}>
            {event.possibleAssociations?.map((item) => (
              <Text key={item} style={styles.contextText}>
                {item}
              </Text>
            ))}
          </Card>
        </>
      ) : null}

      <Text style={styles.sectionTitle}>Cosa fare</Text>
      <View
        style={[
          styles.monitorCard,
          event.overallState === 'ROUTINE' && styles.routineCard,
        ]}
      >
        <Ionicons
          name={
            needsAttention
              ? 'medkit-outline'
              : event.overallState === 'ROUTINE'
                ? 'checkmark-circle-outline'
                : 'eye-outline'
          }
          size={22}
          color={
            needsAttention
              ? colors.danger
              : event.overallState === 'ROUTINE'
                ? colors.accent
                : colors.warning
          }
        />
        <View style={styles.monitorCopy}>
          <Text style={styles.monitorTitle}>
            {event.recommendedNextStep ?? 'Controlla la prossima volta'}
          </Text>
          {!needsAttention ? (
            <Text style={styles.monitorText}>
              {event.overallState === 'ROUTINE'
                ? 'Continuerò a confrontare le prossime osservazioni con il suo solito.'
                : 'Se il cambiamento continua, registra la prossima evacuazione.'}
            </Text>
          ) : null}
        </View>
      </View>

      {useApi && event.followupQuestion && event.followupKey ? (
        <Card style={styles.questionCard}>
          <View style={styles.questionHeading}>
            <View style={styles.questionIcon}>
              <Ionicons name="sparkles" size={18} color={colors.primary} />
            </View>
            <Text style={styles.questionEyebrow}>Un dettaglio utile</Text>
          </View>
          <Text style={styles.questionText}>{event.followupQuestion}</Text>
          <View style={styles.answerRow}>
            {[
              { label: 'Sì', value: true },
              { label: 'No', value: false },
            ].map((answer) => (
              <Pressable
                key={answer.label}
                accessibilityRole="button"
                disabled={contextMutation.isPending}
                onPress={() =>
                  contextMutation.mutate({
                    key: event.followupKey!,
                    value: answer.value,
                  })
                }
                style={({ pressed }) => [
                  styles.answerButton,
                  pressed && styles.answerButtonPressed,
                ]}
              >
                <Text style={styles.answerButtonText}>{answer.label}</Text>
              </Pressable>
            ))}
          </View>
          {contextMutation.isError ? (
            <Text style={styles.questionError}>
              Non sono riuscito a salvare la risposta. Riprova.
            </Text>
          ) : null}
        </Card>
      ) : null}

      {notableCandidates.length > 0 ||
      event.activeFoodName ||
      event.observationReliability ? (
        <>
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ expanded: detailsOpen }}
            onPress={() => setDetailsOpen((open) => !open)}
            style={styles.detailsToggle}
          >
            <Text style={styles.detailsToggleText}>Approfondisci</Text>
            <Ionicons
              name={detailsOpen ? 'chevron-up' : 'chevron-down'}
              size={20}
              color={colors.textSecondary}
            />
          </Pressable>

          {detailsOpen ? (
            <>
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
                    <Ionicons
                      name="nutrition-outline"
                      size={20}
                      color={colors.primary}
                    />
                  </View>
                  <View style={styles.foodCopy}>
                    <Text style={styles.foodLabel}>Alimento registrato</Text>
                    <Text style={styles.foodValue} numberOfLines={2}>
                      {event.activeFoodName}
                    </Text>
                  </View>
                </View>
              ) : null}

            </>
          ) : null}
        </>
      ) : null}

      <View style={styles.disclaimer}>
        <Ionicons
          name="information-circle-outline"
          size={18}
          color={colors.textSecondary}
        />
        <View style={styles.disclaimerCopy}>
          <Text style={styles.disclaimerText}>{DIGESTIVE_DISCLAIMER}</Text>
        </View>
      </View>

      <Button
        title="Fatto"
        onPress={() => router.replace('/(tabs)/rocky')}
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

function digestiveHeadline(
  comparison: string,
  dogName: string,
  hasSafetyFlags: boolean,
): string {
  if (hasSafetyFlags) return 'C’è qualcosa da tenere d’occhio';
  if (comparison.startsWith('Più morbide')) {
    return `Oggi sembrano più morbide del solito di ${dogName}`;
  }
  if (comparison.startsWith('Più compatte')) {
    return `Oggi sembrano più compatte del solito di ${dogName}`;
  }
  if (comparison.startsWith('Simili')) {
    return `Oggi sembrano simili al solito di ${dogName}`;
  }
  return `Ecco cosa noto oggi per ${dogName}`;
}

const styles = StyleSheet.create({
  content: {
    width: '100%',
    maxWidth: 560,
    alignSelf: 'center',
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
  comparisonCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginBottom: spacing.lg,
  },
  comparisonText: {
    flex: 1,
    color: colors.text,
    fontSize: typography.size.sm,
    lineHeight: typography.size.sm * typography.lineHeight.relaxed,
  },
  contextCard: {
    gap: spacing.sm,
    marginBottom: spacing.lg,
    backgroundColor: colors.primarySoft,
  },
  contextText: {
    color: colors.text,
    fontSize: typography.size.sm,
    lineHeight: typography.size.sm * typography.lineHeight.relaxed,
  },
  monitorCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
    padding: spacing.lg,
    borderRadius: radius.lg,
    backgroundColor: colors.warningSoft,
    marginBottom: spacing.lg,
  },
  routineCard: {
    backgroundColor: colors.accentSoft,
  },
  monitorCopy: {
    flex: 1,
  },
  monitorTitle: {
    color: colors.text,
    fontSize: typography.size.md,
    fontWeight: typography.weight.bold,
  },
  monitorText: {
    marginTop: spacing.xs,
    color: colors.textSecondary,
    fontSize: typography.size.sm,
    lineHeight: typography.size.sm * typography.lineHeight.relaxed,
  },
  questionCard: {
    marginBottom: spacing.lg,
  },
  questionHeading: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  questionIcon: {
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 17,
    backgroundColor: colors.primarySoft,
  },
  questionEyebrow: {
    color: colors.primary,
    fontSize: typography.size.xs,
    fontWeight: typography.weight.bold,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  questionText: {
    marginTop: spacing.md,
    color: colors.text,
    fontSize: typography.size.md,
    fontWeight: typography.weight.semibold,
    lineHeight: typography.size.md * typography.lineHeight.normal,
  },
  answerRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.lg,
  },
  answerButton: {
    flex: 1,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.accent,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
  },
  answerButtonPressed: {
    backgroundColor: colors.accentSoft,
  },
  answerButtonText: {
    color: colors.accent,
    fontSize: typography.size.sm,
    fontWeight: typography.weight.bold,
  },
  questionError: {
    marginTop: spacing.sm,
    color: colors.danger,
    fontSize: typography.size.xs,
  },
  detailsToggle: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    marginBottom: spacing.lg,
  },
  detailsToggleText: {
    color: colors.text,
    fontSize: typography.size.md,
    fontWeight: typography.weight.semibold,
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
