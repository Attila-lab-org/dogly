/**
 * Componenti condivisi dei domini core (F1): header di sezione, avatar cane,
 * Knowledge Score, pill di confidenza, righe evidence, vista risultato
 * comportamentale (riusata da /behavior/result e /diary/event) e feedback
 * con 👍/👎. Stile vincolante: docs/ux/UX_REFERENCE.md + mockup ufficiali.
 */
import React from 'react';
import { Image, Pressable, StyleSheet, Text, View, ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Card, ProgressBar, SectionHeader } from '../../components';
import { colors, radius, spacing, typography } from '../../theme/tokens';
import type {
  BehaviorEventResult,
  BehaviorIntent,
  ConfidenceBand,
  EvidenceItem,
  FeedbackValue,
} from '../../contracts/types';
import { CuteIcon, type CuteIconName } from '../../components/CuteIcon';
import {
  CONFIDENCE_BAND_LABELS,
  sanitizeOwnerCopy,
} from './copy';
import { isPersonalBaselineNote } from './conversationCopy';
import { knowledgeLevelLabel, type KnowledgeScore } from './types';
import {
  behaviorPrudenceCopy,
  consumerEvidenceSections,
  showPrimaryAdvice,
} from '../behavior/consumerPresentation';

const puppyPlaySource = require('../../../assets/images/puppy-play.png');
const NAVY = '#1A2B48';
const SUMMARY_MUTED = '#5A7184';

export { SectionHeader };

/* ------------------------------------------------------------------ */
/* DogAvatar — foto circolare o placeholder zampa (foto opzionale, 7.1) */
/* ------------------------------------------------------------------ */

export function DogAvatar({
  size = 96,
  photoUri,
  dogName = 'il cane',
  source,
}: {
  size?: number;
  photoUri?: string | null;
  dogName?: string;
  source?: any;
}) {
  const resolvedSource = photoUri
    ? { uri: photoUri as string }
    : source || null;
  const hasPhoto = Boolean(resolvedSource);
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
          source={resolvedSource}
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
          {knowledgeLevelLabel(knowledgeScore.score)}
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

export function ConfidencePill({ band }: { band?: ConfidenceBand | null }) {
  if (band !== 'LOW') return null;
  return (
    <View style={styles.confidencePill}>
      <Text style={styles.confidencePillText}>
        {CONFIDENCE_BAND_LABELS[band]}
      </Text>
    </View>
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
        <CuteIcon name={evidenceIconName(item)} size={18} color="#2DAAAB" />
      </View>
      <Text style={styles.evidenceText}>{item.label}</Text>
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* FeedbackButtons — "Ti è stata utile?" 👍 / 👎 one-tap */
/* ------------------------------------------------------------------ */

export function FeedbackButtons({
  value,
  onFeedback,
  error,
}: {
  value: FeedbackValue | null;
  onFeedback: (
    value: FeedbackValue,
    extras?: { correction_label?: BehaviorIntent | null },
  ) => void;
  error?: string | null;
  dogName?: string;
  primaryIntent?: BehaviorIntent | null;
  alternatives?: Array<{ intent: BehaviorIntent }>;
}) {
  const options: Array<{
    value: Extract<FeedbackValue, 'YES' | 'NO'>;
    label: string;
    icon: keyof typeof Ionicons.glyphMap;
    selectedBg: string;
    selectedBorder: string;
  }> = [
    {
      value: 'YES',
      label: 'Utile',
      icon: 'thumbs-up',
      selectedBg: colors.successSoft,
      selectedBorder: colors.success,
    },
    {
      value: 'NO',
      label: 'Non utile',
      icon: 'thumbs-down',
      selectedBg: colors.dangerSoft,
      selectedBorder: colors.danger,
    },
  ];

  return (
    <View style={styles.feedbackCard}>
      <Text style={styles.feedbackTitle}>Ti è stata utile questa lettura?</Text>
      {error ? <Text style={styles.errorLabel}>{error}</Text> : null}
      <View style={styles.feedbackOptions}>
        {options.map((option) => {
          const selected = value === option.value;
          return (
            <Pressable
              key={option.value}
              accessibilityRole="button"
              accessibilityLabel={option.label}
              accessibilityState={{ selected }}
              onPress={() => {
                if (value === option.value) return;
                onFeedback(option.value);
              }}
              style={({ pressed }) => [
                styles.feedbackOption,
                selected && {
                  backgroundColor: option.selectedBg,
                  borderColor: option.selectedBorder,
                },
                pressed && styles.feedbackOptionPressed,
              ]}
              testID={`feedback-${option.value.toLowerCase()}`}
            >
              <Ionicons
                name={option.icon}
                size={22}
                color={
                  selected
                    ? option.selectedBorder
                    : colors.textSecondary
                }
              />
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

export function BehaviorResultView({
  result,
  dogName,
  feedback,
  onFeedback,
  careNote,
  feedbackError,
  photoUri,
  contextPrompt,
  primaryAdvice,
}: {
  result: BehaviorEventResult;
  dogName: string;
  feedback: FeedbackValue | null;
  onFeedback: (
    value: FeedbackValue,
    extras?: { correction_label?: BehaviorIntent | null },
  ) => void;
  careNote?: string | null;
  /** Stato errore del salvataggio feedback: non mostrare un successo finto. */
  feedbackError?: string | null;
  photoUri?: string | null;
  contextPrompt?: React.ReactNode;
  primaryAdvice?: React.ReactNode;
}) {
  const [detailsOpen, setDetailsOpen] = React.useState(false);
  const isInsufficient =
    result.primary_intent === null || result.primary_intent === 'INSUFFICIENT';
  const isAmbiguous = result.primary_intent === 'AMBIGUOUS';
  const ownerCopy = (value: string) =>
    sanitizeOwnerCopy(personalizeCopy(value, dogName))
      .replace(/\bdel (?:tuo )?cane\b/gi, `di ${dogName}`)
      .replace(/\bal (?:tuo )?cane\b/gi, `a ${dogName}`)
      .replace(/\b(?:il|un) (?:tuo )?cane\b/gi, dogName);
  const headline = ownerCopy(
    result.consumer_headline ||
      result.consumer_summary ||
      `Ecco cosa emerge dal video di ${dogName}`,
  );
  const safety = result.safety;
  const evidenceSections = consumerEvidenceSections(result.evidence);
  const hasPrimaryAdvice = Boolean(primaryAdvice);
  const celebrate = !safety && !isInsufficient && !isAmbiguous;

  return (
    <View>
      {safety ? (
        <View style={styles.safetyCard} testID="behavior-safety">
          <View style={styles.safetyHeading}>
            <Ionicons name="alert-circle" size={20} color={colors.danger} />
            <Text style={styles.safetyTitle}>{ownerCopy(safety.title)}</Text>
          </View>
          <Text style={styles.safetyMessage}>{ownerCopy(safety.message)}</Text>
          <Text style={styles.safetyAction}>{ownerCopy(safety.action)}</Text>
        </View>
      ) : null}

      <View
        style={[
          styles.resultHero,
          (isInsufficient || isAmbiguous) && styles.resultHeroUncertain,
          safety ? styles.resultHeroSafety : null,
        ]}
      >
        <View style={styles.resultHeroGraphicWrap}>
          <View style={styles.resultPuppyCircle}>
            {photoUri ? (
              <Image
                source={{ uri: photoUri }}
                style={styles.resultPuppyImage}
                resizeMode="cover"
                accessibilityLabel={`Foto di ${dogName}`}
              />
            ) : (
              <Image
                source={puppyPlaySource}
                style={styles.resultPuppyImage}
                resizeMode="contain"
                accessibilityLabel="Illustrazione cucciolo"
              />
            )}
          </View>
          {celebrate ? (
            <>
          <View
            style={[
              styles.confettiDot,
              { top: 10, left: 22, backgroundColor: '#FED7AA', width: 7, height: 7, borderRadius: 3.5 },
            ]}
          />
          <View
            style={[
              styles.confettiDot,
              { top: 18, right: 26, backgroundColor: '#BAE6FD', width: 8, height: 8, borderRadius: 4 },
            ]}
          />
          <View
            style={[
              styles.confettiDot,
              { bottom: 16, left: 32, backgroundColor: '#FBCFE8', width: 6, height: 6, borderRadius: 3 },
            ]}
          />
          <View
            style={[
              styles.confettiDot,
              { bottom: 22, right: 24, backgroundColor: '#BBF7D0', width: 7, height: 7, borderRadius: 3.5 },
            ]}
          />
            </>
          ) : null}
        </View>
        <Text style={styles.thoughtKicker}>Cosa può significare</Text>
        <View style={styles.headlineRow}>
          <Text style={styles.headline}>{headline}</Text>
          {celebrate ? <Text style={styles.headlineSparkle}> ✨</Text> : null}
        </View>
        {result.dog_voice ? (
          <View style={styles.translationBlock}>
            <Text style={styles.translationKicker}>
              Cosa potrebbe voler comunicare
            </Text>
            <Text style={styles.translationText}>
              {ownerCopy(result.dog_voice)}
            </Text>
          </View>
        ) : null}

        {result.consumer_summary ? (
          <Text style={styles.summary}>
            {ownerCopy(result.consumer_summary)}
          </Text>
        ) : null}

        {result.sound_note ? (
          <View style={styles.soundNote}>
            <Ionicons name="volume-medium-outline" size={18} color={colors.accent} />
            <View style={styles.soundNoteCopy}>
              <Text style={styles.soundNoteTitle}>Cosa ho sentito</Text>
              <Text style={styles.soundNoteText}>
                {ownerCopy(result.sound_note)}
              </Text>
            </View>
          </View>
        ) : null}
      </View>

      <View style={styles.prudenceCard} testID="behavior-prudence">
        <Text style={styles.prudenceTitle}>Quanto è prudente questa lettura</Text>
        <Text style={styles.prudenceText}>
          {behaviorPrudenceCopy(result.confidence_band)}
        </Text>
      </View>

      {evidenceSections.observed.length > 0 ? (
        <View style={styles.evidenceSection} testID="observed-evidence">
          <Text style={styles.evidenceTitle}>Cosa ho osservato nel video</Text>
          {evidenceSections.observed.map((item, index) => (
            <EvidenceRow
              key={`${item.label}-${index}`}
              item={{ ...item, label: ownerCopy(item.label) }}
            />
          ))}
        </View>
      ) : null}

      {evidenceSections.ownerContext.length > 0 ? (
        <View style={styles.contextEvidenceCard} testID="owner-context-evidence">
          <Text style={styles.baselineKicker}>Contesto che mi hai dato</Text>
          {evidenceSections.ownerContext.map((item, index) => (
            <Text key={`${item.label}-${index}`} style={styles.baselineNote}>
              {ownerCopy(item.label)}
            </Text>
          ))}
        </View>
      ) : null}

      {evidenceSections.personalMemory.length > 0 &&
      !isPersonalBaselineNote(result.baseline_note) ? (
        <View style={styles.baselineCard} testID="personal-memory-evidence">
          <Text style={styles.baselineKicker}>
            Memoria personale di {dogName}
          </Text>
          {evidenceSections.personalMemory.map((item, index) => (
            <Text key={`${item.label}-${index}`} style={styles.baselineNote}>
              {ownerCopy(item.label)}
            </Text>
          ))}
        </View>
      ) : null}

      {isPersonalBaselineNote(result.baseline_note) ? (
        <View style={styles.baselineCard} testID="per-rocky">
          <Text style={styles.baselineKicker}>
            Memoria personale di {dogName}
          </Text>
          <Text style={styles.baselineNote}>
            {ownerCopy(result.baseline_note)}
          </Text>
        </View>
      ) : null}

      {careNote ? (
        <View style={styles.careCard}>
          <Ionicons name="heart-outline" size={18} color={colors.accent} />
          <View style={styles.careCopy}>
            <Text style={styles.careKicker}>Contesto che mi hai dato</Text>
            <Text style={styles.careNote}>{ownerCopy(careNote)}</Text>
          </View>
        </View>
      ) : null}

      {contextPrompt}

      {showPrimaryAdvice({
        hasSafety: Boolean(safety),
        hasAdvice: hasPrimaryAdvice,
      })
        ? primaryAdvice
        : null}

      {result.recommended_next_step && !hasPrimaryAdvice && !safety ? (
        <View style={styles.nextStepCard} testID="recommended-next-step">
          <Text style={styles.nextStepTitle}>Una cosa utile ora</Text>
          <Text style={styles.nextStepText}>
            {ownerCopy(result.recommended_next_step)}
          </Text>
        </View>
      ) : null}

      {result.what_to_watch && !hasPrimaryAdvice && !safety ? (
        <Text style={styles.watchLine} testID="what-to-watch">
          Cosa osservare: {ownerCopy(result.what_to_watch)}
        </Text>
      ) : null}

      {result.alternatives.length > 0 ? (
        <View style={styles.detailsBlock}>
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ expanded: detailsOpen }}
            onPress={() => setDetailsOpen((open) => !open)}
            style={styles.detailsToggle}
          >
            <Text style={styles.detailsToggleText}>Approfondisci</Text>
            <Ionicons
              name={detailsOpen ? 'chevron-up' : 'chevron-down'}
              size={20}
              color={colors.textSecondary}
            />
          </Pressable>

          {detailsOpen ? (
            <>
              {result.alternatives.length > 0 ? (
                <Card style={styles.alternativeCard}>
                  <SectionHeader
                    title={
                      isAmbiguous
                        ? 'Altre letture possibili'
                        : 'Potrebbero esserci altre spiegazioni'
                    }
                    icon={
                      <Ionicons
                        name="git-branch-outline"
                        size={16}
                        color={colors.accent}
                      />
                    }
                  />
                  {result.alternatives.map((alt) => (
                    <View key={alt.intent} style={styles.alternativeRow}>
                      <Text style={styles.alternativeRationale}>
                        {ownerCopy(alt.rationale)}
                      </Text>
                    </View>
                  ))}
                </Card>
              ) : null}
            </>
          ) : null}
        </View>
      ) : null}

      <FeedbackButtons
        value={feedback}
        onFeedback={onFeedback}
        error={feedbackError}
        dogName={dogName}
        primaryIntent={result.primary_intent}
        alternatives={result.alternatives}
      />
    </View>
  );
}

/* ------------------------------------------------------------------ */

function personalizeCopy(copy: string | null | undefined, dogName: string): string {
  // FIX 3.9: tolerate a null summary (API omitted it) without inventing one.
  return (copy ?? '').replace(/Rocky/g, dogName);
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
  confidencePill: {
    backgroundColor: '#E0F7F6',
    borderRadius: radius.full,
    paddingVertical: 6,
    paddingHorizontal: 16,
    marginTop: 8,
    marginBottom: 8,
    alignSelf: 'center',
  },
  confidencePillText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0D9488',
  },
  evidenceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: '#FFFFFF',
    borderRadius: radius.full,
    paddingVertical: 10,
    paddingHorizontal: 14,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#EDF2F7',
    shadowColor: '#0E2A47',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.03,
    shadowRadius: 6,
    elevation: 1,
  },
  evidenceIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#E0F7F6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  evidenceText: {
    flex: 1,
    fontSize: 14,
    fontWeight: '500',
    color: NAVY,
  },
  whySection: {
    marginTop: 20,
    marginBottom: 8,
  },
  whyTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: NAVY,
    marginBottom: 12,
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
    color: NAVY,
    fontSize: typography.size.md,
    fontWeight: typography.weight.bold,
    marginBottom: spacing.md,
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
    marginBottom: spacing.sm,
  },
  feedbackOptions: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  feedbackOption: {
    flex: 1,
    minHeight: 56,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceMuted,
  },
  feedbackOptionsVertical: {
    gap: 10,
  },
  feedbackPillButton: {
    height: 50,
    borderRadius: radius.full,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingHorizontal: 20,
    shadowColor: '#0E2A47',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
  },
  feedbackPillLabel: {
    fontSize: 15,
    fontWeight: '700',
  },
  saveDiaryButton: {
    height: 50,
    borderRadius: radius.full,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingHorizontal: 20,
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#2DAAAB',
  },
  saveDiaryLabel: {
    fontSize: 15,
    fontWeight: '700',
    color: '#2DAAAB',
  },
  feedbackOptionSelected: {
    borderWidth: 2,
    borderColor: '#FFFFFF',
    transform: [{ scale: 0.99 }],
  },
  feedbackOptionPressed: {
    opacity: 0.88,
    transform: [{ scale: 0.98 }],
  },
  resultHero: {
    alignItems: 'center',
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.md,
    backgroundColor: '#FFFFFF',
  },
  resultHeroGraphicWrap: {
    width: 160,
    height: 150,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  resultPuppyCircle: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: '#E0F2F7',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  resultPuppyImage: {
    width: 120,
    height: 120,
  },
  confettiDot: {
    position: 'absolute',
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  thoughtKicker: {
    color: SUMMARY_MUTED,
    fontSize: typography.size.xs,
    fontWeight: typography.weight.semibold,
    textAlign: 'center',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginBottom: spacing.xs,
  },
  headlineRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
    paddingHorizontal: spacing.sm,
  },
  headlineSparkle: {
    fontSize: 22,
  },
  resultHeroUncertain: {
    backgroundColor: '#FFFDF9',
  },
  resultHeroSafety: {
    backgroundColor: colors.dangerSoft,
  },
  headline: {
    fontSize: 22,
    fontWeight: '700',
    color: NAVY,
    textAlign: 'center',
    lineHeight: 28,
  },
  translationBlock: {
    marginTop: spacing.md,
    paddingHorizontal: spacing.md,
  },
  translationKicker: {
    color: SUMMARY_MUTED,
    fontSize: typography.size.xs,
    fontWeight: typography.weight.semibold,
    textAlign: 'center',
    textTransform: 'uppercase',
  },
  translationText: {
    marginTop: spacing.xs,
    color: NAVY,
    fontSize: typography.size.lg,
    fontWeight: typography.weight.bold,
    textAlign: 'center',
    lineHeight: typography.size.lg * typography.lineHeight.relaxed,
  },
  summary: {
    marginTop: spacing.md,
    fontSize: 14,
    color: SUMMARY_MUTED,
    textAlign: 'center',
    lineHeight: 14 * typography.lineHeight.relaxed,
    paddingHorizontal: spacing.sm,
  },
  soundNote: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    marginTop: spacing.lg,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
  },
  soundNoteCopy: {
    flex: 1,
  },
  soundNoteTitle: {
    color: colors.accent,
    fontSize: typography.size.xs,
    fontWeight: typography.weight.bold,
    textTransform: 'uppercase',
  },
  soundNoteText: {
    marginTop: spacing.xs,
    color: colors.text,
    fontSize: typography.size.sm,
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
  careCopy: {
    flex: 1,
  },
  careKicker: {
    marginBottom: spacing.xs,
    fontSize: typography.size.xs,
    fontWeight: typography.weight.bold,
    color: colors.accent,
    textTransform: 'uppercase',
  },
  careNote: {
    fontSize: typography.size.sm,
    color: colors.text,
    lineHeight: typography.size.sm * typography.lineHeight.relaxed,
  },
  prudenceCard: {
    marginTop: spacing.md,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceMuted,
  },
  prudenceTitle: {
    fontSize: typography.size.xs,
    fontWeight: typography.weight.bold,
    color: colors.textSecondary,
    textTransform: 'uppercase',
  },
  prudenceText: {
    marginTop: spacing.xs,
    fontSize: typography.size.sm,
    color: colors.text,
    lineHeight: typography.size.sm * typography.lineHeight.relaxed,
  },
  detailsBlock: {
    marginTop: spacing.lg,
  },
  detailsToggle: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
  },
  detailsToggleText: {
    color: colors.text,
    fontSize: typography.size.md,
    fontWeight: typography.weight.semibold,
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
  baselineCard: {
    marginTop: spacing.md,
    padding: spacing.lg,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
  },
  contextEvidenceCard: {
    marginTop: spacing.md,
    padding: spacing.lg,
    borderRadius: radius.lg,
    backgroundColor: colors.accentSoft,
  },
  baselineKicker: {
    fontSize: typography.size.xs,
    fontWeight: typography.weight.bold,
    color: colors.accent,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginBottom: spacing.xs,
  },
  baselineNote: {
    fontSize: typography.size.sm,
    color: colors.text,
    lineHeight: typography.size.sm * typography.lineHeight.relaxed,
  },
  safetyCard: {
    marginTop: spacing.md,
    padding: spacing.lg,
    borderRadius: radius.lg,
    backgroundColor: colors.dangerSoft,
  },
  safetyHeading: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  safetyTitle: {
    flex: 1,
    fontSize: typography.size.md,
    fontWeight: typography.weight.bold,
    color: colors.text,
  },
  safetyMessage: {
    fontSize: typography.size.sm,
    color: colors.text,
    lineHeight: typography.size.sm * typography.lineHeight.relaxed,
  },
  safetyAction: {
    marginTop: spacing.sm,
    fontSize: typography.size.sm,
    fontWeight: typography.weight.bold,
    color: colors.danger,
  },
  watchLine: {
    marginTop: spacing.md,
    fontSize: typography.size.sm,
    color: colors.textSecondary,
    lineHeight: typography.size.sm * typography.lineHeight.relaxed,
  },
  nextStepCard: {
    marginTop: spacing.md,
    padding: spacing.lg,
    borderRadius: radius.md,
    backgroundColor: colors.accentSoft,
  },
  nextStepTitle: {
    color: colors.accent,
    fontSize: typography.size.xs,
    fontWeight: typography.weight.bold,
    textTransform: 'uppercase',
  },
  nextStepText: {
    marginTop: spacing.xs,
    color: colors.text,
    fontSize: typography.size.sm,
    lineHeight: typography.size.sm * typography.lineHeight.relaxed,
  },
  correctionBlock: {
    marginTop: spacing.md,
  },
  correctionTitle: {
    fontSize: typography.size.sm,
    fontWeight: typography.weight.semibold,
    color: colors.text,
    marginBottom: spacing.sm,
  },
  correctionChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  correctionChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.full,
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: colors.border,
  },
  correctionChipLabel: {
    fontSize: typography.size.xs,
    color: colors.text,
    fontWeight: typography.weight.medium,
  },
  researchNote: {
    marginTop: spacing.sm,
    fontSize: typography.size.xs,
    color: colors.textMuted,
    lineHeight: typography.size.xs * typography.lineHeight.relaxed,
  },
});
