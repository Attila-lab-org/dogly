import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Button, Card, ProgressBar, ScreenContainer } from '@/components';
import { useDogProfile } from '@/features/core/useDogProfile';
import { StackScreenHeader } from '@/features/secondary/components';
import {
  metaForCategory,
  nextSignalExperiment,
  useSignalMap,
} from '@/features/signals/store';
import { SIGNAL_HOME_SUBTITLE, SIGNAL_HOME_TITLE } from '@/features/signals/copy';
import type { SignalMapEntry, SignalMapState } from '@/features/signals/types';
import { colors, radius, shadows, spacing, typography } from '@/theme/tokens';

const stateLabel: Record<SignalMapState, string> = {
  DISCOVERING: 'Da scoprire',
  LEARNING: 'Sto imparando',
  RECURRING: 'Ricorrente',
};

export default function SignalsMapScreen() {
  const router = useRouter();
  const { dog } = useDogProfile();
  const entries = useSignalMap(dog.id);
  const next = nextSignalExperiment(dog.id);

  return (
    <ScreenContainer scroll>
      <StackScreenHeader title="Dogly Signals" />

      <View style={styles.hero}>
        <View style={styles.heroIcon}>
          <Ionicons name="radio-outline" size={30} color={colors.primary} />
        </View>
        <Text style={styles.eyebrow}>IL MONDO SONORO DI {dog.name.toUpperCase()}</Text>
        <Text style={styles.title}>{SIGNAL_HOME_TITLE}</Text>
        <Text style={styles.subtitle}>{SIGNAL_HOME_SUBTITLE}</Text>
      </View>

      <Button
        title={`Prova ${next.title.toLowerCase()}`}
        icon={<Ionicons name={next.icon} size={19} color={colors.textOnPrimary} />}
        onPress={() => router.push('/signals/experiment' as never)}
        style={styles.primaryAction}
      />

      <Text style={styles.sectionTitle}>Mappa personale</Text>
      <View style={styles.grid}>
        {entries.map((entry) => (
          <SignalMapCard key={entry.category} entry={entry} dogName={dog.name} />
        ))}
      </View>

      <Card style={styles.guardrail}>
        <Ionicons name="shield-checkmark-outline" size={22} color={colors.accent} />
        <Text style={styles.guardrailText}>
          Dogly osserva reazioni visibili. Non traduce parole e non promette
          comandi: costruisce una mappa personale di {dog.name}.
        </Text>
      </Card>
    </ScreenContainer>
  );
}

function SignalMapCard({ entry, dogName }: { entry: SignalMapEntry; dogName: string }) {
  const meta = metaForCategory(entry.category);
  const progress = Math.min(1, entry.confirmCount / 3);
  const caption =
    entry.lastSummary ??
    (entry.category === 'CURIOSITY'
      ? 'Abbiamo ancora pochi tentativi.'
      : `${dogName} non ha ancora abbastanza segnali qui.`);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${meta.title}: ${stateLabel[entry.state]}`}
      style={({ pressed }) => [styles.mapCard, pressed && styles.pressed]}
    >
      <View style={styles.cardTop}>
        <View style={styles.categoryIcon}>
          <Ionicons name={meta.icon} size={21} color={colors.primary} />
        </View>
        <Text style={styles.state}>{stateLabel[entry.state]}</Text>
      </View>
      <Text style={styles.cardTitle}>{meta.shortTitle}</Text>
      <Text style={styles.cardText}>{caption}</Text>
      <ProgressBar progress={progress} tone="accent" style={styles.progress} />
      <Text style={styles.count}>
        {entry.attemptCount === 1
          ? '1 tentativo'
          : `${entry.attemptCount} tentativi`}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  hero: {
    alignItems: 'center',
    padding: spacing.xl,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    ...shadows.card,
  },
  heroIcon: {
    width: 62,
    height: 62,
    borderRadius: 31,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primarySoft,
    marginBottom: spacing.md,
  },
  eyebrow: {
    color: colors.accent,
    fontSize: typography.size.xs,
    fontWeight: typography.weight.bold,
    letterSpacing: 1.2,
    textAlign: 'center',
  },
  title: {
    marginTop: spacing.xs,
    color: colors.text,
    fontSize: typography.size.xxl,
    fontWeight: typography.weight.bold,
    textAlign: 'center',
    lineHeight: typography.size.xxl * typography.lineHeight.tight,
  },
  subtitle: {
    marginTop: spacing.sm,
    color: colors.textSecondary,
    fontSize: typography.size.md,
    textAlign: 'center',
    lineHeight: typography.size.md * typography.lineHeight.normal,
  },
  primaryAction: {
    marginTop: spacing.lg,
    marginBottom: spacing.xxl,
  },
  sectionTitle: {
    marginBottom: spacing.md,
    color: colors.text,
    fontSize: typography.size.lg,
    fontWeight: typography.weight.bold,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
    marginBottom: spacing.xl,
  },
  mapCard: {
    flexGrow: 1,
    flexBasis: '46%',
    minHeight: 178,
    padding: spacing.lg,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    ...shadows.card,
  },
  pressed: {
    opacity: 0.75,
  },
  cardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  categoryIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primarySoft,
  },
  state: {
    color: colors.textMuted,
    fontSize: typography.size.xs,
    fontWeight: typography.weight.semibold,
  },
  cardTitle: {
    color: colors.text,
    fontSize: typography.size.lg,
    fontWeight: typography.weight.bold,
  },
  cardText: {
    flex: 1,
    marginTop: spacing.xs,
    color: colors.textSecondary,
    fontSize: typography.size.sm,
    lineHeight: typography.size.sm * typography.lineHeight.normal,
  },
  progress: {
    marginTop: spacing.md,
  },
  count: {
    marginTop: spacing.xs,
    color: colors.textMuted,
    fontSize: typography.size.xs,
  },
  guardrail: {
    flexDirection: 'row',
    gap: spacing.md,
    backgroundColor: colors.accentSoft,
  },
  guardrailText: {
    flex: 1,
    color: colors.text,
    fontSize: typography.size.sm,
    lineHeight: typography.size.sm * typography.lineHeight.normal,
  },
});
