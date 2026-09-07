/**
 * Dettaglio pattern + azioni di review (Spec V1 sez. 9 —
 * POST /v1/patterns/{id}/review): "Contesta" / "Archivia" sono collegate al
 * backend quando disponibile. "Corretto": il backend non espone un'azione di
 * conferma esplicita (enum: contest | archive | correct_context) — mostriamo
 * uno stato onesto invece di un finto salvataggio. In mock gate dev nessun
 * feedback viene inviato e la UI lo dichiara.
 * Spiegazione trasparente delle evidenze: support/contradict count,
 * note testuali, reliability band (mai %).
 */
import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Button, Card, ErrorState, ScreenContainer } from '@/components';
import { colors, spacing, typography } from '@/theme/tokens';
import {
  reviewPattern,
  usePersonalPatterns,
} from '@/features/patterns/api';
import { useDogProfile } from '@/features/core/useDogProfile';
import {
  ConfidenceBandPill,
  PatternStateChip,
  StackScreenHeader,
} from '@/features/secondary/components';

type ReviewAction = 'CONFIRM' | 'CONTEST' | 'ARCHIVE';
type ReviewOutcome = 'recorded' | 'demo';
type IconName = keyof typeof Ionicons.glyphMap;

const reviewCopy: Record<ReviewAction, string> = {
  CONFIRM:
    "Grazie! Il tuo feedback rafforza la qualità dell'evidenza di questo pattern.",
  CONTEST:
    'Segnalato: nuove evidenze in conflitto ridurranno il peso di questo pattern finché non sarà chiaro.',
  ARCHIVE:
    'Pattern archiviato: non verrà più usato nelle interpretazioni né mostrato nel profilo.',
};

export default function PatternDetailScreen() {
  const { patternId } = useLocalSearchParams<{ patternId: string }>();
  const router = useRouter();
  const { dog } = useDogProfile();
  const patternsQuery = usePersonalPatterns(dog.id);
  const { live } = patternsQuery;
  const pattern = patternsQuery.patterns.find((p) => p.id === patternId);
  const [reviewed, setReviewed] = useState<ReviewAction | null>(null);
  const [outcome, setOutcome] = useState<ReviewOutcome | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [reviewError, setReviewError] = useState(false);

  if (live && patternsQuery.isLoading) {
    return (
      <ScreenContainer>
        <StackScreenHeader title="Pattern" />
        <Card>
          <Text style={styles.bodyText}>Caricamento…</Text>
        </Card>
      </ScreenContainer>
    );
  }

  if (live && patternsQuery.isError) {
    return (
      <ScreenContainer>
        <StackScreenHeader title="Pattern" />
        <ErrorState
          title="Pattern non disponibile"
          message="Non riesco a caricarlo. Controlla la connessione e riprova."
          onRetry={() => void patternsQuery.refetch()}
        />
      </ScreenContainer>
    );
  }

  if (!pattern) {
    return (
      <ScreenContainer>
        <StackScreenHeader title="Pattern" />
        <Card>
          <Text style={styles.bodyText}>
            Questo pattern non è più disponibile: potrebbe essere stato
            archiviato.
          </Text>
        </Card>
      </ScreenContainer>
    );
  }

  const isArchived = reviewed === 'ARCHIVE' && outcome === 'recorded';

  const submitReview = async (action: ReviewAction) => {
    setReviewError(false);
    if (!live) {
      // Mock gate dev: nessun finto salvataggio, lo diciamo esplicitamente.
      setReviewed(action);
      setOutcome('demo');
      return;
    }
    setSubmitting(true);
    try {
      const apiAction =
        action === 'CONFIRM'
          ? 'confirm'
          : action === 'CONTEST'
            ? 'contest'
            : 'archive';
      await reviewPattern(pattern.id, apiAction);
      await patternsQuery.refetch();
      setReviewed(action);
      setOutcome('recorded');
    } catch {
      setReviewError(true);
    } finally {
      setSubmitting(false);
    }
  };

  const outcomeCopy: Record<ReviewOutcome, { icon: IconName; text: string }> = {
    recorded: {
      icon: 'checkmark-circle',
      text: reviewed ? reviewCopy[reviewed] : '',
    },
    demo: {
      icon: 'information-circle-outline',
      text: 'Demo: il tuo parere non è stato inviato al server e nulla viene salvato. Con il backend collegato, Contesta e Archivia vengono registrati davvero.',
    },
  };

  return (
    <ScreenContainer scroll>
      <StackScreenHeader title="Pattern" />

      <Card style={styles.card}>
        <Text style={styles.title}>{pattern.title}</Text>
        <View style={styles.chipsRow}>
          <PatternStateChip state={isArchived ? 'ARCHIVED' : pattern.state} />
          <ConfidenceBandPill band={pattern.reliabilityBand} />
        </View>
        {pattern.state === 'CONTESTED' && !isArchived && (
          <View style={styles.contestedBanner}>
            <Ionicons name="warning-outline" size={16} color={colors.warning} />
            <Text style={styles.contestedText}>
              Nuove evidenze sembrano in conflitto con questo pattern: il tuo
              parere ci aiuta a capire.
            </Text>
          </View>
        )}
      </Card>

      {/* Evidenze trasparenti */}
      <Card style={styles.card}>
        <Text style={styles.sectionTitle}>Perché lo penso</Text>
        {pattern.evidenceNotes.map((note) => (
          <View key={note} style={styles.evidenceRow}>
            <Ionicons
              name="ellipse"
              size={6}
              color={colors.accent}
              style={styles.bullet}
            />
            <Text style={styles.bodyText}>{note}</Text>
          </View>
        ))}
        <View style={styles.countsRow}>
          <View style={styles.countItem}>
            <Text style={styles.countValue}>{pattern.supportCount}</Text>
            <Text style={styles.countLabel}>A supporto</Text>
          </View>
          <View style={styles.countItem}>
            <Text style={styles.countValue}>{pattern.confirmCount}</Text>
            <Text style={styles.countLabel}>Tue conferme</Text>
          </View>
          <View style={styles.countItem}>
            <Text style={[styles.countValue, pattern.contradictCount > 0 && styles.countWarn]}>
              {pattern.contradictCount}
            </Text>
            <Text style={styles.countLabel}>In contraddizione</Text>
          </View>
        </View>
        <Text style={styles.note}>
          Visto per la prima volta il{' '}
          {new Date(pattern.firstSeen).toLocaleDateString('it-IT')} · ultima
          osservazione il{' '}
          {new Date(pattern.lastSeen).toLocaleDateString('it-IT')}
        </Text>
      </Card>

      {/* Azioni di review */}
      {reviewed && outcome ? (
        <Card style={styles.card}>
          <View style={styles.reviewDone}>
            <Ionicons
              name={outcomeCopy[outcome].icon}
              size={28}
              color={outcome === 'recorded' ? colors.accent : colors.textSecondary}
            />
            <Text style={styles.bodyText}>{outcomeCopy[outcome].text}</Text>
          </View>
          <Button
            title="Torna ai pattern"
            variant="outline"
            onPress={() => router.back()}
            style={styles.backButton}
          />
        </Card>
      ) : (
        <Card style={styles.card}>
          <Text style={styles.sectionTitle}>Questo pattern è corretto?</Text>
          <Text style={styles.bodyText}>
            Il tuo parere conta come evidenza, ma nessun pattern cambia solo
            per un singolo feedback.
          </Text>
          {reviewError ? (
            <View style={styles.errorBanner} accessibilityLiveRegion="polite">
              <Ionicons
                name="alert-circle-outline"
                size={16}
                color={colors.danger}
              />
              <Text style={styles.errorText}>
                Review non salvata: controlla la connessione e riprova. Nulla è
                stato registrato.
              </Text>
            </View>
          ) : null}
          <View style={styles.actions}>
            <Button
              title="Corretto"
              loading={submitting}
              disabled={submitting}
              icon={<Ionicons name="checkmark" size={18} color={colors.textOnPrimary} />}
              onPress={() => void submitReview('CONFIRM')}
            />
            <Button
              title="Contesta"
              variant="danger"
              loading={submitting}
              disabled={submitting}
              icon={<Ionicons name="flag-outline" size={18} color={colors.textOnPrimary} />}
              onPress={() => void submitReview('CONTEST')}
            />
            <Button
              title="Archivia"
              variant="outline"
              loading={submitting}
              disabled={submitting}
              icon={<Ionicons name="archive-outline" size={18} color={colors.accent} />}
              onPress={() => void submitReview('ARCHIVE')}
            />
          </View>
        </Card>
      )}
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  card: {
    marginBottom: spacing.lg,
  },
  title: {
    fontSize: typography.size.xl,
    fontWeight: typography.weight.bold,
    color: colors.text,
    marginBottom: spacing.sm,
  },
  chipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  contestedBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    backgroundColor: colors.warningSoft,
    borderRadius: 12,
    padding: spacing.md,
    marginTop: spacing.md,
  },
  contestedText: {
    flex: 1,
    fontSize: typography.size.xs,
    color: colors.text,
    lineHeight: typography.size.xs * typography.lineHeight.relaxed,
  },
  sectionTitle: {
    fontSize: typography.size.md,
    fontWeight: typography.weight.bold,
    color: colors.text,
    marginBottom: spacing.sm,
  },
  evidenceRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    marginBottom: spacing.xs,
  },
  bullet: {
    marginTop: spacing.sm - 2,
  },
  bodyText: {
    flex: 1,
    fontSize: typography.size.sm,
    color: colors.textSecondary,
    lineHeight: typography.size.sm * typography.lineHeight.relaxed,
  },
  countsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  countItem: {
    alignItems: 'center',
  },
  countValue: {
    fontSize: typography.size.xl,
    fontWeight: typography.weight.bold,
    color: colors.accent,
  },
  countWarn: {
    color: colors.warning,
  },
  countLabel: {
    fontSize: typography.size.xs,
    color: colors.textSecondary,
  },
  note: {
    marginTop: spacing.md,
    fontSize: typography.size.xs,
    color: colors.textMuted,
  },
  reviewDone: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginBottom: spacing.md,
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    backgroundColor: colors.dangerSoft,
    borderRadius: 12,
    padding: spacing.md,
    marginTop: spacing.md,
  },
  errorText: {
    flex: 1,
    fontSize: typography.size.xs,
    color: colors.text,
    lineHeight: typography.size.xs * typography.lineHeight.relaxed,
  },
  backButton: {
    marginTop: spacing.xs,
  },
  actions: {
    gap: spacing.sm,
    marginTop: spacing.md,
  },
});
