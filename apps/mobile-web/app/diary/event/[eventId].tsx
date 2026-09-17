/**
 * Dettaglio episodio del Diario (Spec V1 sez. 5.1, 6).
 * - Lookup prima API (GET /v1/behavior/events/{id}) per gli eventi reali,
 *   poi fallback mock (mock gate dev / id mock).
 * - Evento comportamentale: contratto risultato 6.1 completo (riusa
 *   BehaviorResultView), incluso feedback a tre vie.
 * - Evento digestivo: riepilogo e link alla schermata dedicata (F2).
 * - Media cancellato dalla retention: avviso esplicito (stato "deleted media").
 * La riga del Diario passa domain/occurredAt/deleted/title come params così
 * la schermata ha un contesto minimo anche prima della risposta API.
 *
 * Layout Screen 2: nav "Dettaglio evento", hero circolare, Perché?, feedback.
 */
import React, { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { Button, Card, ErrorState, ScreenContainer } from '@/components';
import { colors, radius, spacing, typography } from '@/theme/tokens';
import type { FeedbackValue } from '@/contracts/types';
import { BehaviorResultView, SectionHeader } from '@/features/core/components';
import { saveBehaviorFeedback } from '@/features/core/feedback';
import { useDogProfile } from '@/features/core/useDogProfile';
import { isApiConfigured } from '@/features/auth/env';
import { useSession } from '@/features/auth/SessionProvider';
import {
  getBehaviorEvent,
  mapApiEventToResult,
} from '@/features/behavior/api';
import { queryKeys } from '@/lib/queryClient';
import { isPersistedId } from '@/lib/persistedId';
import type { DiaryDomain } from '@/features/core/types';
import {
  AdviceCard,
  AdviceOutcomePrompt,
} from '@/features/advice/AdviceCard';
import { mapApiAdviceItem } from '@/features/advice/map';
import { selectAdvice } from '@/features/advice/logic';

const NAVY = '#1A2B48';

export default function DiaryEventScreen() {
  const router = useRouter();
  const { dog } = useDogProfile();
  const { userId } = useSession();
  const params = useLocalSearchParams<{
    eventId: string;
    domain?: string;
    occurredAt?: string;
    deleted?: string;
    title?: string;
    subtitle?: string;
  }>();
  const { eventId } = params;

  const domain: DiaryDomain =
    params.domain === 'DIGESTIVE' ? 'DIGESTIVE' : 'BEHAVIOR';
  const mediaDeleted = params.deleted === '1';
  const occurredAt = params.occurredAt ?? null;

  const useApi =
    domain === 'BEHAVIOR' &&
    Boolean(userId) &&
    isPersistedId(eventId) &&
    isApiConfigured();

  const query = useQuery({
    queryKey: queryKeys.behaviorEvent(userId ?? 'anon', dog.id, eventId ?? ''),
    queryFn: () => getBehaviorEvent(eventId!),
    enabled: useApi,
  });

  const behaviorResult =
    domain === 'BEHAVIOR' && query.data
      ? mapApiEventToResult(query.data)
      : undefined;
  const advice = behaviorResult
    ? selectAdvice(behaviorResult, {
        apiAdvice: mapApiAdviceItem(query.data?.advice),
      })
    : null;

  const [feedback, setFeedback] = useState<FeedbackValue | null>(
    behaviorResult?.feedback ?? null,
  );

  useEffect(() => {
    if (behaviorResult?.feedback) setFeedback(behaviorResult.feedback);
  }, [behaviorResult?.feedback]);

  const behaviorNotCompleted =
    domain === 'BEHAVIOR' &&
    behaviorResult !== undefined &&
    behaviorResult.status !== 'COMPLETED';
  useEffect(() => {
    if (behaviorNotCompleted && behaviorResult) {
      router.replace(`/behavior/processing/${behaviorResult.eventId}`);
    }
  }, [behaviorNotCompleted, behaviorResult, router]);

  if (useApi && query.isLoading) {
    return (
      <ScreenContainer style={styles.whiteScreen}>
        <ErrorState title="Caricamento" message="Sto aprendo l'episodio…" />
      </ScreenContainer>
    );
  }

  if (!behaviorResult && domain === 'BEHAVIOR') {
    return (
      <ScreenContainer style={styles.whiteScreen}>
        <ErrorState
          title="Episodio non trovato"
          message={
            useApi && query.isError
              ? 'Non riesco ad aprire questo episodio: controlla la connessione e riprova.'
              : 'Non riesco ad aprire questo episodio del diario.'
          }
          onRetry={useApi && query.isError ? () => void query.refetch() : undefined}
        />
        <Button title="Torna al Diario" onPress={() => router.back()} />
      </ScreenContainer>
    );
  }

  if (behaviorNotCompleted) {
    return (
      <ScreenContainer style={styles.whiteScreen}>
        <ErrorState
          title="Analisi non ancora conclusa"
          message="Ti porto allo stato corretto dell’analisi…"
        />
      </ScreenContainer>
    );
  }

  const occurredLabel = occurredAt
    ? new Date(occurredAt).toLocaleDateString('it-IT', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        hour: '2-digit',
        minute: '2-digit',
      })
    : (behaviorResult?.created_at
        ? new Date(behaviorResult.created_at).toLocaleDateString('it-IT', {
            weekday: 'long',
            day: 'numeric',
            month: 'long',
            hour: '2-digit',
            minute: '2-digit',
          })
        : null);

  const handleFeedback = (
    value: FeedbackValue,
    extras?: { correction_label?: string | null },
  ) => {
    if (!behaviorResult) return;
    void saveBehaviorFeedback(
      behaviorResult.eventId,
      value,
      extras,
    ).then(setFeedback);
  };

  const entryTitle = params.title ?? null;
  const entrySubtitle = params.subtitle || null;
  const entryRefId = eventId ?? '';

  return (
    <ScreenContainer padded={false} style={styles.whiteScreen}>
      <View style={styles.topBar}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Indietro"
          onPress={() => router.back()}
          hitSlop={12}
          style={styles.topSide}
        >
          <Ionicons name="chevron-back" size={24} color={NAVY} />
        </Pressable>
        <Text style={styles.topTitle}>Dettaglio evento</Text>
        <View style={styles.topSide} />
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {occurredLabel ? <Text style={styles.date}>{occurredLabel}</Text> : null}

        {mediaDeleted && (
          <View style={styles.deletedBanner}>
            <Ionicons name="trash-bin-outline" size={16} color={colors.textSecondary} />
            <Text style={styles.deletedText}>
              Il video di questo episodio è stato eliminato secondo le tue
              impostazioni di privacy. Il risultato resta disponibile.
            </Text>
          </View>
        )}

        {domain === 'BEHAVIOR' && behaviorResult ? (
          <>
            <BehaviorResultView
              result={behaviorResult}
              dogName={dog.name}
              feedback={feedback}
              onFeedback={handleFeedback}
              photoUri={dog.photoUri}
              primaryAdvice={
                advice ? (
                  <>
                    <AdviceCard advice={advice} dogName={dog.name} />
                    <AdviceOutcomePrompt
                      eventId={behaviorResult.eventId}
                      adviceCode={advice.code}
                      existingOutcome={query.data?.advice_outcome}
                      deferred
                    />
                  </>
                ) : null
              }
            />
          </>
        ) : (
          /* Evento digestivo: il dettaglio completo vive nel flusso F2 */
          <Card>
            <SectionHeader
              title={entryTitle ?? 'Controllo digestione'}
              icon={<Ionicons name="leaf-outline" size={18} color={colors.accent} />}
            />
            {entrySubtitle ? (
              <Text style={styles.digestiveSubtitle}>{entrySubtitle}</Text>
            ) : null}
            <Button
              title="Apri il controllo digestione"
              variant="outline"
              onPress={() => router.push(`/digestive/result/${entryRefId}`)}
              style={styles.digestiveButton}
            />
          </Card>
        )}
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  whiteScreen: {
    backgroundColor: '#FFFFFF',
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    backgroundColor: '#FFFFFF',
  },
  topSide: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  topTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: NAVY,
  },
  content: {
    padding: spacing.lg,
    paddingBottom: spacing.xxxl,
    backgroundColor: '#FFFFFF',
  },
  date: {
    fontSize: typography.size.sm,
    color: colors.textSecondary,
    marginBottom: spacing.md,
  },
  deletedBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.lg,
  },
  deletedText: {
    flex: 1,
    fontSize: typography.size.xs,
    color: colors.textSecondary,
    lineHeight: typography.size.xs * typography.lineHeight.relaxed,
  },
  digestiveSubtitle: {
    fontSize: typography.size.sm,
    color: colors.textSecondary,
    marginBottom: spacing.md,
  },
  digestiveButton: {
    marginTop: spacing.sm,
  },
});
