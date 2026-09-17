/**
 * Lista pattern personali (Spec V1 sez. 17.2 — GET /v1/dogs/{dog_id}/patterns).
 * Mostra solo pattern eligibili/visibili (mai ARCHIVED in questa lista),
 * con chip di stato, support count e reliability band (mai %).
 */
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Card, ErrorState, ScreenContainer } from '@/components';
import { colors, spacing, typography } from '@/theme/tokens';
import { useDogProfile } from '@/features/core/useDogProfile';
import { usePersonalPatterns } from '@/features/patterns/api';
import {
  ConfidenceBandPill,
  PatternStateChip,
  SectionHeader,
  StackScreenHeader,
} from '@/features/secondary/components';

export default function PatternsScreen() {
  const router = useRouter();
  const { dog } = useDogProfile();
  const patternsQuery = usePersonalPatterns(dog.id);
  const patterns = patternsQuery.patterns.filter((p) => p.state !== 'ARCHIVED');

  return (
    <ScreenContainer scroll>
      <StackScreenHeader title={`Come conosco ${dog.name}`} />
      <Text style={styles.intro}>
        Qui trovi soltanto ciò che è comparso più volte nei momenti di{' '}
        {dog.name}. Il tuo parere mi aiuta a non dare nulla per scontato.
      </Text>

      {patternsQuery.live && patternsQuery.isLoading ? (
        <Card>
          <Text style={styles.emptyText}>Sto raccogliendo i momenti di {dog.name}…</Text>
        </Card>
      ) : patternsQuery.live && patternsQuery.isError ? (
        <ErrorState
          title="Abitudini non disponibili"
          message="Non riesco a caricarli. Controlla la connessione e riprova."
          onRetry={() => void patternsQuery.refetch()}
        />
      ) : patterns.length === 0 ? (
        <Card>
          <Text style={styles.emptyText}>
            Sto ancora conoscendo {dog.name}. Quando un comportamento si
            ripeterà in momenti diversi, potrai ritrovarlo qui.
          </Text>
        </Card>
      ) : (
        patterns.map((pattern) => (
          <Pressable
            key={pattern.id}
            accessibilityRole="button"
            onPress={() => router.push(`/patterns/${pattern.id}`)}
          >
            <Card style={styles.patternCard}>
              <View style={styles.cardHeader}>
                <Text style={styles.patternTitle}>{pattern.title}</Text>
                <Ionicons
                  name="chevron-forward"
                  size={18}
                  color={colors.textMuted}
                />
              </View>
              <View style={styles.chipsRow}>
                <PatternStateChip state={pattern.state} />
                <ConfidenceBandPill band={pattern.reliabilityBand} />
              </View>
              <View style={styles.statsRow}>
                <View style={styles.stat}>
                  <Ionicons
                    name="checkmark-circle-outline"
                    size={14}
                    color={colors.accent}
                  />
                  <Text style={styles.statText}>
                    Visto {pattern.supportCount}{' '}
                    {pattern.supportCount === 1 ? 'volta' : 'volte'}
                  </Text>
                </View>
                {pattern.contradictCount > 0 && (
                  <View style={styles.stat}>
                    <Ionicons
                      name="alert-circle-outline"
                      size={14}
                      color={colors.warning}
                    />
                    <Text style={styles.statText}>
                      {pattern.contradictCount} volte è andata diversamente
                    </Text>
                  </View>
                )}
              </View>
            </Card>
          </Pressable>
        ))
      )}

      <SectionHeader title="Come funziona" />
      <Card>
        <Text style={styles.howText}>
          Mostro un’abitudine soltanto dopo momenti ripetuti. Puoi sempre
          confermarla, indicare che non ti ritrovi oppure non mostrarla più.
        </Text>
      </Card>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  intro: {
    fontSize: typography.size.sm,
    color: colors.textSecondary,
    lineHeight: typography.size.sm * typography.lineHeight.relaxed,
    marginBottom: spacing.lg,
  },
  emptyText: {
    fontSize: typography.size.sm,
    color: colors.textSecondary,
    lineHeight: typography.size.sm * typography.lineHeight.relaxed,
  },
  patternCard: {
    marginBottom: spacing.md,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  patternTitle: {
    flex: 1,
    fontSize: typography.size.md,
    fontWeight: typography.weight.bold,
    color: colors.text,
  },
  chipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  statsRow: {
    gap: spacing.xs,
  },
  stat: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  statText: {
    fontSize: typography.size.xs,
    color: colors.textSecondary,
  },
  howText: {
    fontSize: typography.size.sm,
    color: colors.textSecondary,
    lineHeight: typography.size.sm * typography.lineHeight.relaxed,
  },
});

