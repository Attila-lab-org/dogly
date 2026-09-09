/**
 * Dettaglio Knowledge Score — copertura per categoria, formula versionata.
 */
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { ProgressBar, ScreenContainer } from '@/components';
import { colors, shadows, spacing, typography } from '@/theme/tokens';
import { useDogProfile } from '@/features/core/useDogProfile';
import { knowledgeLevelLabel } from '@/features/core/types';
import { StackScreenHeader } from '@/features/secondary/components';

export default function KnowledgeDetailScreen() {
  const { dog, knowledgeScore } = useDogProfile();

  return (
    <ScreenContainer scroll contentStyle={styles.content}>
      <StackScreenHeader title={`Quanto conosco ${dog.name}`} />
      <Text style={styles.meta}>Profilo · formula knowledge/v0</Text>

      <View style={styles.hero}>
        <Text style={styles.score}>
          {knowledgeLevelLabel(knowledgeScore.score)}
        </Text>
        <View style={styles.levelPill}>
          <Text style={styles.levelPillText}>profilo personale</Text>
        </View>
        <ProgressBar
          progress={knowledgeScore.score / 100}
          tone="accent"
          height={10}
          style={styles.progress}
        />
        <Text style={styles.summary}>
          Ho raccolto abbastanza osservazioni per riconoscere diverse abitudini
          di {dog.name}. Il punteggio non è una confidenza AI: misura quanto
          materiale utile abbiamo raccolto nel tempo.
        </Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Cosa fa crescere questo profilo</Text>
        <Text style={styles.cardStatus}>
          Analisi utilizzabili, contesti diversi e feedback coerenti. Non mostro
          coperture per categoria finché il server non fornisce quel dettaglio.
        </Text>
        <View style={styles.chipRow}>
          <View style={styles.chip}>
            <Text style={styles.chipText}>Analisi</Text>
          </View>
          <View style={styles.chip}>
            <Text style={styles.chipText}>Feedback</Text>
          </View>
          <View style={styles.chip}>
            <Text style={styles.chipText}>Contesto</Text>
          </View>
        </View>
      </View>

      <View style={styles.banner}>
        <Text style={styles.bannerText}>
          Continua a usare l’app normalmente: non serve creare situazioni
          artificiali. I video delle analisi restano privati e si cancellano
          dopo 24 ore.
        </Text>
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingBottom: spacing.xxxl,
  },
  meta: {
    fontSize: typography.size.xs,
    color: colors.textMuted,
    marginBottom: spacing.lg,
    textAlign: 'center',
  },
  hero: {
    alignItems: 'center',
    marginBottom: spacing.xl,
    gap: spacing.sm,
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#EDF2F7',
    padding: spacing.xl,
    ...shadows.card,
  },
  score: {
    fontSize: typography.size.display,
    fontWeight: typography.weight.bold,
    color: '#1A2B48',
  },
  levelPill: {
    backgroundColor: colors.tealSoft,
    borderRadius: 9999,
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  levelPillText: {
    fontSize: 12,
    fontWeight: typography.weight.semibold,
    color: colors.teal,
  },
  progress: {
    alignSelf: 'stretch',
    marginTop: spacing.sm,
  },
  summary: {
    marginTop: spacing.sm,
    textAlign: 'center',
    fontSize: typography.size.sm,
    color: colors.textSecondary,
    lineHeight: typography.size.sm * typography.lineHeight.relaxed,
  },
  card: {
    marginBottom: spacing.sm,
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#EDF2F7',
    padding: spacing.lg,
    gap: spacing.sm,
    ...shadows.card,
  },
  cardTitle: {
    fontSize: typography.size.md,
    fontWeight: typography.weight.semibold,
    color: '#1A2B48',
  },
  cardStatus: {
    fontSize: typography.size.sm,
    color: colors.textSecondary,
    lineHeight: typography.size.sm * typography.lineHeight.relaxed,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  chip: {
    backgroundColor: '#F1F5F9',
    borderRadius: 9999,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  chipText: {
    fontSize: 13,
    fontWeight: typography.weight.medium,
    color: colors.textSecondary,
  },
  banner: {
    marginTop: spacing.lg,
    backgroundColor: colors.tealSoft,
    borderRadius: 20,
    padding: spacing.lg,
  },
  bannerText: {
    fontSize: typography.size.sm,
    color: colors.teal,
    lineHeight: typography.size.sm * typography.lineHeight.relaxed,
  },
});
