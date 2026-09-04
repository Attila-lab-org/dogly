import React from 'react';
import { StyleSheet, Text } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { colors, spacing, typography } from '../theme/tokens';
import ScreenContainer from './ScreenContainer';

export interface PlaceholderScreenProps {
  /** Titolo della schermata (italiano) */
  title: string;
  /** Sottotitolo opzionale */
  subtitle?: string;
}

/**
 * Placeholder minimale per le route della route map (Spec V1 sez. 5.2)
 * in attesa dell'implementazione dei workstream di contenuto (F/G/H/I).
 * Rende ScreenContainer + titolo + "In costruzione".
 */
export function PlaceholderScreen({ title, subtitle }: PlaceholderScreenProps) {
  const params = useLocalSearchParams();
  const hasParams = Object.keys(params).length > 0;
  return (
    <ScreenContainer contentStyle={styles.center}>
      <Text style={styles.title}>{title}</Text>
      {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      <Text style={styles.wip}>In costruzione</Text>
      {hasParams ? (
        <Text style={styles.params}>
          {Object.entries(params)
            .map(([k, v]) => `${k}: ${String(v)}`)
            .join('\n')}
        </Text>
      ) : null}
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  title: {
    fontSize: typography.size.xxl,
    fontWeight: typography.weight.bold,
    color: colors.text,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: typography.size.md,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  wip: {
    marginTop: spacing.lg,
    fontSize: typography.size.sm,
    fontWeight: typography.weight.medium,
    color: colors.accent,
  },
  params: {
    marginTop: spacing.sm,
    fontSize: typography.size.xs,
    color: colors.textMuted,
    textAlign: 'center',
  },
});

export default PlaceholderScreen;
