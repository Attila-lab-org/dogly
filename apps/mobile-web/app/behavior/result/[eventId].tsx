/**
 * Behavior result — GET evento reale + POST feedback.
 * Layout Screen 2: nav Risultato, hero circolare, Perché?, feedback pills.
 */
import React, { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { Button, Card, ErrorState, ScreenContainer } from '@/components';
import { colors, spacing, typography } from '@/theme/tokens';
import type { FeedbackValue } from '@/contracts/types';
import { BehaviorResultView } from '@/features/core/components';
import { saveBehaviorFeedback } from '@/features/core/feedback';
import { shareBehaviorResult } from '@/features/behavior/share';
import { behaviorResultsMock } from '@/mocks/core';
import { useDogProfile } from '@/features/core/useDogProfile';
import { useCheckIn } from '@/features/checkin/store';
import {
  getBehaviorEvent,
  mapApiEventToResult,
  postBehaviorContext,
} from '@/features/behavior/api';
import { contextAnswersForQuestion } from '@/features/behavior/contextQuestion';
import { isApiConfigured } from '@/features/auth/env';
import { AdviceCard } from '@/features/advice/AdviceCard';
import { mapApiAdviceItem } from '@/features/advice/map';
import { selectAdvice } from '@/features/advice/logic';
import { useSession } from '@/features/auth/SessionProvider';
import { queryKeys } from '@/lib/queryClient';
import { isPersistedId } from '@/lib/persistedId';

const NAVY = '#1A2B48';

export default function BehaviorResultScreen() {
  const router = useRouter();
  const { dog } = useDogProfile();
  const { userId, usingMockGate } = useSession();
  const { analysisContext } = useCheckIn();
  const { eventId } = useLocalSearchParams<{ eventId: string }>();
  const useApi =
    isApiConfigured() &&
    Boolean(userId) &&
    isPersistedId(eventId) &&
    !usingMockGate;

  const query = useQuery({
    queryKey: queryKeys.behaviorEvent(
      userId ?? 'anon',
      dog.id,
      eventId ?? '',
    ),
    queryFn: () => getBehaviorEvent(eventId!),
    enabled: useApi,
  });

  const result = useApi
    ? query.data
      ? mapApiEventToResult(query.data)
      : undefined
    : usingMockGate && eventId
      ? behaviorResultsMock[eventId]
      : undefined;
  const advice = result
    ? selectAdvice(result, {
        apiAdvice: useApi ? mapApiAdviceItem(query.data?.advice) : null,
        useMockCatalog: !useApi,
      })
    : null;

  const [feedback, setFeedback] = useState<FeedbackValue | null>(
    result?.feedback ?? null,
  );
  const [savingFeedback, setSavingFeedback] = useState(false);
  const [feedbackError, setFeedbackError] = useState<string | null>(null);
  const [refiningContext, setRefiningContext] = useState(false);
  const [contextError, setContextError] = useState<string | null>(null);
  const [contextDismissed, setContextDismissed] = useState(false);
  const contextAnswers = contextAnswersForQuestion(result?.context_question);

  useEffect(() => {
    if (result?.feedback) setFeedback(result.feedback);
  }, [result?.feedback]);

  const notCompleted = result !== undefined && result.status !== 'COMPLETED';
  useEffect(() => {
    if (notCompleted && result) {
      router.replace(`/behavior/processing/${result.eventId}`);
    }
  }, [notCompleted, result, router]);

  if (useApi && query.isLoading) {
    return (
      <ScreenContainer style={styles.whiteScreen}>
        <ErrorState title="Caricamento" message="Sto aprendo il risultato…" />
      </ScreenContainer>
    );
  }

  if (!result) {
    return (
      <ScreenContainer style={styles.whiteScreen}>
        <ErrorState
          title="Risultato non trovato"
          message="Non riesco ad aprire questa analisi. Controlla il Diario."
        />
        <Button
          title="Apri il Diario"
          onPress={() => router.replace('/(tabs)/diary')}
        />
      </ScreenContainer>
    );
  }

  if (notCompleted) {
    return (
      <ScreenContainer style={styles.whiteScreen}>
        <ErrorState
          title="Analisi in corso"
          message="Ti porto allo stato dell'analisi…"
        />
      </ScreenContainer>
    );
  }

  const handleFeedback = async (
    value: FeedbackValue,
    extras?: { correction_label?: string | null },
  ) => {
    setSavingFeedback(true);
    setFeedbackError(null);
    try {
      const saved = await saveBehaviorFeedback(
        result.eventId,
        value,
        usingMockGate,
        extras,
      );
      setFeedback(saved);
    } catch {
      // Mai finto "Salvato": badge errore onesto, l'utente può riprovare.
      setFeedback(null);
      setFeedbackError('Non salvato — riprova');
    } finally {
      setSavingFeedback(false);
    }
  };
  const handleContext = async (
    contextBucket: (typeof contextAnswers)[number]['contextBucket'],
  ) => {
    if (contextBucket == null) {
      setContextDismissed(true);
      return;
    }
    if (!useApi || refiningContext) return;
    setRefiningContext(true);
    setContextError(null);
    try {
      await postBehaviorContext(result.eventId, contextBucket);
      await query.refetch();
    } catch {
      setContextError('Non sono riuscito ad aggiornare la lettura. Riprova.');
    } finally {
      setRefiningContext(false);
    }
  };

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
        <Text style={styles.topTitle}>Risultato</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Condividi"
          onPress={() =>
            void shareBehaviorResult(result, dog.name, dog.photoUri)
          }
          hitSlop={12}
          style={styles.topSide}
          testID="share-result"
        >
          <Ionicons name="share-outline" size={22} color={NAVY} />
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <BehaviorResultView
          result={result}
          dogName={dog.name}
          feedback={feedback}
          feedbackError={feedbackError}
          onFeedback={(v, extras) => {
            if (!savingFeedback) void handleFeedback(v, extras);
          }}
          careNote={
            !result.baseline_note && analysisContext?.concern === 'off'
              ? analysisContext.note
              : null
          }
          photoUri={dog.photoUri}
          onSaveDiary={() => router.replace('/(tabs)/diary')}
          contextPrompt={
            result.needs_context &&
            result.context_question &&
            contextAnswers.length > 0 &&
            !contextDismissed ? (
              <Card style={styles.contextCard} testID="behavior-context-question">
                <Text style={styles.contextKicker}>Una cosa può aiutarmi</Text>
                <Text style={styles.contextQuestion}>
                  {result.context_question}
                </Text>
                <View style={styles.contextAnswers}>
                  {contextAnswers.map((answer) => (
                    <Button
                      key={answer.label}
                      title={answer.label}
                      variant={
                        answer.contextBucket == null ? 'outline' : 'secondary'
                      }
                      disabled={refiningContext}
                      loading={
                        refiningContext && answer.contextBucket != null
                      }
                      onPress={() => void handleContext(answer.contextBucket)}
                      style={styles.contextAnswer}
                    />
                  ))}
                </View>
                {contextError ? (
                  <Text style={styles.contextError}>{contextError}</Text>
                ) : null}
              </Card>
            ) : null
          }
          primaryAdvice={
            advice ? <AdviceCard advice={advice} dogName={dog.name} /> : null
          }
        />
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
  contextCard: {
    marginTop: spacing.md,
  },
  contextKicker: {
    color: colors.accent,
    fontSize: typography.size.xs,
    fontWeight: typography.weight.bold,
    textTransform: 'uppercase',
  },
  contextQuestion: {
    marginTop: spacing.xs,
    color: colors.text,
    fontSize: typography.size.md,
    fontWeight: typography.weight.semibold,
  },
  contextAnswers: {
    marginTop: spacing.md,
    flexDirection: 'row',
    gap: spacing.sm,
  },
  contextAnswer: {
    flex: 1,
  },
  contextError: {
    marginTop: spacing.sm,
    color: colors.danger,
    fontSize: typography.size.xs,
  },
});
