/**
 * Il profilo personale di DOGly: quanto sta imparando a conoscere questo cane.
 */
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Card, ProgressBar, ScreenContainer } from '@/components';
import { colors, spacing, typography } from '@/theme/tokens';
import { useDogProfile } from '@/features/core/useDogProfile';
import { knowledgeLevelLabel } from '@/features/core/types';
import { StackScreenHeader } from '@/features/secondary/components';

export default function KnowledgeDetailScreen() {
  const { dog, knowledgeScore } = useDogProfile();

  return (
    <ScreenContainer scroll>
      <StackScreenHeader title={`Quanto conosco ${dog.name}`} />
      <Text style={styles.meta}>
        Il profilo di {dog.name} cresce con ogni momento che condividete
      </Text>

      <View style={styles.hero}>
        <Text style={styles.score}>
          {knowledgeLevelLabel(knowledgeScore.score)}
        </Text>
        <Text style={styles.scoreCaption}>profilo personale</Text>
        <ProgressBar progress={knowledgeScore.score / 100} tone="primary" />
        <Text style={styles.summary}>
          Ogni video e ogni tua conferma mi aiutano a riconoscere meglio i suoi
          segnali. Anche all’inizio posso già aiutarti: col tempo la lettura
          diventa sempre più personale.
        </Text>
      </View>

      <Card style={styles.card}>
        <Text style={styles.cardTitle}>Come imparo a conoscerlo</Text>
        <Text style={styles.cardStatus}>
          Momenti diversi, contesti reali e quello che mi confermi quando ti
          riconosci nella lettura. Non devi creare situazioni apposta.
        </Text>
      </Card>

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
  meta: {
    fontSize: typography.size.xs,
    color: colors.textMuted,
    marginBottom: spacing.lg,
  },
  hero: {
    alignItems: 'center',
    marginBottom: spacing.xl,
    gap: spacing.xs,
  },
  score: {
    fontSize: typography.size.display,
    fontWeight: typography.weight.bold,
    color: colors.text,
  },
  scoreCaption: {
    fontSize: typography.size.sm,
    color: colors.textSecondary,
  },
  summary: {
    marginTop: spacing.md,
    textAlign: 'center',
    fontSize: typography.size.sm,
    color: colors.textSecondary,
    lineHeight: typography.size.sm * typography.lineHeight.relaxed,
  },
  card: {
    marginBottom: spacing.sm,
  },
  cardTitle: {
    fontSize: typography.size.md,
    fontWeight: typography.weight.semibold,
    color: colors.text,
  },
  cardStatus: {
    fontSize: typography.size.xs,
    color: colors.textSecondary,
  },
  banner: {
    marginTop: spacing.lg,
    backgroundColor: colors.accentSoft,
    borderRadius: 16,
    padding: spacing.md,
  },
  bannerText: {
    fontSize: typography.size.sm,
    color: colors.accentPressed,
    lineHeight: typography.size.sm * typography.lineHeight.relaxed,
  },
});
