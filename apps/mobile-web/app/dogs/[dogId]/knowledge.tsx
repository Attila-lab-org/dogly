/**
 * Dettaglio Knowledge Score — copertura per categoria, formula versionata.
 */
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { Card, ProgressBar, ScreenContainer } from '@/components';
import { colors, spacing, typography } from '@/theme/tokens';
import { useDogProfile } from '@/features/core/useDogProfile';
import { knowledgeLevelLabel } from '@/features/core/types';
import { StackScreenHeader } from '@/features/secondary/components';

export default function KnowledgeDetailScreen() {
  const { dogId } = useLocalSearchParams<{ dogId: string }>();
  const { dog, knowledgeScore } = useDogProfile();

  return (
    <ScreenContainer scroll>
      <StackScreenHeader title={`Quanto conosco ${dog.name}`} />
      <Text style={styles.meta}>Profilo {dogId} · formula knowledge/v0</Text>

      <View style={styles.hero}>
        <Text style={styles.score}>
          {knowledgeLevelLabel(knowledgeScore.score)}
        </Text>
        <Text style={styles.scoreCaption}>profilo personale</Text>
        <ProgressBar progress={knowledgeScore.score / 100} tone="primary" />
        <Text style={styles.summary}>
          Ho raccolto abbastanza osservazioni per riconoscere diverse abitudini
          di {dog.name}. Il punteggio non è una confidenza AI: misura quanto
          materiale utile abbiamo raccolto nel tempo.
        </Text>
      </View>

      <Card style={styles.card}>
        <Text style={styles.cardTitle}>Cosa fa crescere questo profilo</Text>
        <Text style={styles.cardStatus}>
          Analisi utilizzabili, contesti diversi e feedback coerenti. Non mostro
          coperture per categoria finché il server non fornisce quel dettaglio.
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
