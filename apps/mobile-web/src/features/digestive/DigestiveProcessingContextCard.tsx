import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Card } from '@/components';
import { colors, radius, spacing, typography } from '@/theme/tokens';
import type { DigestiveProcessingQuestion } from './processingContext';

export function DigestiveProcessingContextCard({
  question,
  pending,
  error,
  onAnswer,
  onSkip,
}: {
  question: DigestiveProcessingQuestion;
  pending: boolean;
  error: boolean;
  onAnswer: (value: boolean) => void;
  onSkip: () => void;
}) {
  return (
    <Card style={styles.card}>
      <Text style={styles.eyebrow}>Intanto, una cosa può aiutarmi</Text>
      <Text style={styles.question}>{question.text}</Text>
      <View style={styles.answers}>
        {[
          { label: 'Sì', value: true },
          { label: 'No', value: false },
        ].map((answer) => (
          <Pressable
            key={answer.label}
            accessibilityRole="button"
            accessibilityLabel={answer.label}
            disabled={pending}
            onPress={() => onAnswer(answer.value)}
            style={({ pressed }) => [
              styles.answer,
              pressed && styles.answerPressed,
            ]}
          >
            <Text style={styles.answerText}>{answer.label}</Text>
          </Pressable>
        ))}
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Salta questa domanda"
        disabled={pending}
        onPress={onSkip}
        style={styles.skip}
      >
        <Text style={styles.skipText}>Salta</Text>
      </Pressable>
      {error ? (
        <Text style={styles.error}>
          Non sono riuscito a salvare la risposta. Puoi riprovare o saltare.
        </Text>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    width: '100%',
    maxWidth: 360,
    marginTop: spacing.lg,
  },
  eyebrow: {
    color: colors.teal,
    fontSize: typography.size.xs,
    fontWeight: typography.weight.bold,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  question: {
    marginTop: spacing.sm,
    color: colors.text,
    fontSize: typography.size.md,
    fontWeight: typography.weight.semibold,
    lineHeight: typography.size.md * typography.lineHeight.normal,
  },
  answers: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.lg,
  },
  answer: {
    flex: 1,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.teal,
    borderRadius: radius.full,
  },
  answerPressed: {
    backgroundColor: colors.tealSoft,
  },
  answerText: {
    color: colors.teal,
    fontSize: typography.size.sm,
    fontWeight: typography.weight.bold,
  },
  skip: {
    minHeight: 40,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.xs,
  },
  skipText: {
    color: colors.textSecondary,
    fontSize: typography.size.sm,
  },
  error: {
    color: colors.danger,
    fontSize: typography.size.xs,
    lineHeight: typography.size.xs * typography.lineHeight.relaxed,
  },
});
