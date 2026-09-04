/**
 * Dettaglio pattern + azioni di review (Spec V1 sez. 9 —
 * POST /v1/patterns/{id}/review): "Corretto" / "Contesta" / "Archivia".
 * Spiegazione trasparente delle evidenze: support/contradict count,
 * note testuali, reliability band (mai %).
 */
import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Button, Card, ScreenContainer } from '@/components';
import { colors, spacing, typography } from '@/theme/tokens';
import { patternsMock } from '@/mocks/secondary';
import {
  ConfidenceBandPill,
  PatternStateChip,
  StackScreenHeader,
} from '@/features/secondary/components';

type ReviewAction = 'CONFIRM' | 'CONTEST' | 'ARCHIVE';

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
  const pattern = patternsMock.find((p) => p.id === patternId);
  const [reviewed, setReviewed] = useState<ReviewAction | null>(null);

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

  const isArchived = reviewed === 'ARCHIVE';

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
      {reviewed ? (
        <Card style={styles.card}>
          <View style={styles.reviewDone}>
            <Ionicons
              name="checkmark-circle"
              size={28}
              color={colors.accent}
            />
            <Text style={styles.bodyText}>{reviewCopy[reviewed]}</Text>
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
          <View style={styles.actions}>
            <Button
              title="Corretto"
              icon={<Ionicons name="checkmark" size={18} color={colors.textOnPrimary} />}
              onPress={() => setReviewed('CONFIRM')}
            />
            <Button
              title="Contesta"
              variant="danger"
              icon={<Ionicons name="flag-outline" size={18} color={colors.textOnPrimary} />}
              onPress={() => setReviewed('CONTEST')}
            />
            <Button
              title="Archivia"
              variant="outline"
              icon={<Ionicons name="archive-outline" size={18} color={colors.accent} />}
              onPress={() => setReviewed('ARCHIVE')}
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
  backButton: {
    marginTop: spacing.xs,
  },
  actions: {
    gap: spacing.sm,
    marginTop: spacing.md,
  },
});
