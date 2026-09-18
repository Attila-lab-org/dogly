import React, { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Button, Card } from '../../components';
import { colors, spacing, typography } from '../../theme/tokens';
import { queryKeys } from '../../lib/queryClient';
import {
  PROCESSING_ACKS,
  processingQuestionKicker,
} from '../core/conversationCopy';
import {
  getProcessingContext,
  isProcessingCollecting,
  postProcessingContext,
  type ProcessingContextQuestion,
} from './api';
import type { BehaviorEventStatus } from '../../contracts/types';

export function ProcessingContextCard({
  eventId,
  dogId,
  userId,
  ownerDisplayName,
  enabled,
  finishing,
  analysisStatus,
}: {
  eventId: string;
  dogId: string;
  userId: string;
  ownerDisplayName?: string | null;
  enabled: boolean;
  finishing: boolean;
  analysisStatus?: BehaviorEventStatus | string | null;
}) {
  const [locked, setLocked] = useState<ProcessingContextQuestion | null>(null);
  const [ack, setAck] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const ackIndex = useRef(0);
  const ackTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (ackTimer.current) clearTimeout(ackTimer.current);
    },
    [],
  );

  const collecting =
    !finishing &&
    isProcessingCollecting(analysisStatus);

  const query = useQuery({
    queryKey: queryKeys.processingContext(userId, dogId, eventId),
    queryFn: () => getProcessingContext(eventId),
    enabled: enabled && collecting,
    staleTime: 4_000,
    refetchInterval: collecting ? 2_500 : false,
  });

  useEffect(() => {
    if (!locked && !ack && query.data?.question) {
      setLocked(query.data.question);
    }
  }, [ack, locked, query.data?.question]);

  const mutation = useMutation({
    mutationFn: (body: {
      question_id: string;
      answer_id?: string;
      skipped?: boolean;
    }) => postProcessingContext(eventId, body),
    onMutate: () => setError(null),
    onSuccess: (next) => {
      if (!next.accepting_answers || next.applied_to_interpretation === false) {
        setAck(null);
        setLocked(null);
        return;
      }
      const message = PROCESSING_ACKS[ackIndex.current % PROCESSING_ACKS.length];
      ackIndex.current += 1;
      setAck(message);
      if (ackTimer.current) clearTimeout(ackTimer.current);
      ackTimer.current = setTimeout(() => {
        setAck(null);
        setLocked(next.question ?? null);
      }, 560);
    },
    onError: () => {
      setError('Non sono riuscito a salvare la risposta. Riprova.');
    },
  });

  if (
    !collecting ||
    query.data?.accepting_answers === false ||
    (!locked && !ack)
  ) {
    return null;
  }

  const busy = mutation.isPending || Boolean(ack);
  const question = locked;

  return (
    <Card style={styles.card} testID="processing-context-card">
      <Text style={styles.kicker}>
        {processingQuestionKicker(ownerDisplayName)}
      </Text>
      {ack ? (
        <Text
          style={styles.ack}
          accessibilityLiveRegion="polite"
        >
          {ack}
        </Text>
      ) : question ? (
        <>
          <Text style={styles.question}>{question.text}</Text>
          <View style={styles.options}>
            {question.options.map((option) => (
              <Button
                key={option.id}
                title={option.label}
                variant="secondary"
                disabled={busy}
                onPress={() =>
                  mutation.mutate({
                    question_id: question.id,
                    answer_id: option.id,
                  })
                }
                style={styles.option}
                testID={`processing-answer-${option.id}`}
              />
            ))}
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Salta"
            accessibilityState={{ disabled: busy }}
            disabled={busy}
            onPress={() =>
              mutation.mutate({
                question_id: question.id,
                skipped: true,
              })
            }
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
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    marginBottom: spacing.lg,
  },
  kicker: {
    color: colors.accent,
    fontSize: typography.size.xs,
    fontWeight: typography.weight.bold,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  question: {
    marginTop: spacing.sm,
    color: colors.text,
    fontSize: typography.size.md,
    fontWeight: typography.weight.semibold,
    lineHeight: typography.size.md * typography.lineHeight.relaxed,
  },
  ack: {
    marginTop: spacing.md,
    color: colors.text,
    fontSize: typography.size.md,
    fontWeight: typography.weight.semibold,
    textAlign: 'center',
  },
  options: {
    marginTop: spacing.md,
    gap: spacing.sm,
  },
  option: {
    alignSelf: 'stretch',
  },
  skip: {
    alignSelf: 'center',
    marginTop: spacing.md,
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  skipPressed: {
    opacity: 0.7,
  },
  skipDisabled: {
    opacity: 0.45,
  },
  skipText: {
    color: colors.textSecondary,
    fontSize: typography.size.sm,
    fontWeight: typography.weight.semibold,
  },
  error: {
    marginTop: spacing.sm,
    color: colors.danger,
    fontSize: typography.size.xs,
  },
});
