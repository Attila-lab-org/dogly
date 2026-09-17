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
  ErrorState,
  ScreenContainer,
} from '@/components';
import { colors, radius, shadows, spacing, typography } from '@/theme/tokens';
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

type LocalFeedback = 'useful' | 'not_useful' | null;

function statusPillFor(event: {
  overallState?: 'ROUTINE' | 'MONITOR' | 'ATTENTION' | 'VET_CONTACT';
  safetyFlags: SafetyFlagCode[];
}): { label: string; bg: string; fg: string } {
  const needsAttention =
    event.safetyFlags.length > 0 ||
    event.overallState === 'ATTENTION' ||
    event.overallState === 'VET_CONTACT';
  if (needsAttention) {
    return { label: 'Attenzione', bg: '#FFF1EE', fg: colors.coral };
  }
  if (event.overallState === 'MONITOR') {
    return { label: 'Variazione', bg: '#FFF1EE', fg: colors.coral };
  }
  return { label: 'Regolare', bg: '#E0F7F6', fg: colors.teal };
}

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
  const [feedback, setFeedback] = useState<LocalFeedback>(null);
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
    : eventId && usingMockGate
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
      <ScreenContainer style={styles.screen}>
        <ErrorState title="Caricamento" message="Sto aprendo il risultato…" />
      </ScreenContainer>
    );
  }

  if (stillProcessing) {
    return (
      <ScreenContainer style={styles.screen}>
        <ErrorState
          title="Analisi in corso"
          message="Ti porto allo stato dell'analisi…"
        />
      </ScreenContainer>
    );
  }

  if (!event) {
    return (
      <ScreenContainer style={styles.screen} scroll contentStyle={styles.content}>
        <StackScreenHeader title="Esito digestione" />
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
      <ScreenContainer style={styles.screen} scroll contentStyle={styles.content}>
        <StackScreenHeader title="Esito digestione" />
        <View style={styles.emptyVisual}>
          <View style={styles.warningIcon}>
            <Ionicons name="camera-outline" size={34} color={colors.warning} />
          </View>
          <Text style={styles.emptyTitle}>Serve un’altra foto</Text>
          <Text style={styles.emptySubtitle}>
            Questa non è abbastanza nitida per un risultato affidabile. La
            prova non viene conteggiata.
          </Text>
        </View>

        <View style={styles.whiteCard}>
          <Text style={styles.cardTitle}>Per migliorarla</Text>
          {event.qualityWarnings.map((warning) => (
            <View key={warning} style={styles.tipRow}>
              <Ionicons name="checkmark" size={17} color={colors.teal} />
              <Text style={styles.tipText}>{warning}</Text>
            </View>
          ))}
        </View>

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
          onPress={() => router.replace('/(tabs)/home')}
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
  const statusPill = statusPillFor(event);

  return (
    <ScreenContainer style={styles.screen} scroll contentStyle={styles.content}>
      <StackScreenHeader title="Esito digestione" />

      <View style={styles.heroCard}>
        <View style={[styles.statusPill, { backgroundColor: statusPill.bg }]}>
          <Text style={[styles.statusPillText, { color: statusPill.fg }]}>
            {statusPill.label}
          </Text>
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
      <View style={styles.whiteCardRow}>
        <Ionicons name="git-compare-outline" size={22} color={colors.teal} />
        <Text style={styles.comparisonText}>
          {event.baselineComparison.replace(/Rocky/g, dog.name)}
        </Text>
      </View>

      {(event.possibleAssociations?.length ?? 0) > 0 ? (
        <>
          <Text style={styles.sectionTitle}>Un elemento da considerare</Text>
          <View style={[styles.whiteCard, styles.contextCard]}>
            {event.possibleAssociations?.map((item) => (
              <Text key={item} style={styles.contextText}>
                {item}
              </Text>
            ))}
          </View>
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
                ? colors.teal
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
                <View style={styles.whiteCard}>
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
                </View>
              ) : null}

              {event.activeFoodName ? (
                <View style={styles.foodRow}>
                  <View style={styles.foodIcon}>
                    <Ionicons
                      name="nutrition-outline"
                      size={20}
                      color={colors.teal}
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

      <View style={styles.actionPills}>
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ selected: feedback === 'useful' }}
          onPress={() => setFeedback('useful')}
          style={[
            styles.feedbackPill,
            styles.feedbackUseful,
            feedback === 'useful' && styles.feedbackUsefulSelected,
          ]}
        >
          <Ionicons name="thumbs-up-outline" size={18} color={colors.teal} />
          <Text style={[styles.feedbackPillText, { color: colors.teal }]}>
            Sembra corretto
          </Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ selected: feedback === 'not_useful' }}
          onPress={() => setFeedback('not_useful')}
          style={[
            styles.feedbackPill,
            styles.feedbackNotUseful,
            feedback === 'not_useful' && styles.feedbackNotUsefulSelected,
          ]}
        >
          <Ionicons name="thumbs-down-outline" size={18} color={colors.coral} />
          <Text style={[styles.feedbackPillText, { color: colors.coral }]}>
            Non convincente
          </Text>
        </Pressable>
        <Button
          title="Salva nel diario"
          variant="outline"
          icon={
            <Ionicons name="bookmark-outline" size={18} color={colors.teal} />
          }
          onPress={() => router.replace('/(tabs)/diary')}
          testID="digestive-save-diary"
        />
        <Button
          title="Fatto"
          onPress={() => router.replace('/(tabs)/home')}
        />
      </View>
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
        <Ionicons name={icon} size={20} color={colors.teal} />
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
  screen: {
    backgroundColor: '#F8FAFC',
  },
  content: {
    width: '100%',
    maxWidth: 560,
    alignSelf: 'center',
    paddingBottom: spacing.xxxl,
  },
  heroCard: {
    alignItems: 'center',
    padding: spacing.xl,
    borderRadius: 20,
    marginBottom: spacing.lg,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#EDF2F7',
    ...shadows.card,
  },
  statusPill: {
    borderRadius: radius.full,
    paddingVertical: 6,
    paddingHorizontal: 16,
    marginBottom: spacing.md,
  },
  statusPillText: {
    fontSize: 13,
    fontWeight: typography.weight.bold,
  },
  resultTitle: {
    color: '#1A2B48',
    fontSize: typography.size.xl,
    fontWeight: typography.weight.bold,
    textAlign: 'center',
  },
  resultSummary: {
    marginTop: spacing.sm,
    color: '#64748B',
    fontSize: typography.size.sm,
    lineHeight: typography.size.sm * typography.lineHeight.relaxed,
    textAlign: 'center',
  },
  safetyCard: {
    padding: spacing.lg,
    borderRadius: 20,
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
    color: '#1A2B48',
    fontSize: typography.size.lg,
    fontWeight: typography.weight.bold,
  },
  metrics: {
    flexDirection: 'row',
    gap: spacing.md,
    marginBottom: spacing.md,
  },
  whiteCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#EDF2F7',
    padding: spacing.lg,
    marginBottom: spacing.lg,
    ...shadows.card,
  },
  whiteCardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#EDF2F7',
    padding: spacing.lg,
    marginBottom: spacing.lg,
    ...shadows.card,
  },
  comparisonText: {
    flex: 1,
    color: '#1A2B48',
    fontSize: typography.size.sm,
    lineHeight: typography.size.sm * typography.lineHeight.relaxed,
  },
  contextCard: {
    gap: spacing.sm,
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
    borderRadius: 20,
    backgroundColor: colors.warningSoft,
    marginBottom: spacing.lg,
  },
  routineCard: {
    backgroundColor: colors.tealSoft,
  },
  monitorCopy: {
    flex: 1,
  },
  monitorTitle: {
    color: '#1A2B48',
    fontSize: typography.size.md,
    fontWeight: typography.weight.bold,
  },
  monitorText: {
    marginTop: spacing.xs,
    color: '#64748B',
    fontSize: typography.size.sm,
    lineHeight: typography.size.sm * typography.lineHeight.relaxed,
  },
  questionCard: {
    marginBottom: spacing.lg,
    borderRadius: 20,
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
    color: '#1A2B48',
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
    borderColor: colors.teal,
    borderRadius: radius.full,
    backgroundColor: colors.surface,
  },
  answerButtonPressed: {
    backgroundColor: colors.tealSoft,
  },
  answerButtonText: {
    color: colors.teal,
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
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#EDF2F7',
    marginBottom: spacing.lg,
  },
  detailsToggleText: {
    color: '#1A2B48',
    fontSize: typography.size.md,
    fontWeight: typography.weight.semibold,
  },
  metricCard: {
    flex: 1,
    minHeight: 132,
    padding: spacing.lg,
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#EDF2F7',
    ...shadows.card,
  },
  metricIcon: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.tealSoft,
  },
  metricLabel: {
    marginTop: spacing.md,
    color: '#64748B',
    fontSize: typography.size.xs,
  },
  metricValue: {
    marginTop: spacing.xs,
    color: '#1A2B48',
    fontSize: typography.size.md,
    fontWeight: typography.weight.bold,
  },
  cardTitle: {
    marginBottom: spacing.md,
    color: '#1A2B48',
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
    color: '#1A2B48',
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
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#EDF2F7',
    marginBottom: spacing.lg,
    ...shadows.card,
  },
  foodIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.tealSoft,
  },
  foodCopy: {
    flex: 1,
  },
  foodLabel: {
    color: '#64748B',
    fontSize: typography.size.xs,
  },
  foodValue: {
    marginTop: spacing.xs,
    color: '#1A2B48',
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
  actionPills: {
    gap: spacing.sm,
  },
  feedbackPill: {
    height: 50,
    borderRadius: radius.full,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingHorizontal: 20,
    borderWidth: 1.5,
    backgroundColor: '#FFFFFF',
    shadowColor: '#0E2A47',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
  },
  feedbackUseful: {
    borderColor: colors.teal,
  },
  feedbackNotUseful: {
    borderColor: colors.coral,
  },
  feedbackUsefulSelected: {
    backgroundColor: colors.tealSoft,
    transform: [{ scale: 0.99 }],
  },
  feedbackNotUsefulSelected: {
    backgroundColor: colors.coralSoft,
    transform: [{ scale: 0.99 }],
  },
  feedbackPillText: {
    fontSize: 15,
    fontWeight: typography.weight.bold,
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
    color: '#1A2B48',
    fontSize: typography.size.xl,
    fontWeight: typography.weight.bold,
  },
  emptySubtitle: {
    marginTop: spacing.sm,
    color: '#64748B',
    fontSize: typography.size.sm,
    textAlign: 'center',
  },
  tipRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.xs,
  },
  tipText: {
    flex: 1,
    color: '#1A2B48',
    fontSize: typography.size.sm,
  },
});
