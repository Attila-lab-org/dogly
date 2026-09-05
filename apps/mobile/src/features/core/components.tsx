/**
 * Componenti condivisi dei domini core (F1): header di sezione, avatar cane,
 * Knowledge Score, pill di confidenza, righe evidence, vista risultato
 * comportamentale (riusata da /behavior/result e /diary/event) e feedback
 * a tre vie. Stile vincolante: docs/ux/UX_REFERENCE.md + mockup ufficiali.
 */
import React from 'react';
import { Image, Pressable, StyleSheet, Text, View, ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Card, Chip, ProgressBar, SectionHeader } from '../../components';
import { colors, radius, spacing, typography } from '../../theme/tokens';
import type {
  BehaviorEventResult,
  BehaviorIntent,
  ConfidenceBand,
  EvidenceItem,
  FeedbackValue,
} from '../../contracts/types';
import { BEHAVIOR_INTENT_LABELS } from '../../contracts/types';
import { CuteIcon, type CuteIconName } from '../../components/CuteIcon';
import { CONFIDENCE_BAND_LABELS, intentHeadline } from './copy';
import type { KnowledgeScore } from './types';

export { SectionHeader };

/* ------------------------------------------------------------------ */
/* DogAvatar — foto circolare o placeholder zampa (foto opzionale, 7.1) */
/* ------------------------------------------------------------------ */

export function DogAvatar({
  size = 96,
  photoUri,
  dogName = 'il cane',
}: {
  size?: number;
  photoUri?: string | null;
  dogName?: string;
}) {
  const hasPhoto = Boolean(photoUri);
  return (
    <View
      accessibilityRole="image"
      accessibilityLabel={
        hasPhoto ? `Foto di ${dogName}` : `Nessuna foto di ${dogName}, placeholder zampa`
      }
      style={[
        styles.avatar,
        { width: size, height: size, borderRadius: size / 2 },
      ]}
    >
      {hasPhoto ? (
        <Image
          source={{ uri: photoUri as string }}
          style={{ width: size, height: size, borderRadius: size / 2 }}
          accessibilityIgnoresInvertColors
        />
      ) : (
        <Ionicons name="paw" size={size * 0.45} color={colors.textMuted} />
      )}
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* KnowledgeScoreBlock — "Quanto conosco {nome}" nel profilo cane. */
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
/* EvidenceRow — icona carina semantica + testo in card grigio-chiaro  */
/* ------------------------------------------------------------------ */

/**
 * Icona semantica dedotta dal contenuto della label (mockup: ogni evidence
 * ha la sua icona — coda, orecchie, voce…). Fallback sulle icone per fonte.
 * Display-only: nessun cambio di contratto; quando il backend emetterà un
 * campo `kind` (sez. 16.3) basterà sostituire questa inferenza.
 */
const EVIDENCE_ICON_KEYWORDS: Array<[RegExp, CuteIconName]> = [
  [/coda|scodinzol/i, 'tail'],
  [/orecch/i, 'ear'],
  [/vocal|abbaia|guait|ulula|audio|suono/i, 'voice'],
  [/postura|corpo|distes|gioco/i, 'paw'],
  [/movimento|verso|salta|zampa|avvicina|insegu/i, 'movement'],
  [/sguardo|occhi|fissa|visibile|guarda/i, 'gaze'],
  [/respiro|ansim/i, 'breath'],
  [/casa|ambiente|stanza|divano|giardino/i, 'home'],
  [/orario|sera|mattina|giorno|clip|breve|notte/i, 'clock'],
  [/pattern|abitudin/i, 'pattern'],
];

function evidenceIconName(item: EvidenceItem): CuteIconName {
  for (const [pattern, name] of EVIDENCE_ICON_KEYWORDS) {
    if (pattern.test(item.label)) return name;
  }
  if (item.source === 'PERSONAL_PATTERN') return 'pattern';
  if (item.source === 'CONTEXT') return 'home';
  return 'gaze';
}

export function EvidenceRow({ item }: { item: EvidenceItem }) {
  return (
    <View style={styles.evidenceRow}>
      <View style={styles.evidenceIconWrap}>
        <CuteIcon name={evidenceIconName(item)} size={18} />
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
  error,
}: {
  value: FeedbackValue | null;
  onFeedback: (value: FeedbackValue) => void;
  /** Messaggio onesto quando il salvataggio è fallito: il badge "Salvato" resta spento. */
  error?: string | null;
}) {
  const options: Array<{
    value: FeedbackValue;
    label: string;
    icon: keyof typeof Ionicons.glyphMap;
  }> = [
    { value: 'YES', label: 'Sì, è così', icon: 'checkmark' },
    { value: 'NO', label: 'Non credo', icon: 'close' },
    { value: 'UNKNOWN', label: 'Non lo so', icon: 'help' },
  ];

  return (
    <View style={styles.feedbackCard}>
      <View style={styles.feedbackHeading}>
        <Text style={styles.feedbackTitle}>Ti torna?</Text>
        {error ? (
          <View style={styles.savedBadge}>
            <Ionicons name="alert-circle" size={13} color={colors.danger} />
            <Text style={styles.errorLabel}>{error}</Text>
          </View>
        ) : value ? (
          <View style={styles.savedBadge}>
            <Ionicons name="checkmark" size={13} color={colors.accent} />
            <Text style={styles.savedLabel}>Salvato</Text>
          </View>
        ) : null}
      </View>
      <View style={styles.feedbackOptions}>
        {options.map((option) => {
          const selected = value === option.value;
          return (
            <Pressable
              key={option.value}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              onPress={() => onFeedback(option.value)}
              style={({ pressed }) => [
                styles.feedbackOption,
                selected && styles.feedbackOptionSelected,
                pressed && styles.feedbackOptionPressed,
              ]}
              testID={`feedback-${option.value.toLowerCase()}`}
            >
              <View
                style={[
                  styles.feedbackIcon,
                  selected && styles.feedbackIconSelected,
                ]}
              >
                <Ionicons
                  name={option.icon}
                  size={16}
                  color={selected ? colors.textOnPrimary : colors.textSecondary}
                />
              </View>
              <Text
                style={[
                  styles.feedbackOptionLabel,
                  selected && styles.feedbackOptionLabelSelected,
                ]}
              >
                {option.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* BehaviorResultView — contratto UX_REFERENCE (risultato per il cliente) */
/* ------------------------------------------------------------------ */

/** Disegno carino dell'hero per ogni intent della tassonomia (sez. 16.2). */
const INTENT_HERO_ICONS: Record<BehaviorIntent, CuteIconName> = {
  PLAY_INTERACTION: 'play',
  ATTENTION_REQUEST: 'attention',
  OUTSIDE_REQUEST: 'door',
  ALERT_VIGILANCE: 'alert',
  DISCOMFORT_AVOIDANCE: 'cloud',
  FEAR_INSECURITY: 'cloud',
  HIGH_AROUSAL: 'bolt',
  FRUSTRATION: 'frustration',
  RELAX_REST: 'moon',
  RESOURCE_TENSION: 'bowl',
  AMBIGUOUS: 'question',
  INSUFFICIENT: 'search',
};

export function BehaviorResultView({
  result,
  dogName,
  feedback,
  onFeedback,
  careNote,
  feedbackError,
}: {
  result: BehaviorEventResult;
  dogName: string;
  feedback: FeedbackValue | null;
  onFeedback: (value: FeedbackValue) => void;
  careNote?: string | null;
  /** Stato errore del salvataggio feedback (mai finto "Salvato"). */
  feedbackError?: string | null;
}) {
  const isInsufficient =
    result.primary_intent === null || result.primary_intent === 'INSUFFICIENT';
  const isAmbiguous = result.primary_intent === 'AMBIGUOUS';

  return (
    <View>
      <View
        style={[
          styles.resultHero,
          (isInsufficient || isAmbiguous) && styles.resultHeroUncertain,
        ]}
      >
        <View style={styles.resultIcon}>
          <CuteIcon
            name={
              isInsufficient || !result.primary_intent
                ? 'search'
                : INTENT_HERO_ICONS[result.primary_intent]
            }
            size={32}
            color={
              isInsufficient || isAmbiguous ? colors.warning : colors.accent
            }
          />
        </View>
        <Text style={styles.headline}>
          {intentHeadline(dogName, result.primary_intent)}
        </Text>
        <View style={styles.pillWrap}>
          <ConfidencePill band={result.confidence_band} />
        </View>
        <Text style={styles.summary}>
          {personalizeCopy(result.consumer_summary, dogName)}
        </Text>
      </View>

      {careNote ? (
        <View style={styles.careCard}>
          <Ionicons name="heart-outline" size={18} color={colors.accent} />
          <Text style={styles.careNote}>{careNote}</Text>
        </View>
      ) : null}

      {result.evidence.length > 0 && (
        <View style={styles.evidenceSection}>
          <Text style={styles.evidenceTitle}>Segnali osservati</Text>
          {result.evidence.map((item, index) => (
            <EvidenceRow
              key={`${item.label}-${index}`}
              item={{
                ...item,
                label: personalizeCopy(item.label, dogName),
              }}
            />
          ))}
        </View>
      )}

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
              <Text style={styles.alternativeRationale}>
                {personalizeCopy(alt.rationale, dogName)}
              </Text>
            </View>
          ))}
        </Card>
      )}

      <FeedbackButtons
        value={feedback}
        onFeedback={onFeedback}
        error={feedbackError}
      />
    </View>
  );
}

/* ------------------------------------------------------------------ */

function personalizeCopy(copy: string, dogName: string): string {
  return copy.replace(/Rocky/g, dogName);
}

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
  feedbackCard: {
    marginTop: spacing.lg,
    padding: spacing.lg,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
  },
  feedbackHeading: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  feedbackTitle: {
    color: colors.text,
    fontSize: typography.size.md,
    fontWeight: typography.weight.bold,
  },
  savedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  savedLabel: {
    color: colors.accent,
    fontSize: typography.size.xs,
    fontWeight: typography.weight.semibold,
  },
  errorLabel: {
    color: colors.danger,
    fontSize: typography.size.xs,
    fontWeight: typography.weight.semibold,
  },
  feedbackOptions: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  feedbackOption: {
    flex: 1,
    minHeight: 70,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceMuted,
  },
  feedbackOptionSelected: {
    borderColor: colors.primary,
    backgroundColor: colors.primarySoft,
  },
  feedbackOptionPressed: {
    backgroundColor: colors.border,
  },
  feedbackIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
  },
  feedbackIconSelected: {
    backgroundColor: colors.primary,
  },
  feedbackOptionLabel: {
    color: colors.textSecondary,
    fontSize: typography.size.xs,
    fontWeight: typography.weight.semibold,
    textAlign: 'center',
  },
  feedbackOptionLabelSelected: {
    color: colors.primary,
  },
  resultHero: {
    alignItems: 'center',
    padding: spacing.xl,
    borderRadius: radius.lg,
    backgroundColor: colors.accentSoft,
  },
  resultHeroUncertain: {
    backgroundColor: colors.warningSoft,
  },
  resultIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
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
    fontSize: typography.size.sm,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: typography.size.sm * typography.lineHeight.relaxed,
  },
  careCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    marginTop: spacing.md,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
  },
  careNote: {
    flex: 1,
    fontSize: typography.size.sm,
    color: colors.text,
    lineHeight: typography.size.sm * typography.lineHeight.relaxed,
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
