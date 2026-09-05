/**
 * Lista pattern personali (Spec V1 sez. 17.2 — GET /v1/dogs/{dog_id}/patterns).
 * Mostra solo pattern eligibili/visibili (mai ARCHIVED in questa lista),
 * con chip di stato, support count e reliability band (mai %).
 */
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Card, ScreenContainer } from '@/components';
import { colors, spacing, typography } from '@/theme/tokens';
import { patternsMock } from '@/mocks/secondary';
import { useDogProfile } from '@/features/core/useDogProfile';
import {
  ConfidenceBandPill,
  PatternStateChip,
  SectionHeader,
  StackScreenHeader,
} from '@/features/secondary/components';

export default function PatternsScreen() {
  const router = useRouter();
  const { dog } = useDogProfile();
  const patterns = patternsMock.filter((p) => p.state !== 'ARCHIVED');

  return (
    <ScreenContainer scroll>
      <StackScreenHeader title="Pattern appresi" />
      <Text style={styles.intro}>
        Questi sono i comportamenti che sto imparando su {dog.name}. Ogni
        pattern nasce da eventi reali e dai tuoi feedback: puoi sempre
        verificarli.
      </Text>

      {patterns.length === 0 ? (
        <Card>
          <Text style={styles.emptyText}>
            Nessun pattern ancora. Continua ad analizzare i video di{' '}
            {dog.name}: quando vedrò comportamenti ripetuti, te li mostrerò
            qui.
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
                    {pattern.supportCount} osservazioni a supporto
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
                      {pattern.contradictCount} in contraddizione
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
          Un pattern diventa affidabile solo con evidenze ripetute e
          indipendenti. Le previsioni del modello da sole non bastano mai:
          contano anche i tuoi feedback e ciò che osserviamo dopo. Puoi
          contestare o archiviare qualsiasi pattern.
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

