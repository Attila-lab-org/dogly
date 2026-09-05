/**
 * Dettaglio Knowledge Score — copertura per categoria, formula versionata.
 */
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { Card, ProgressBar, ScreenContainer } from '@/components';
import { colors, spacing, typography } from '@/theme/tokens';
import { useDogProfile } from '@/features/core/useDogProfile';
import { StackScreenHeader } from '@/features/secondary/components';

const CATEGORIES = [
  { key: 'home', title: 'Routine di casa', coverage: 0.9, status: 'Ottima copertura' },
  { key: 'play', title: 'Gioco', coverage: 0.8, status: 'Buona copertura' },
  { key: 'walk', title: 'Passeggiata', coverage: 0.45, status: 'Sto ancora imparando' },
  { key: 'day', title: 'Momenti della giornata', coverage: 0.75, status: 'Buona copertura' },
] as const;

export default function KnowledgeDetailScreen() {
  const { dogId } = useLocalSearchParams<{ dogId: string }>();
  const { dog, knowledgeScore } = useDogProfile();

  return (
    <ScreenContainer scroll>
      <StackScreenHeader title={`Quanto conosco ${dog.name}`} />
      <Text style={styles.meta}>Profilo {dogId} · formula knowledge/v0</Text>

      <View style={styles.hero}>
        <Text style={styles.score}>{knowledgeScore.score}%</Text>
        <Text style={styles.scoreCaption}>profilo personale</Text>
        <ProgressBar progress={knowledgeScore.score / 100} tone="primary" />
        <Text style={styles.summary}>
          Ho raccolto abbastanza osservazioni per riconoscere diverse abitudini
          di {dog.name}. Il punteggio non è una confidenza AI: misura quanto
          materiale utile abbiamo raccolto nel tempo.
        </Text>
      </View>

      {CATEGORIES.map((cat) => (
        <Card key={cat.key} style={styles.card}>
          <View style={styles.cardRow}>
            <View style={styles.cardText}>
              <Text style={styles.cardTitle}>{cat.title}</Text>
              <Text style={styles.cardStatus}>{cat.status}</Text>
            </View>
            <ProgressBar
              progress={cat.coverage}
              tone="accent"
              style={styles.miniBar}
            />
          </View>
        </Card>
      ))}

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
  cardRow: {
    gap: spacing.sm,
  },
  cardText: {
    gap: 2,
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
  miniBar: {
    marginTop: spacing.xs,
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
