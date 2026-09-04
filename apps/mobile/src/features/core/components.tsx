/**
 * Componenti condivisi dei domini core (F1): header di sezione, avatar cane,
 * Knowledge Score, pill di confidenza, righe evidence, vista risultato
 * comportamentale (riusata da /behavior/result e /diary/event) e feedback
 * a tre vie. Stile vincolante: docs/ux/UX_REFERENCE.md + mockup ufficiali.
 */
import React from 'react';
import { Pressable, StyleSheet, Text, View, ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Button, Card, Chip, ProgressBar } from '../../components';
import { colors, radius, spacing, typography } from '../../theme/tokens';
import type {
  BehaviorEventResult,
  ConfidenceBand,
  EvidenceItem,
  FeedbackValue,
} from '../../contracts/types';
import { BEHAVIOR_INTENT_LABELS } from '../../contracts/types';
import { CONFIDENCE_BAND_LABELS, intentHeadline } from './copy';
import type { KnowledgeScore } from './types';

/* ------------------------------------------------------------------ */
/* SectionHeader                                                       */
/* ------------------------------------------------------------------ */

export function SectionHeader({
  title,
  icon,
  style,
}: {
  title: string;
  icon?: React.ReactNode;
  style?: ViewStyle;
}) {
  return (
    <View style={[styles.sectionHeader, style]}>
      {icon}
      <Text style={styles.sectionTitle}>{title}</Text>
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* DogAvatar — foto circolare o placeholder zampa (foto opzionale, 7.1) */
/* ------------------------------------------------------------------ */

export function DogAvatar({
  size = 96,
  photoUri,
}: {
  size?: number;
  photoUri?: string | null;
}) {
  // V1 mock: nessuna foto salvata → placeholder zampa (sez. 6 "no photo")
  void photoUri;
  return (
    <View
      style={[
        styles.avatar,
        { width: size, height: size, borderRadius: size / 2 },
      ]}
    >
      <Ionicons name="paw" size={size * 0.45} color={colors.textMuted} />
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* KnowledgeScoreBlock — "Quanto conosco Rocky" (sez. 18, numero ammesso) */
/* ------------------------------------------------------------------ */

export function KnowledgeScoreBlock({
  knowledgeScore,
  dogName,
  tone = 'accent',
  style,
}: {
  knowledgeScore: KnowledgeScore;
  dogName: string;
  tone?: 'accent' | 'primary';
  style?: ViewStyle;
}) {
  return (
    <View style={style}>
      <View style={styles.scoreRow}>
        <Text style={styles.scoreTitle}>Quanto conosco {dogName}</Text>
        <Text
          style={[
            styles.scoreValue,
            { color: tone === 'accent' ? colors.accent : colors.primary },
          ]}
        >
          {knowledgeScore.score}%
        </Text>
      </View>
      <ProgressBar progress={knowledgeScore.score / 100} tone={tone} />
      <Text style={styles.scoreCaption}>{knowledgeScore.caption}</Text>
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* ConfidencePill — band LOW/MEDIUM/HIGH, MAI percentuali (O-07)        */
/* ------------------------------------------------------------------ */

const BAND_TONE: Record<ConfidenceBand, 'primary' | 'warning' | 'neutral'> = {
  HIGH: 'primary',
  MEDIUM: 'primary',
  LOW: 'neutral',
};

export function ConfidencePill({ band }: { band: ConfidenceBand }) {
  return (
    <Chip
      label={CONFIDENCE_BAND_LABELS[band]}
      tone={BAND_TONE[band]}
      icon={
        <Ionicons
          name="sparkles"
          size={14}
          color={band === 'LOW' ? colors.textSecondary : colors.primary}
        />
      }
    />
  );
}

/* ------------------------------------------------------------------ */
/* EvidenceRow — icona teal + testo in card grigio-chiarissimo (mockup) */
/* ------------------------------------------------------------------ */

const EVIDENCE_ICONS: Record<EvidenceItem['source'], keyof typeof Ionicons.glyphMap> = {
  OBSERVATION: 'eye-outline',
  CONTEXT: 'location-outline',
  PERSONAL_PATTERN: 'bulb-outline',
};

export function EvidenceRow({ item }: { item: EvidenceItem }) {
  return (
    <View style={styles.evidenceRow}>
      <View style={styles.evidenceIconWrap}>
        <Ionicons
          name={EVIDENCE_ICONS[item.source]}
          size={18}
          color={colors.accent}
        />
      </View>
      <Text style={styles.evidenceText}>{item.label}</Text>
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* FeedbackButtons — "Sì, è così / Non credo / Non lo so" one-tap (6.1) */
/* ------------------------------------------------------------------ */

export function FeedbackButtons({
  value,
  onFeedback,
}: {
  value: FeedbackValue | null;
  onFeedback: (value: FeedbackValue) => void;
}) {
  return (
    <View style={styles.feedbackGroup}>
      <Button
        title="Sì, è così"
        variant={value === 'YES' || value === null ? 'primary' : 'outline'}
        onPress={() => onFeedback('YES')}
        icon={
          <Ionicons
            name="thumbs-up-outline"
            size={18}
            color={value === 'NO' || value === 'UNKNOWN' ? colors.accent : colors.textOnPrimary}
          />
        }
        testID="feedback-yes"
      />
      <Button
        title="Non credo"
        variant={value === 'NO' || value === null ? 'danger' : 'outline'}
        onPress={() => onFeedback('NO')}
        icon={
          <Ionicons
            name="thumbs-down-outline"
            size={18}
            color={value === 'NO' || value === null ? colors.textOnPrimary : colors.accent}
          />
        }
        testID="feedback-no"
      />
      <Pressable
        accessibilityRole="button"
        onPress={() => onFeedback('UNKNOWN')}
        style={({ pressed }) => [
          styles.feedbackUnknown,
          value === 'UNKNOWN' && styles.feedbackUnknownSelected,
          pressed && styles.feedbackUnknownPressed,
        ]}
        testID="feedback-unknown"
      >
        <Ionicons name="help-circle-outline" size={18} color={colors.textSecondary} />
        <Text style={styles.feedbackUnknownLabel}>Non lo so</Text>
      </Pressable>
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* BehaviorResultView — contratto 6.1 completo (result + dettaglio diario) */
/* ------------------------------------------------------------------ */

export function BehaviorResultView({
  result,
  dogName,
  feedback,
  onFeedback,
}: {
  result: BehaviorEventResult;
  dogName: string;
  feedback: FeedbackValue | null;
  onFeedback: (value: FeedbackValue) => void;
}) {
  const isInsufficient =
    result.primary_intent === null || result.primary_intent === 'INSUFFICIENT';
  const isAmbiguous = result.primary_intent === 'AMBIGUOUS';

  return (
    <View>
      {/* Illustrazione amichevole (mockup-result: cerchio azzurro chiaro) */}
      <View style={styles.illustrationWrap}>
        <View style={styles.illustrationCircle}>
          <Ionicons
            name={isInsufficient ? 'search' : 'tennisball-outline'}
            size={64}
            color={colors.primary}
          />
        </View>
      </View>

      {/* Headline probabilistica + pill band (mai %) */}
      <Text style={styles.headline}>
        {intentHeadline(dogName, result.primary_intent)}
      </Text>
      <View style={styles.pillWrap}>
        <ConfidencePill band={result.confidence_band} />
      </View>

      {/* Summary prudente (sez. 6.1: "sembra / probabilmente / possibile") */}
      <Text style={styles.summary}>{result.consumer_summary}</Text>

      {/* Perché? 3–5 evidence con fonte tipizzata (sez. 6.1) */}
      {result.evidence.length > 0 && (
        <View style={styles.evidenceSection}>
          <Text style={styles.evidenceTitle}>Perché?</Text>
          {result.evidence.map((item, index) => (
            <EvidenceRow key={`${item.label}-${index}`} item={item} />
          ))}
        </View>
      )}

      {/* Ipotesi alternativa quando incerto (sez. 6.1: 0–2 alternative) */}
      {result.alternatives.length > 0 && (
        <Card style={styles.alternativeCard}>
          <SectionHeader
            title={isAmbiguous ? 'Ipotesi possibili' : 'In alternativa'}
            icon={
              <Ionicons name="git-branch-outline" size={16} color={colors.accent} />
            }
          />
          {result.alternatives.map((alt) => (
            <View key={alt.intent} style={styles.alternativeRow}>
              <Text style={styles.alternativeLabel}>
                {BEHAVIOR_INTENT_LABELS[alt.intent]}
              </Text>
              <Text style={styles.alternativeRationale}>{alt.rationale}</Text>
            </View>
          ))}
        </Card>
      )}

      {/* Feedback a tre vie one-tap: nessuna penalità per "Non lo so" */}
      <FeedbackButtons value={feedback} onFeedback={onFeedback} />
    </View>
  );
}

/* ------------------------------------------------------------------ */

const styles = StyleSheet.create({
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  sectionTitle: {
    fontSize: typography.size.md,
    fontWeight: typography.weight.bold,
    color: colors.text,
  },
  avatar: {
    backgroundColor: colors.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scoreRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
  },
  scoreTitle: {
    fontSize: typography.size.md,
    fontWeight: typography.weight.bold,
    color: colors.text,
  },
  scoreValue: {
    fontSize: typography.size.lg,
    fontWeight: typography.weight.bold,
  },
  scoreCaption: {
    marginTop: spacing.xs,
    fontSize: typography.size.xs,
    color: colors.textSecondary,
  },
  evidenceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  evidenceIconWrap: {
    width: 32,
    height: 32,
    borderRadius: radius.full,
    backgroundColor: colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  evidenceText: {
    flex: 1,
    fontSize: typography.size.sm,
    color: colors.text,
  },
  feedbackGroup: {
    gap: spacing.md,
    marginTop: spacing.lg,
  },
  feedbackUnknown: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.md,
    paddingVertical: spacing.lg,
  },
  feedbackUnknownSelected: {
    borderWidth: 1.5,
    borderColor: colors.accent,
  },
  feedbackUnknownPressed: {
    backgroundColor: colors.border,
  },
  feedbackUnknownLabel: {
    fontSize: typography.size.md,
    fontWeight: typography.weight.semibold,
    color: colors.textSecondary,
  },
  illustrationWrap: {
    alignItems: 'center',
    marginTop: spacing.md,
    marginBottom: spacing.lg,
  },
  illustrationCircle: {
    width: 160,
    height: 160,
    borderRadius: 80,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headline: {
    fontSize: typography.size.xxl,
    fontWeight: typography.weight.bold,
    color: colors.text,
    textAlign: 'center',
    lineHeight: typography.size.xxl * typography.lineHeight.tight,
  },
  pillWrap: {
    alignItems: 'center',
    marginTop: spacing.md,
  },
  summary: {
    marginTop: spacing.md,
    fontSize: typography.size.md,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: typography.size.md * typography.lineHeight.normal,
  },
  evidenceSection: {
    marginTop: spacing.xl,
  },
  evidenceTitle: {
    fontSize: typography.size.md,
    fontWeight: typography.weight.semibold,
    color: colors.textSecondary,
    marginBottom: spacing.md,
  },
  alternativeCard: {
    marginTop: spacing.lg,
    backgroundColor: colors.accentSoft,
  },
  alternativeRow: {
    marginBottom: spacing.sm,
  },
  alternativeLabel: {
    fontSize: typography.size.sm,
    fontWeight: typography.weight.semibold,
    color: colors.text,
  },
  alternativeRationale: {
    fontSize: typography.size.sm,
    color: colors.textSecondary,
    lineHeight: typography.size.sm * typography.lineHeight.normal,
  },
});
