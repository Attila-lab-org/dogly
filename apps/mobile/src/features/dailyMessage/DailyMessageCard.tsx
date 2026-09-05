import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Button, Card } from '../../components';
import { colors, radius, spacing, typography } from '../../theme/tokens';
import {
  SUGGESTION_LABELS,
  type DailyDogMessage,
  type DailyReaction,
  type SafeCareSuggestion,
} from './types';
import { shareTextCard } from '../photos/share';

const REACTIONS: Array<{
  id: Exclude<DailyReaction, null>;
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
}> = [
  { id: 'heart', icon: 'heart-outline', label: 'Cuore' },
  { id: 'paw', icon: 'paw-outline', label: 'Zampa' },
  { id: 'smile', icon: 'happy-outline', label: 'Sorriso' },
];

export function DailyMessageCard({
  message,
  onConfirm,
  onSaveDiary,
}: {
  message: DailyDogMessage;
  onConfirm?: () => void;
  onSaveDiary?: () => void;
}) {
  const [reaction, setReaction] = useState<DailyReaction>(null);
  const [showWhy, setShowWhy] = useState(false);
  const [feedback, setFeedback] = useState<'yes' | 'no' | 'unsure' | null>(
    null,
  );

  const disclaimer = message.disclaimer;

  return (
    <Card style={styles.card}>
      <Text style={styles.kicker}>Messaggio di {message.dogName}</Text>
      <Text style={styles.body}>{message.body}</Text>
      <Text style={styles.disclaimer}>{disclaimer}</Text>

      <View style={styles.reactionRow}>
        {REACTIONS.map((item) => {
          const active = reaction === item.id;
          return (
            <Pressable
              key={item.id}
              accessibilityRole="button"
              accessibilityLabel={`Reaction ${item.label}`}
              onPress={() => setReaction(active ? null : item.id)}
              style={[styles.reactionBtn, active && styles.reactionActive]}
            >
              <Ionicons
                name={item.icon}
                size={20}
                color={active ? colors.textOnPrimary : colors.accent}
              />
            </Pressable>
          );
        })}
      </View>

      <Pressable
        accessibilityRole="button"
        onPress={() => setShowWhy((v) => !v)}
        style={styles.whyToggle}
      >
        <Text style={styles.whyLabel}>
          {showWhy ? 'Nascondi perché' : 'Perché?'}
        </Text>
        <Ionicons
          name={showWhy ? 'chevron-up' : 'chevron-down'}
          size={16}
          color={colors.accent}
        />
      </Pressable>
      {showWhy ? (
        <View style={styles.evidenceBox}>
          {message.evidence.map((item) => (
            <Text key={item} style={styles.evidenceItem}>
              • {item}
            </Text>
          ))}
        </View>
      ) : null}

      <Text style={styles.feedbackPrompt}>Ti riconosci?</Text>
      <View style={styles.feedbackRow}>
        {(
          [
            ['yes', 'Sì'],
            ['no', 'No'],
            ['unsure', 'Non so'],
          ] as const
        ).map(([id, label]) => (
          <Pressable
            key={id}
            accessibilityRole="button"
            onPress={() => {
              setFeedback(id);
              if (id === 'yes') onConfirm?.();
            }}
            style={[
              styles.feedbackChip,
              feedback === id && styles.feedbackChipActive,
            ]}
          >
            <Text
              style={[
                styles.feedbackChipText,
                feedback === id && styles.feedbackChipTextActive,
              ]}
            >
              {label}
            </Text>
          </Pressable>
        ))}
      </View>

      <View style={styles.suggestions}>
        {message.suggestions.map((key: SafeCareSuggestion) => (
          <View key={key} style={styles.suggestionChip}>
            <Text style={styles.suggestionText}>{SUGGESTION_LABELS[key]}</Text>
          </View>
        ))}
      </View>

      <View style={styles.actions}>
        <Button
          title="Salva nel diario"
          variant="secondary"
          onPress={() => onSaveDiary?.()}
        />
        <Button
          title="Condividi"
          variant="primary"
          onPress={() =>
            shareTextCard({
              title: `Messaggio di ${message.dogName}`,
              message: `${message.body}\n\n(${disclaimer})`,
            })
          }
        />
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    marginBottom: spacing.lg,
    gap: spacing.sm,
  },
  kicker: {
    fontSize: typography.size.sm,
    fontWeight: typography.weight.semibold,
    color: colors.accent,
  },
  body: {
    fontSize: typography.size.lg,
    fontWeight: typography.weight.bold,
    color: colors.text,
    lineHeight: typography.size.lg * typography.lineHeight.normal,
  },
  disclaimer: {
    fontSize: typography.size.xs,
    color: colors.textMuted,
    lineHeight: typography.size.xs * typography.lineHeight.relaxed,
  },
  reactionRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  reactionBtn: {
    width: 44,
    height: 44,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
  },
  reactionActive: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  whyToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginTop: spacing.sm,
  },
  whyLabel: {
    color: colors.accent,
    fontWeight: typography.weight.semibold,
    fontSize: typography.size.sm,
  },
  evidenceBox: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.xs,
  },
  evidenceItem: {
    fontSize: typography.size.sm,
    color: colors.textSecondary,
  },
  feedbackPrompt: {
    marginTop: spacing.sm,
    fontSize: typography.size.sm,
    fontWeight: typography.weight.semibold,
    color: colors.text,
  },
  feedbackRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  feedbackChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.full,
    backgroundColor: colors.surfaceMuted,
    minHeight: 44,
    justifyContent: 'center',
  },
  feedbackChipActive: {
    backgroundColor: colors.primarySoft,
  },
  feedbackChipText: {
    color: colors.textSecondary,
    fontSize: typography.size.sm,
  },
  feedbackChipTextActive: {
    color: colors.primary,
    fontWeight: typography.weight.semibold,
  },
  suggestions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  suggestionChip: {
    backgroundColor: colors.accentSoft,
    borderRadius: radius.full,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  suggestionText: {
    color: colors.accentPressed,
    fontSize: typography.size.xs,
    fontWeight: typography.weight.medium,
  },
  actions: {
    gap: spacing.sm,
    marginTop: spacing.md,
  },
});
