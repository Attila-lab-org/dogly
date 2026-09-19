import React, { useEffect, useReducer, useRef } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { colors, radius, spacing, typography } from '../../theme/tokens';
import { queryKeys } from '../../lib/queryClient';
import {
  getProcessingContext,
  isProcessingCollecting,
  postProcessingContext,
} from './api';
import type { BehaviorEventStatus } from '../../contracts/types';
import {
  PROCESSING_ACK_MS,
  answeredCountCopy,
  initialProcessingCardState,
  reduceProcessingCard,
} from './processingContextMachine';

export function ProcessingContextCard({
  eventId,
  dogId,
  userId,
  enabled,
  finishing,
  analysisStatus,
}: {
  eventId: string;
  dogId: string;
  userId: string;
  enabled: boolean;
  finishing: boolean;
  analysisStatus?: BehaviorEventStatus | string | null;
}) {
  const queryClient = useQueryClient();
  const [state, dispatch] = useReducer(
    reduceProcessingCard,
    undefined,
    initialProcessingCardState,
  );
  const pollGeneration = useRef(0);
  const collecting = !finishing && isProcessingCollecting(analysisStatus);
  const busy = state.answerState === 'sending';
  const acknowledging =
    state.answerState === 'acquired' || state.answerState === 'too_late';
  const pausePolling = busy || acknowledging;
  const queryKey = queryKeys.processingContext(userId, dogId, eventId);

  const query = useQuery({
    queryKey,
    queryFn: () => getProcessingContext(eventId),
    enabled: enabled && collecting && !pausePolling,
    staleTime: 4_000,
    refetchInterval: collecting && !pausePolling ? 2_500 : false,
  });

  useEffect(() => {
    if (!query.data) return;
    dispatch({
      type: 'POLL',
      payload: query.data,
      generation: pollGeneration.current,
    });
  }, [query.data]);

  useEffect(() => {
    if (!acknowledging) return;
    const timer = setTimeout(() => dispatch({ type: 'ACK_DONE' }), PROCESSING_ACK_MS);
    return () => clearTimeout(timer);
  }, [acknowledging, state.mutationGeneration]);

  const mutation = useMutation({
    mutationFn: (body: {
      question_id: string;
      answer_id?: string;
      skipped?: boolean;
    }) => postProcessingContext(eventId, body),
    onMutate: async () => {
      pollGeneration.current += 1;
      await queryClient.cancelQueries({ queryKey });
      dispatch({ type: 'MUTATION_START' });
    },
    onSuccess: (next, variables) => {
      queryClient.setQueryData(queryKey, next);
      pollGeneration.current += 1;
      const selectedLabel = state.locked?.options.find(
        (option) => option.id === variables.answer_id,
      )?.label;
      dispatch({
        type: 'MUTATION_SUCCESS',
        payload: next,
        selectedLabel,
      });
    },
    onError: () => dispatch({ type: 'MUTATION_ERROR' }),
  });

  const showCard =
    !finishing &&
    (Boolean(state.locked) ||
      state.acceptedAnswers.length > 0 ||
      acknowledging);
  if (!showCard) return null;

  const question = state.locked;
  const helper =
    state.acceptedAnswers.length === 0
      ? 'Se ho bisogno, ti farò fino a 3 domande mentre analizzo.'
      : 'Quello che mi racconti mi aiuta a leggere il contesto.';
  const countCopy = answeredCountCopy(state.acceptedAnswers.length);

  return (
    <View style={styles.wrap} testID="processing-context-card">
      <Text style={styles.heading}>Intanto, aiutami a capire meglio</Text>
      {state.acceptedAnswers.map((item) => (
        <Text
          key={item.questionId}
          style={styles.accepted}
          testID={`processing-accepted-${item.questionId}`}
        >
          ✓ {item.title}: {item.label}
        </Text>
      ))}
      {state.answerState === 'acquired' && !state.skipped ? (
        <Text style={styles.ack} testID="processing-ack">
          ✓ Risposta acquisita
        </Text>
      ) : null}
      {state.answerState === 'too_late' ? (
        <Text style={styles.tooLate} testID="processing-too-late">
          Questa risposta è arrivata dopo la chiusura del contesto
        </Text>
      ) : null}
      {question && state.answerState !== 'acquired' && state.answerState !== 'too_late' ? (
        <>
          <Text style={styles.helper}>{helper}</Text>
          <Text style={styles.question}>{question.text}</Text>
          <View style={styles.options}>
            {question.options.map((option) => {
              const selected = state.selectedId === option.id;
              return (
                <Pressable
                  key={option.id}
                  accessibilityRole="button"
                  accessibilityLabel={option.label}
                  accessibilityState={{ disabled: busy, selected }}
                  disabled={busy}
                  onPress={() => {
                    dispatch({ type: 'SELECT', optionId: option.id });
                    mutation.mutate({
                      question_id: question.id,
                      answer_id: option.id,
                    });
                  }}
                  style={({ pressed }) => [
                    styles.pill,
                    selected && styles.pillSelected,
                    pressed && styles.pillPressed,
                    busy && !selected && styles.pillBusy,
                  ]}
                  testID={`processing-answer-${option.id}`}
                >
                  <Text
                    style={[
                      styles.pillText,
                      selected && styles.pillTextSelected,
                    ]}
                  >
                    {option.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Salta"
            accessibilityState={{ disabled: busy }}
            disabled={busy}
            onPress={() => {
              dispatch({ type: 'SKIP' });
              mutation.mutate({
                question_id: question.id,
                skipped: true,
              });
            }}
            style={({ pressed }) => [
              styles.skip,
              pressed && styles.skipPressed,
              busy && styles.skipDisabled,
            ]}
            testID="processing-skip"
          >
            <Text style={styles.skipText}>Salta</Text>
          </Pressable>
        </>
      ) : null}
      {countCopy ? <Text style={styles.count}>{countCopy}</Text> : null}
      {state.error ? <Text style={styles.error}>{state.error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    marginBottom: spacing.xl,
  },
  heading: {
    color: colors.textMuted,
    fontSize: typography.size.xs,
    fontWeight: typography.weight.semibold,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  helper: {
    marginTop: spacing.sm,
    color: colors.textMuted,
    fontSize: typography.size.xs,
    textAlign: 'center',
  },
  accepted: {
    marginTop: spacing.sm,
    color: colors.text,
    fontSize: typography.size.sm,
    fontWeight: typography.weight.medium,
    textAlign: 'center',
  },
  ack: {
    marginTop: spacing.sm,
    color: colors.accentPressed,
    fontSize: typography.size.sm,
    fontWeight: typography.weight.semibold,
    textAlign: 'center',
  },
  tooLate: {
    marginTop: spacing.sm,
    color: colors.textMuted,
    fontSize: typography.size.xs,
    textAlign: 'center',
  },
  question: {
    marginTop: spacing.sm,
    color: colors.text,
    fontSize: typography.size.lg,
    fontWeight: typography.weight.semibold,
    lineHeight: typography.size.lg * typography.lineHeight.relaxed,
    textAlign: 'center',
  },
  options: {
    marginTop: spacing.md,
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  pill: {
    minHeight: 40,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.full,
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: colors.border,
    justifyContent: 'center',
  },
  pillSelected: {
    backgroundColor: colors.accentSoft,
    borderColor: colors.accent,
  },
  pillPressed: {
    opacity: 0.85,
  },
  pillBusy: {
    opacity: 0.55,
  },
  pillText: {
    color: colors.text,
    fontSize: typography.size.sm,
    fontWeight: typography.weight.semibold,
  },
  pillTextSelected: {
    color: colors.accentPressed,
  },
  skip: {
    marginTop: spacing.md,
    minHeight: 36,
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
  },
  skipPressed: {
    opacity: 0.7,
  },
  skipDisabled: {
    opacity: 0.4,
  },
  skipText: {
    color: colors.textMuted,
    fontSize: typography.size.xs,
    fontWeight: typography.weight.medium,
  },
  count: {
    marginTop: spacing.sm,
    color: colors.textMuted,
    fontSize: typography.size.xs,
    textAlign: 'center',
  },
  error: {
    marginTop: spacing.sm,
    color: colors.danger,
    fontSize: typography.size.xs,
    textAlign: 'center',
  },
});
