/**
 * Lista pattern personali (Spec V1 sez. 17.2 — GET /v1/dogs/{dog_id}/patterns).
 * Mostra solo pattern eligibili/visibili (mai ARCHIVED in questa lista),
 * con chip di stato, support count e reliability band (mai %).
 */
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { ErrorState, ScreenContainer } from '@/components';
import { colors, shadows, spacing, typography } from '@/theme/tokens';
import { useDogProfile } from '@/features/core/useDogProfile';
import { usePersonalPatterns } from '@/features/patterns/api';
import {
  ConfidenceBandPill,
  PatternStateChip,
  SectionHeader,
  StackScreenHeader,
} from '@/features/secondary/components';

type IconName = keyof typeof Ionicons.glyphMap;

function patternIcon(title: string): IconName {
  if (/porta|uscire|door|exit/i.test(title)) return 'exit-outline';
  if (/sera|notte|dorm|moon|attivo/i.test(title)) return 'moon-outline';
  if (/cibo|mangia|ciotola|food|bowl|pasto/i.test(title)) {
    return 'restaurant-outline';
  }
  if (/fattorino|campanello|estraneo|visita|abbaia/i.test(title)) {
    return 'notifications-outline';
  }
  return 'bulb-outline';
}

export default function PatternsScreen() {
  const router = useRouter();
  const { dog } = useDogProfile();
  const patternsQuery = usePersonalPatterns(dog.id);
  const patterns = patternsQuery.patterns.filter((p) => p.state !== 'ARCHIVED');

  return (
    <ScreenContainer scroll contentStyle={styles.content}>
      <StackScreenHeader title="Pattern appresi" />
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Nuovi pattern appresi</Text>
        <Ionicons name="bulb-outline" size={20} color="#F59E0B" />
      </View>
      <Text style={styles.intro}>
        Questi sono i comportamenti che sto imparando su {dog.name}. Ogni
        pattern nasce da eventi reali e dai tuoi feedback.
      </Text>

      {patternsQuery.live && patternsQuery.isLoading ? (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyText}>Carico i pattern di {dog.name}…</Text>
        </View>
      ) : patternsQuery.live && patternsQuery.isError ? (
        <ErrorState
          title="Pattern non disponibili"
          message="Non riesco a caricarli. Controlla la connessione e riprova."
          onRetry={() => void patternsQuery.refetch()}
        />
      ) : patterns.length === 0 ? (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyText}>
            Nessun pattern ancora. Continua ad analizzare i video di{' '}
            {dog.name}: quando vedrò comportamenti ripetuti, te li mostrerò
            qui.
          </Text>
        </View>
      ) : (
        <View style={styles.listCard}>
          {patterns.map((pattern, index) => (
            <React.Fragment key={pattern.id}>
              {index > 0 ? <View style={styles.divider} /> : null}
              <Pressable
                accessibilityRole="button"
                onPress={() => router.push(`/patterns/${pattern.id}`)}
                style={({ pressed }) => [
                  styles.patternRow,
                  pressed && styles.patternPressed,
                ]}
              >
                <View style={styles.iconSquare}>
                  <Ionicons
                    name={patternIcon(pattern.title)}
                    size={18}
                    color="#0284C7"
                  />
                </View>
                <View style={styles.patternCopy}>
                  <Text style={styles.patternTitle} numberOfLines={2}>
                    {pattern.title}
                  </Text>
                  <View style={styles.chipsRow}>
                    <PatternStateChip state={pattern.state} />
                    <ConfidenceBandPill band={pattern.reliabilityBand} />
                  </View>
                  <Text style={styles.statText}>
                    {pattern.supportCount} osservazioni a supporto
                    {pattern.contradictCount > 0
                      ? ` · ${pattern.contradictCount} in contraddizione`
                      : ''}
                  </Text>
                </View>
                <Ionicons
                  name="chevron-forward"
                  size={18}
                  color="#94A3B8"
                />
              </Pressable>
            </React.Fragment>
          ))}
        </View>
      )}

      <SectionHeader title="Come funziona" />
      <View style={styles.howCard}>
        <Text style={styles.howText}>
          Un pattern diventa affidabile solo con evidenze ripetute e
          indipendenti. Le previsioni del modello da sole non bastano mai:
          contano anche i tuoi feedback e ciò che osserviamo dopo. Puoi
          contestare o archiviare qualsiasi pattern.
        </Text>
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingBottom: spacing.xxxl,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.xs,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: typography.weight.bold,
    color: '#1A2B48',
  },
  intro: {
    fontSize: typography.size.sm,
    color: colors.textSecondary,
    lineHeight: typography.size.sm * typography.lineHeight.relaxed,
    marginBottom: spacing.lg,
  },
  emptyCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#EDF2F7',
    padding: spacing.lg,
    ...shadows.card,
  },
  emptyText: {
    fontSize: typography.size.sm,
    color: colors.textSecondary,
    lineHeight: typography.size.sm * typography.lineHeight.relaxed,
  },
  listCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#EDF2F7',
    overflow: 'hidden',
    marginBottom: spacing.lg,
    ...shadows.card,
  },
  divider: {
    height: 1,
    backgroundColor: '#F1F5F9',
    marginLeft: 68,
  },
  patternRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: 14,
  },
  patternPressed: {
    backgroundColor: '#F8FAFC',
  },
  iconSquare: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: '#E0F2FE',
    alignItems: 'center',
    justifyContent: 'center',
  },
  patternCopy: {
    flex: 1,
    gap: 6,
  },
  patternTitle: {
    fontSize: 15,
    fontWeight: typography.weight.bold,
    color: '#1A2B48',
  },
  chipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  statText: {
    fontSize: typography.size.xs,
    color: colors.textSecondary,
  },
  howCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#EDF2F7',
    padding: spacing.lg,
    ...shadows.card,
  },
  howText: {
    fontSize: typography.size.sm,
    color: colors.textSecondary,
    lineHeight: typography.size.sm * typography.lineHeight.relaxed,
  },
});
