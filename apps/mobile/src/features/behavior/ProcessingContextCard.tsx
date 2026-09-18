import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useMutation, useQuery } from '@tanstack/react-query';
import { colors, radius, spacing, typography } from '../../theme/tokens';
import { queryKeys } from '../../lib/queryClient';
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
  const [locked, setLocked] = useState<ProcessingContextQuestion | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const collecting = !finishing && isProcessingCollecting(analysisStatus);

  const query = useQuery({
    queryKey: queryKeys.processingContext(userId, dogId, eventId),
    queryFn: () => getProcessingContext(eventId),
    enabled: enabled && collecting,
    staleTime: 4_000,
    refetchInterval: collecting ? 2_500 : false,
  });

  useEffect(() => {
    if (!locked && query.data?.question) {
      setLocked(query.data.question);
    }
  }, [locked, query.data?.question]);

  const mutation = useMutation({
    mutationFn: (body: {
      question_id: string;
      answer_id?: string;
      skipped?: boolean;
    }) => postProcessingContext(eventId, body),
    onMutate: () => setError(null),
    onSuccess: (next) => {
      setSelectedId(null);
      if (!next.accepting_answers || next.applied_to_interpretation === false) {
        setLocked(null);
        return;
      }
      setLocked(next.question ?? null);
    },
    onError: () => {
      setSelectedId(null);
      setError('Non sono riuscito a salvare la risposta. Riprova.');
    },
  });

  if (
    !collecting ||
    query.data?.accepting_answers === false ||
    !locked
  ) {
    return null;
  }

  const busy = mutation.isPending;
  const question = locked;

  return (
    <View style={styles.wrap} testID="processing-context-card">
      <Text style={styles.heading}>Intanto, alcune domande</Text>
      <Text style={styles.question}>{question.text}</Text>
      <View style={styles.options}>
        {question.options.map((option) => {
          const selected = selectedId === option.id;
          return (
            <Pressable
              key={option.id}
              accessibilityRole="button"
              accessibilityLabel={option.label}
              accessibilityState={{ disabled: busy, selected }}
              disabled={busy}
              onPress={() => {
                setSelectedId(option.id);
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
      {error ? <Text style={styles.error}>{error}</Text> : null}
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
  error: {
    marginTop: spacing.sm,
    color: colors.danger,
    fontSize: typography.size.xs,
    textAlign: 'center',
  },
});
