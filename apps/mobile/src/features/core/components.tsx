/**
 * Componenti condivisi dei domini core (F1): header di sezione, avatar cane,
 * Knowledge Score, pill di confidenza, righe evidence, vista risultato
 * comportamentale (riusata da /behavior/result e /diary/event) e feedback
 * con 👍/👎. Stile vincolante: docs/ux/UX_REFERENCE.md + mockup ufficiali.
 */
import React, { useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View, ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Card, Chip, ProgressBar, SectionHeader } from '../../components';
import { colors, radius, spacing, typography } from '../../theme/tokens';
import { BEHAVIOR_INTENT_LABELS } from '../../contracts/types';
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
/* FeedbackButtons — "Ti è stata utile?" 👍 / 👎 one-tap */
/* ------------------------------------------------------------------ */

export function FeedbackButtons({
  value,
  onFeedback,
  error,
  dogName,
  primaryIntent,
  alternatives = [],
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
  const [correction, setCorrection] = useState<BehaviorIntent | null>(null);
  const options: Array<{
    value: FeedbackValue;
    label: string;
    icon: keyof typeof Ionicons.glyphMap;
    selectedBg: string;
    selectedBorder: string;
  }> = [
    {
      value: 'YES',
      label: 'Sì, è così',
      icon: 'checkmark-circle-outline',
      selectedBg: colors.successSoft,
      selectedBorder: colors.success,
    },
    {
      value: 'NO',
      label: 'Non proprio',
      icon: 'close-circle-outline',
      selectedBg: colors.dangerSoft,
      selectedBorder: colors.danger,
    },
    {
      value: 'UNKNOWN',
      label: 'Non so',
      icon: 'help-circle-outline',
      selectedBg: colors.surfaceMuted,
      selectedBorder: colors.textSecondary,
    },
  ];
  const correctionOptions = alternatives
    .map((item) => item.intent)
    .filter((intent) => intent !== primaryIntent)
    .slice(0, 3);

  return (
    <View style={styles.feedbackCard}>
      <Text style={styles.feedbackTitle}>
        Ti sembra proprio {dogName ?? 'il tuo cane'}?
      </Text>
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
              <Text
                style={[
                  styles.feedbackOptionLabel,
                  selected && { color: option.selectedBorder },
                ]}
              >
                {option.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
      {value === 'NO' && correctionOptions.length > 0 ? (
        <View style={styles.feedbackCorrection}>
          <Text style={styles.feedbackCorrectionTitle}>
            Quale lettura ti sembra più vicina?
          </Text>
          {correctionOptions.map((intent) => (
            <Pressable
              key={intent}
              accessibilityRole="button"
              accessibilityState={{ selected: correction === intent }}
              onPress={() => {
                setCorrection(intent);
                onFeedback('NO', { correction_label: intent });
              }}
              style={({ pressed }) => [
                styles.feedbackCorrectionOption,
                correction === intent && styles.feedbackCorrectionOptionSelected,
                pressed && styles.feedbackOptionPressed,
              ]}
            >
              <Text style={styles.feedbackCorrectionLabel}>
                {BEHAVIOR_INTENT_LABELS[intent]}
              </Text>
            </Pressable>
          ))}
        </View>
      ) : null}
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
  photoUri,
  contextPrompt,
  primaryAdvice,
  adviceRationale,
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
  adviceRationale?: string | null;
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
      adviceRationale ||
      result.consumer_summary ||
      `Ecco cosa emerge dal video di ${dogName}`,
  );
  const safety = result.safety;
  const evidenceSections = consumerEvidenceSections(result.evidence);
  const hasPrimaryAdvice = Boolean(primaryAdvice);
  const isVariation =
    result.baseline_comparison === 'VARIATION' ||
    result.baseline_comparison === 'CONTESTED';
  const translation = !isInsufficient && !isAmbiguous && !safety
    ? result.dog_voice?.trim()
    : null;
  const memories = (result.personalMemory ?? []).filter(
    (memory) => memory.support_summary.trim().length > 0,
  );
  const hasConfirmedMemory = memories.some(
    (memory) => ['ESTABLISHED', 'STRONG'].includes(memory.state.toUpperCase()),
  );
  const showPersonalNote = isPersonalBaselineNote(result.baseline_note) && (
    isVariation || (result.baseline_comparison === 'RECOGNIZED' &&
      hasConfirmedMemory && !safety && !isInsufficient && !isAmbiguous)
  );
  const hasDetails = Boolean(
    adviceRationale ||
      result.consumer_summary ||
      memories.length ||
      result.sound_note ||
      result.what_to_watch ||
      result.confidence_band ||
      result.alternatives.length ||
      evidenceSections.observed.length ||
      evidenceSections.ownerContext.length ||
      (result.processingOwnerContext?.length ?? 0) > 0 ||
      evidenceSections.personalMemory.length ||
      isPersonalBaselineNote(result.baseline_note) ||
      careNote,
  );
  const showSummary = isInsufficient && !safety && Boolean(result.consumer_summary);

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
        {photoUri ? (
          <Image
            source={{ uri: photoUri }}
            style={styles.resultPhoto}
            resizeMode="cover"
            accessibilityLabel={`Foto di ${dogName}`}
          />
        ) : (
          <View style={styles.resultIcon}>
            <CuteIcon
              name={
                isInsufficient || !result.primary_intent
                  ? 'search'
                  : INTENT_HERO_ICONS[result.primary_intent]
              }
              size={32}
              color={
                safety || isInsufficient || isAmbiguous
                  ? colors.warning
                  : colors.accent
              }
            />
          </View>
        )}
        <Text style={styles.thoughtKicker}>In questo momento</Text>
        <Text style={styles.headline}>{headline}</Text>
        {translation ? (
          <View style={styles.translationBlock} testID="behavior-dog-voice">
            <Text style={styles.translationKicker}>In parole umane</Text>
            <Text style={styles.translationText}>{ownerCopy(translation)}</Text>
            <Text style={styles.translationHint}>Una possibile lettura del momento</Text>
          </View>
        ) : null}
        {showSummary ? (
          <Text style={styles.summary}>
            {ownerCopy(result.consumer_summary!)}
          </Text>
        ) : null}
        {showPersonalNote ? (
          <Text style={styles.baselineHeroNote} testID="baseline-hero-note">
            {ownerCopy(result.baseline_note ?? '')}
          </Text>
        ) : null}
      </View>

      {showPrimaryAdvice({
        hasSafety: Boolean(safety),
        hasAdvice: hasPrimaryAdvice,
      })
        ? primaryAdvice
        : null}

      {result.recommended_next_step && !hasPrimaryAdvice && !safety ? (
        <View style={styles.nextStepCard} testID="recommended-next-step">
          <Text style={styles.nextStepTitle}>Cosa fare ora</Text>
          <Text style={styles.nextStepText}>
            {ownerCopy(result.recommended_next_step)}
          </Text>
        </View>
      ) : null}

      {hasDetails ? (
        <View style={styles.detailsBlock}>
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ expanded: detailsOpen }}
            testID="behavior-explanation-toggle"
            onPress={() => setDetailsOpen((open) => !open)}
            style={styles.detailsToggle}
          >
            <Text style={styles.detailsToggleText}>Perché?</Text>
            <Ionicons
              name={detailsOpen ? 'chevron-up' : 'chevron-down'}
              size={20}
              color={colors.textSecondary}
            />
          </Pressable>

          {detailsOpen ? (
            <>
              {result.consumer_summary && !showSummary && !safety ? (
                <Text style={styles.summary}>{ownerCopy(result.consumer_summary)}</Text>
              ) : null}

              {evidenceSections.observed.length > 0 ? (
                <View style={styles.evidenceSection} testID="observed-evidence">
                  <Text style={styles.evidenceTitle}>
                    Cosa si vede nel video
                  </Text>
                  {evidenceSections.observed.map((item, index) => (
                    <EvidenceRow
                      key={`${item.label}-${index}`}
                      item={{ ...item, label: ownerCopy(item.label) }}
                    />
                  ))}
                </View>
              ) : null}

              {result.sound_note ? (
                <View style={styles.soundNote}>
                  <Ionicons
                    name="volume-medium-outline"
                    size={18}
                    color={colors.accent}
                  />
                  <View style={styles.soundNoteCopy}>
                    <Text style={styles.soundNoteTitle}>Cosa si sente</Text>
                    <Text style={styles.soundNoteText}>
                      {ownerCopy(result.sound_note)}
                    </Text>
                  </View>
                </View>
              ) : null}

              {result.processingOwnerContext &&
              result.processingOwnerContext.length > 0 ? (
                <View
                  style={styles.contextEvidenceCard}
                  testID="processing-owner-context"
                >
                  <Text style={styles.baselineKicker}>
                    Ciò che hai raccontato durante l’analisi
                  </Text>
                  {result.processingOwnerContext.map((item, index) => (
                    <Text
                      key={`${item.title}-${index}`}
                      style={styles.baselineNote}
                    >
                      {item.title}: {ownerCopy(item.label)}
                    </Text>
                  ))}
                </View>
              ) : null}

              {evidenceSections.ownerContext.length > 0 ? (
                <View
                  style={styles.contextEvidenceCard}
                  testID="owner-context-evidence"
                >
                  <Text style={styles.baselineKicker}>
                    Informazioni che hai dato
                  </Text>
                  {evidenceSections.ownerContext.map((item, index) => (
                    <Text
                      key={`${item.label}-${index}`}
                      style={styles.baselineNote}
                    >
                      {ownerCopy(item.label)}
                    </Text>
                  ))}
                </View>
              ) : null}

              {evidenceSections.personalMemory.length > 0 || memories.length > 0 ? (
                <View
                  style={styles.baselineCard}
                  testID="personal-memory-evidence"
                >
                  <Text style={styles.baselineKicker}>
                    Rispetto al solito di {dogName}
                  </Text>
                  {memories.map((memory) => (
                    <Text key={memory.pattern_id} style={styles.baselineNote}>
                      {['ESTABLISHED', 'STRONG'].includes(memory.state.toUpperCase())
                        ? 'Già confermato insieme: '
                        : memory.state.toUpperCase() === 'CONTESTED'
                          ? 'Da rivedere insieme: '
                          : 'Ancora da confermare: '}
                      {ownerCopy(memory.support_summary)}
                    </Text>
                  ))}
                  {evidenceSections.personalMemory.map((item, index) => (
                    <Text
                      key={`${item.label}-${index}`}
                      style={styles.baselineNote}
                    >
                      {ownerCopy(item.label)}
                    </Text>
                  ))}
                </View>
              ) : null}

              {isPersonalBaselineNote(result.baseline_note) ? (
                <View style={styles.baselineCard} testID="per-rocky">
                  <Text style={styles.baselineKicker}>
                    Rispetto al solito di {dogName}
                  </Text>
                  <Text style={styles.baselineNote}>
                    {ownerCopy(result.baseline_note ?? '')}
                  </Text>
                </View>
              ) : null}

              {careNote ? (
                <View style={styles.careCard}>
                  <Ionicons
                    name="heart-outline"
                    size={18}
                    color={colors.accent}
                  />
                  <View style={styles.careCopy}>
                    <Text style={styles.careKicker}>
                      Informazioni che hai dato
                    </Text>
                    <Text style={styles.careNote}>
                      {ownerCopy(careNote)}
                    </Text>
                  </View>
                </View>
              ) : null}

              <View style={styles.prudenceCard} testID="behavior-prudence">
                <Text style={styles.prudenceText}>
                  {behaviorPrudenceCopy(result.confidence_band)}
                </Text>
              </View>

              {adviceRationale && !safety ? (
                <View style={styles.evidenceSection}>
                  <Text style={styles.evidenceTitle}>Perché questo consiglio</Text>
                  <Text style={styles.baselineNote}>{ownerCopy(adviceRationale)}</Text>
                </View>
              ) : null}

              {result.what_to_watch ? (
                <Text style={styles.watchLine} testID="what-to-watch">
                  Se vuoi approfondire: {ownerCopy(result.what_to_watch)}
                </Text>
              ) : null}

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

      {contextPrompt}

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
  feedbackTitle: {
    color: colors.text,
    fontSize: typography.size.md,
    fontWeight: typography.weight.bold,
    marginBottom: spacing.md,
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
  feedbackCorrection: {
    marginTop: spacing.md,
    gap: spacing.sm,
  },
  feedbackCorrectionTitle: {
    fontSize: typography.size.sm,
    fontWeight: typography.weight.semibold,
    color: colors.text,
  },
  feedbackCorrectionOption: {
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
  },
  feedbackCorrectionOptionSelected: {
    borderColor: colors.accent,
    backgroundColor: colors.accentSoft,
  },
  feedbackCorrectionLabel: {
    fontSize: typography.size.sm,
    color: colors.text,
  },
  feedbackOption: {
    flex: 1,
    minHeight: 64,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingHorizontal: spacing.xs,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceMuted,
  },
  feedbackOptionLabel: {
    fontSize: typography.size.xs,
    fontWeight: typography.weight.semibold,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  feedbackOptionPressed: {
    opacity: 0.85,
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
  resultHeroSafety: {
    backgroundColor: colors.dangerSoft,
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
  resultPhoto: {
    width: '100%',
    height: 210,
    borderRadius: radius.md,
    marginBottom: spacing.lg,
  },
  thoughtKicker: {
    color: colors.textSecondary,
    fontSize: typography.size.xs,
    fontWeight: typography.weight.semibold,
    textAlign: 'center',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginBottom: spacing.sm,
  },
  headline: {
    fontSize: typography.size.xxl,
    fontWeight: typography.weight.bold,
    color: colors.text,
    textAlign: 'center',
    lineHeight: typography.size.xxl * typography.lineHeight.tight,
  },
  translationBlock: {
    marginTop: spacing.md,
    paddingHorizontal: spacing.md,
  },
  translationKicker: {
    color: colors.textSecondary,
    fontSize: typography.size.xs,
    fontWeight: typography.weight.semibold,
    textAlign: 'center',
    textTransform: 'uppercase',
  },
  translationHint: {
    marginTop: spacing.xs,
    color: colors.textSecondary,
    fontSize: typography.size.xs,
    textAlign: 'center',
  },
  translationText: {
    marginTop: spacing.xs,
    color: colors.text,
    fontSize: typography.size.lg,
    fontWeight: typography.weight.bold,
    textAlign: 'center',
    lineHeight: typography.size.lg * typography.lineHeight.relaxed,
  },
  summary: {
    marginTop: spacing.md,
    fontSize: typography.size.sm,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: typography.size.sm * typography.lineHeight.relaxed,
  },
  baselineHeroNote: {
    marginTop: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    color: colors.text,
    fontSize: typography.size.sm,
    textAlign: 'center',
    lineHeight: typography.size.sm * typography.lineHeight.relaxed,
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
