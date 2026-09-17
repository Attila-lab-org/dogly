/**
 * Componenti condivisi dei domini core (F1): header di sezione, avatar cane,
 * Knowledge Score, pill di confidenza, righe evidence, vista risultato
 * comportamentale (riusata da /behavior/result e /diary/event) e feedback
 * a tre vie. Stile vincolante: docs/ux/UX_REFERENCE.md + mockup ufficiali.
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
import { BEHAVIOR_INTENT_LABELS } from '../../contracts/types';
import { CuteIcon, type CuteIconName } from '../../components/CuteIcon';
import {
  CONFIDENCE_BAND_LABELS,
  dogVoiceLine,
  intentHeadline,
  sanitizeOwnerCopy,
} from './copy';
import { correctionOptions } from './correctionOptions';
import { knowledgeLevelLabel, type KnowledgeScore } from './types';
import { getConsents } from '../privacy/consents';

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
/* FeedbackButtons — "Sì, è così / Non credo / Non lo so" one-tap (6.1) */
/* ------------------------------------------------------------------ */

export function FeedbackButtons({
  value,
  onFeedback,
  error,
  dogName = 'lui',
  primaryIntent = null,
  alternatives = [],
}: {
  value: FeedbackValue | null;
  onFeedback: (
    value: FeedbackValue,
    extras?: { correction_label?: BehaviorIntent | null },
  ) => void;
  /** Messaggio onesto quando il salvataggio è fallito: il badge "Salvato" resta spento. */
  error?: string | null;
  dogName?: string;
  primaryIntent?: BehaviorIntent | null;
  alternatives?: Array<{ intent: BehaviorIntent }>;
}) {
  const [awaitingCorrection, setAwaitingCorrection] = React.useState(false);
  const researchOptIn = getConsents().researchTraining;
  const options: Array<{
    value: FeedbackValue;
    label: string;
    icon: keyof typeof Ionicons.glyphMap;
    bgColor: string;
    textColor: string;
    iconColor: string;
  }> = [
    {
      value: 'YES',
      label: 'Sì, è così',
      icon: 'thumbs-up',
      bgColor: '#2DAAAB',
      textColor: '#FFFFFF',
      iconColor: '#FFFFFF',
    },
    {
      value: 'NO',
      label: 'Non proprio',
      icon: 'thumbs-down',
      bgColor: '#FF8B74',
      textColor: '#FFFFFF',
      iconColor: '#FFFFFF',
    },
    {
      value: 'UNKNOWN',
      label: 'Non lo so',
      icon: 'help-circle-outline',
      bgColor: '#F1F5F9',
      textColor: '#1A2B48',
      iconColor: '#1A2B48',
    },
  ];
  const chips = correctionOptions(primaryIntent, alternatives);

  const submit = (
    next: FeedbackValue,
    extras?: { correction_label?: BehaviorIntent | null },
  ) => {
    setAwaitingCorrection(false);
    onFeedback(next, extras);
  };

  return (
    <View style={styles.feedbackCard}>
      <View style={styles.feedbackHeading}>
        <Text style={styles.feedbackTitle}>Ti torna per {dogName}?</Text>
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
      <View style={styles.feedbackOptionsVertical}>
        {options.map((option) => {
          const selected = value === option.value;
          return (
            <Pressable
              key={option.value}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              onPress={() => {
                if (option.value === 'NO' && !value) {
                  setAwaitingCorrection(true);
                  return;
                }
                submit(option.value);
              }}
              style={({ pressed }) => [
                styles.feedbackPillButton,
                { backgroundColor: option.bgColor },
                selected && styles.feedbackOptionSelected,
                pressed && styles.feedbackOptionPressed,
              ]}
              testID={`feedback-${option.value.toLowerCase()}`}
            >
              <Ionicons
                name={option.icon}
                size={18}
                color={option.iconColor}
              />
              <Text
                style={[
                  styles.feedbackPillLabel,
                  { color: option.textColor },
                ]}
              >
                {option.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
      {awaitingCorrection ? (
        <View style={styles.correctionBlock} testID="feedback-correction">
          <Text style={styles.correctionTitle}>Cosa stava davvero facendo?</Text>
          <View style={styles.correctionChips}>
            {chips.map((intent) => (
              <Pressable
                key={intent}
                onPress={() =>
                  submit('NO', { correction_label: intent })
                }
                style={styles.correctionChip}
                testID={`correction-${intent}`}
              >
                <Text style={styles.correctionChipLabel}>
                  {BEHAVIOR_INTENT_LABELS[intent]}
                </Text>
              </Pressable>
            ))}
            <Pressable
              onPress={() => submit('NO', { correction_label: null })}
              style={styles.correctionChip}
              testID="correction-other"
            >
              <Text style={styles.correctionChipLabel}>Altro</Text>
            </Pressable>
          </View>
          <Text style={styles.researchNote}>
            {researchOptIn
              ? `Questa correzione aiuta Dogly a capire ${dogName} e, con il tuo consenso, anche la ricerca.`
              : `Questa correzione resta sul profilo di ${dogName}. Per usarla anche in ricerca, attiva il consenso in Privacy.`}
          </Text>
        </View>
      ) : null}
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
  /** Stato errore del salvataggio feedback (mai finto "Salvato"). */
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
    result.consumer_headline || intentHeadline(dogName, result.primary_intent),
  );
  const safety = result.safety;
  const celebrate = !safety && !isInsufficient && !isAmbiguous;

  return (
    <View>
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
        <View style={styles.headlineRow}>
          <Text style={styles.headline}>{headline}</Text>
          {celebrate ? <Text style={styles.headlineSparkle}> ✨</Text> : null}
        </View>
        <View style={styles.translationBlock}>
          <Text style={styles.translationKicker}>
            Cosa potrebbe volerti comunicare
          </Text>
          <Text style={styles.translationText}>
            {ownerCopy(result.dog_voice || dogVoiceLine(result.primary_intent))}
          </Text>
        </View>

        <ConfidencePill band={result.confidence_band} />

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

      {result.baseline_note ? (
        <View style={styles.baselineCard} testID="per-rocky">
          <Text style={styles.baselineKicker}>Per {dogName}</Text>
          <Text style={styles.baselineNote}>
            {ownerCopy(result.baseline_note)}
          </Text>
        </View>
      ) : null}

      {careNote ? (
        <View style={styles.careCard}>
          <Ionicons name="heart-outline" size={18} color={colors.accent} />
          <Text style={styles.careNote}>{careNote}</Text>
        </View>
      ) : null}

      {contextPrompt}

      {safety ? (
        <View style={styles.safetyCard} testID="behavior-safety">
          <View style={styles.safetyHeading}>
            <Ionicons name="alert-circle" size={20} color={colors.danger} />
            <Text style={styles.safetyTitle}>{safety.title}</Text>
          </View>
          <Text style={styles.safetyMessage}>{safety.message}</Text>
          <Text style={styles.safetyAction}>{safety.action}</Text>
        </View>
      ) : null}

      {primaryAdvice}

      {result.recommended_next_step && !primaryAdvice && !safety ? (
        <View style={styles.nextStepCard} testID="recommended-next-step">
          <Text style={styles.nextStepTitle}>Prova così</Text>
          <Text style={styles.nextStepText}>
            {ownerCopy(result.recommended_next_step)}
          </Text>
        </View>
      ) : null}

      {result.what_to_watch && !primaryAdvice ? (
        <Text style={styles.watchLine} testID="what-to-watch">
          Da osservare: {ownerCopy(result.what_to_watch)}
        </Text>
      ) : null}

      {result.evidence.length > 0 || result.alternatives.length > 0 ? (
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
              {result.evidence.length > 0 ? (
                <View style={styles.evidenceSection}>
                  <Text style={styles.evidenceTitle}>Perché lo penso</Text>
                  {result.evidence.map((item, index) => (
                    <EvidenceRow
                      key={`${item.label}-${index}`}
                      item={{
                        ...item,
                        label: ownerCopy(item.label),
                      }}
                    />
                  ))}
                </View>
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
                      <Text style={styles.alternativeLabel}>
                        {BEHAVIOR_INTENT_LABELS[alt.intent]}
                      </Text>
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
  careNote: {
    flex: 1,
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
