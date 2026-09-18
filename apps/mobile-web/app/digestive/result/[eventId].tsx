/**
 * Risultato digestivo: lettura immediata, dettagli utili e safety deterministica.
 * Le anomalie non osservate non vengono elencate per evitare falsa rassicurazione.
 */
import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter, type Href } from 'expo-router';
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
  StackScreenHeader,
} from '@/features/secondary/components';
import {
  DIGESTIVE_DISCLAIMER,
  SAFETY_COPY,
} from '@/features/secondary/safetyCopy';
import { useDogProfile } from '@/features/core/useDogProfile';
import { sanitizeOwnerCopy } from '@/features/core/copy';
import {
  getDigestiveEvent,
  mapApiDigestiveEventToResult,
  updateDigestiveContext,
} from '@/features/digestive/api';
import {
  digestiveActionCardKind,
  digestiveNutritionHref,
} from '@/features/digestive/map';
import {
  DIGESTIVE_VET_SHARE_CTA,
  shareDigestiveWithVet,
} from '@/features/digestive/share';
import { isApiConfigured } from '@/features/auth/env';
import { useSession } from '@/features/auth/SessionProvider';
import type { FecalEventResult } from '@/features/secondary/types';

type LocalFeedback = 'useful' | 'not_useful' | null;

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
  const [vetShareError, setVetShareError] = useState(false);
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
      key: NonNullable<FecalEventResult['followupKey']>;
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

  if (useApi && query.isError) {
    return (
      <ScreenContainer style={styles.screen} scroll contentStyle={styles.content}>
        <StackScreenHeader title={`Digestione di ${dog.name}`} />
        <ErrorState
          title="Non riesco ad aprire questo momento"
          message="Controlla la connessione e riprova."
          retryLabel="Riprova"
          onRetry={() => void query.refetch()}
        />
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
        <StackScreenHeader title={`Digestione di ${dog.name}`} />
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
        <StackScreenHeader title={`Digestione di ${dog.name}`} />
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

  const status = statusOrientation(event.overallState);
  const headline = sanitizeOwnerCopy(
    (event.consumerHeadline ?? 'Il risultato di oggi').replace(
      /Rocky/g,
      dog.name,
    ),
  );
  const summary = sanitizeOwnerCopy(
    (event.consumerSummary ?? 'Guarda cosa emerge dalla foto.').replace(
      /Rocky/g,
      dog.name,
    ),
  );
  const advice = event.recommendedNextStep
    ? sanitizeOwnerCopy(event.recommendedNextStep.replace(/Rocky/g, dog.name))
    : '';
  const action = event.usefulAction;
  const actionKind = digestiveActionCardKind(action?.key);
  const showFollowup =
    useApi &&
    action?.key === 'ask_followup' &&
    event.followupQuestion &&
    event.followupKey;
  const showAdvice =
    Boolean(advice) &&
    actionKind !== 'vet' &&
    action?.key !== 'ask_followup';
  const nutritionKind =
    event.overallState !== 'ROUTINE' &&
    actionKind === 'nutrition';
  const interpretationLayers = event.interpretationLayers ?? [];
  const generalLayer = interpretationLayers.find(
    (layer) => layer.key === 'general',
  );
  const detailLayers = interpretationLayers.filter(
    (layer) => layer.key !== 'general',
  );
  const photoSummary = sanitizeOwnerCopy(
    (generalLayer?.summary ?? summary).replace(/Rocky/g, dog.name),
  );
  const whatToWatch =
    event.overallState !== 'ROUTINE'
      ? (event.whatToWatch ?? []).slice(0, 3)
      : [];

  return (
    <ScreenContainer style={styles.screen} scroll contentStyle={styles.content}>
      <StackScreenHeader title={`Digestione di ${dog.name}`} />

      <View style={styles.heroCard}>
        <View
          style={[
            styles.statusPill,
            status.kind === 'attention' || status.kind === 'vet'
              ? styles.statusPillAttention
              : status.kind === 'watch'
                ? styles.statusPillWatch
                : styles.statusPillOk,
          ]}
        >
          <Text
            style={[
              styles.statusPillText,
              status.kind === 'attention' || status.kind === 'vet'
                ? styles.statusPillTextAttention
                : status.kind === 'watch'
                  ? styles.statusPillTextWatch
                  : styles.statusPillTextOk,
            ]}
          >
            {status.label}
          </Text>
        </View>
        <Text style={styles.resultTitle}>{headline}</Text>
        <Text style={styles.resultSummary}>{summary}</Text>
        {showAdvice ? (
          <View style={styles.nextBlock}>
            <Text style={styles.nextKicker}>Cosa fare ora</Text>
            <Text style={styles.resultAdvice}>{advice}</Text>
          </View>
        ) : null}
      </View>

      {event.overallState === 'VET_CONTACT' ? (
        <View style={styles.vetContactCard}>
          <View style={styles.safetyHeading}>
            <Ionicons name="call" size={20} color={colors.danger} />
            <Text style={styles.safetyTitle}>Contatta il veterinario</Text>
          </View>
          <Text style={styles.safetyMessage}>
            Questo risultato richiede un confronto con il veterinario.
          </Text>
        </View>
      ) : null}

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

      {actionKind === 'vet' ? (
        <Card style={styles.actionCard}>
          <Button
            title={DIGESTIVE_VET_SHARE_CTA}
            onPress={() => {
              void (async () => {
                const shared = await shareDigestiveWithVet({
                  dogName: dog.name,
                  headline,
                  summary,
                  actionBody: action?.body,
                });
                setVetShareError(!shared);
              })();
            }}
          />
          {vetShareError ? (
            <Text style={styles.questionError}>
              Non sono riuscito ad aprire la condivisione. Puoi copiare il
              testo e inviarlo al veterinario.
            </Text>
          ) : null}
        </Card>
      ) : null}

      {showFollowup ? (
        <Card style={styles.questionCard}>
          <Text style={styles.questionText}>
            {sanitizeOwnerCopy(
              event.followupQuestion!.replace(/Rocky/g, dog.name),
            )}
          </Text>
          <View style={styles.answerRow}>
            {[
              { label: 'Sì', value: true },
              { label: 'No', value: false },
            ].map((answer) => (
              <Pressable
                key={answer.label}
                accessibilityRole="button"
                accessibilityLabel={answer.label}
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

      {nutritionKind ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${action?.title ?? 'Alimentazione non impostata'} ${action?.label ?? 'Aggiungi'}`}
          onPress={() =>
            router.push(digestiveNutritionHref(action?.href) as Href)
          }
          style={styles.nutritionQuiet}
        >
          <Text style={styles.nutritionQuietText}>
            {action?.title ?? 'Alimentazione non impostata'}
            {' · '}
            <Text style={styles.nutritionQuietAction}>
              {action?.label ?? 'Aggiungi'}
            </Text>
          </Text>
        </Pressable>
      ) : null}

      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: detailsOpen }}
        onPress={() => setDetailsOpen((open) => !open)}
        style={styles.detailsToggle}
      >
        <Text style={styles.detailsToggleText}>Scopri perché</Text>
        <Ionicons
          name={detailsOpen ? 'chevron-up' : 'chevron-down'}
          size={20}
          color={colors.textSecondary}
        />
      </Pressable>

      {detailsOpen ? (
        <>
          <View style={styles.whiteCard}>
            <Text style={styles.cardTitle}>Cosa ha considerato DOGly</Text>
            <Text style={styles.comparisonText}>{photoSummary}</Text>
          </View>
          {detailLayers.length > 0
            ? detailLayers.map((layer) => (
                <View key={layer.key} style={styles.whiteCard}>
                  <Text style={styles.cardTitle}>
                    {sanitizeOwnerCopy(layer.title.replace(/Rocky/g, dog.name))}
                  </Text>
                  <Text style={styles.comparisonText}>
                    {sanitizeOwnerCopy(layer.summary.replace(/Rocky/g, dog.name))}
                  </Text>
                </View>
              ))
            : null}
          {whatToWatch.length > 0 ? (
            <View style={styles.whiteCard}>
              <Text style={styles.cardTitle}>Se vuoi, osserva anche</Text>
              {whatToWatch.map((item) => (
                <View key={item} style={styles.watchRow}>
                  <Text style={styles.watchBullet}>•</Text>
                  <Text style={styles.comparisonText}>
                    {sanitizeOwnerCopy(item.replace(/Rocky/g, dog.name))}
                  </Text>
                </View>
              ))}
            </View>
          ) : null}
          {(event.possibleAssociations?.length ?? 0) > 0
            ? event.possibleAssociations?.map((item) => (
                <Text key={item} style={styles.contextText}>
                  {sanitizeOwnerCopy(item.replace(/Rocky/g, dog.name))}
                </Text>
              ))
            : null}
          {event.observationReliability ? (
            <Text style={styles.comparisonText}>
              {sanitizeOwnerCopy(event.observationReliability)}
            </Text>
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
        </>
      ) : null}

      <View style={styles.footerRow}>
        <View style={styles.thumbsRow}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Utile"
            accessibilityState={{ selected: feedback === 'useful' }}
            onPress={() => setFeedback('useful')}
            style={[
              styles.thumbButton,
              feedback === 'useful' && styles.thumbButtonSelected,
            ]}
          >
            <Text style={styles.thumbGlyph}>👍</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Non utile"
            accessibilityState={{ selected: feedback === 'not_useful' }}
            onPress={() => setFeedback('not_useful')}
            style={[
              styles.thumbButton,
              feedback === 'not_useful' && styles.thumbButtonSelected,
            ]}
          >
            <Text style={styles.thumbGlyph}>👎</Text>
          </Pressable>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Fatto"
          onPress={() => router.replace('/(tabs)/home')}
          hitSlop={8}
        >
          <Text style={styles.doneText}>Fatto</Text>
        </Pressable>
      </View>
    </ScreenContainer>
  );
}

function statusOrientation(
  state?: 'ROUTINE' | 'MONITOR' | 'ATTENTION' | 'VET_CONTACT',
): { label: string; kind: 'ok' | 'watch' | 'attention' | 'vet' } {
  if (state === 'VET_CONTACT') {
    return { label: 'Veterinario', kind: 'vet' };
  }
  if (state === 'ATTENTION') {
    return { label: 'Attenzione', kind: 'attention' };
  }
  if (state === 'MONITOR') {
    return { label: 'Da seguire', kind: 'watch' };
  }
  return { label: 'Regolare', kind: 'ok' };
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
  statusPillOk: {
    backgroundColor: colors.tealSoft,
  },
  statusPillWatch: {
    backgroundColor: '#FFF7D6',
  },
  statusPillAttention: {
    backgroundColor: '#FFF1EE',
  },
  statusPillText: {
    fontSize: 13,
    fontWeight: typography.weight.bold,
    letterSpacing: 0.3,
    textTransform: 'uppercase',
  },
  statusPillTextOk: {
    color: colors.teal,
  },
  statusPillTextWatch: {
    color: '#9A6700',
  },
  statusPillTextAttention: {
    color: colors.coral,
  },
  vetContactCard: {
    padding: spacing.lg,
    borderRadius: 20,
    borderWidth: 2,
    borderColor: colors.danger,
    backgroundColor: colors.dangerSoft,
    marginBottom: spacing.lg,
  },
  watchRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  watchBullet: {
    color: '#9A6700',
    fontSize: typography.size.md,
    fontWeight: typography.weight.bold,
  },
  actionCard: {
    marginBottom: spacing.lg,
    gap: spacing.md,
  },
  actionTitle: {
    color: colors.text,
    fontSize: typography.size.md,
    fontWeight: typography.weight.bold,
  },
  actionBody: {
    color: colors.textSecondary,
    fontSize: typography.size.sm,
    lineHeight: typography.size.sm * typography.lineHeight.relaxed,
  },
  contextualText: {
    marginBottom: spacing.lg,
    color: colors.text,
    fontSize: typography.size.sm,
    lineHeight: typography.size.sm * typography.lineHeight.relaxed,
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
  resultAdvice: {
    marginTop: spacing.xs,
    color: '#1A2B48',
    fontSize: typography.size.md,
    fontWeight: typography.weight.semibold,
    lineHeight: typography.size.md * typography.lineHeight.normal,
    textAlign: 'center',
  },
  nextBlock: {
    marginTop: spacing.lg,
    alignSelf: 'stretch',
  },
  nextKicker: {
    color: '#64748B',
    fontSize: typography.size.xs,
    fontWeight: typography.weight.bold,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
    textAlign: 'center',
    marginBottom: spacing.xs,
  },
  nutritionQuiet: {
    alignSelf: 'center',
    minHeight: 44,
    justifyContent: 'center',
    marginBottom: spacing.md,
    paddingHorizontal: spacing.sm,
  },
  nutritionQuietText: {
    color: '#64748B',
    fontSize: typography.size.sm,
    textAlign: 'center',
  },
  nutritionQuietAction: {
    color: colors.teal,
    fontWeight: typography.weight.bold,
  },
  footerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.sm,
  },
  thumbsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  thumbButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 20,
  },
  thumbButtonSelected: {
    backgroundColor: colors.surfaceMuted,
  },
  thumbGlyph: {
    fontSize: 18,
  },
  doneText: {
    color: '#64748B',
    fontSize: typography.size.sm,
    fontWeight: typography.weight.semibold,
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
