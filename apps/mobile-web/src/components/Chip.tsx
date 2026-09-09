import React from 'react';
import { StyleSheet, Text, View, ViewStyle } from 'react-native';
import { colors, radius, spacing, typography } from '../theme/tokens';

export type ChipTone = 'neutral' | 'accent' | 'primary' | 'success' | 'warning' | 'danger';

export interface ChipProps {
  label: string;
  tone?: ChipTone;
  icon?: React.ReactNode;
  style?: ViewStyle;
}

const toneStyles: Record<ChipTone, { bg: string; fg: string }> = {
  neutral: { bg: colors.surfaceMuted, fg: colors.textSecondary },
  accent: { bg: colors.tealSoft, fg: colors.teal },
  primary: { bg: colors.lavenderSoft, fg: '#4F46E5' },
  success: { bg: colors.tealSoft, fg: colors.teal },
  warning: { bg: colors.coralSoft, fg: '#EA580C' },
  danger: { bg: colors.coralSoft, fg: colors.coral },
};

/** Chip/pill colorata (es. "Stati frequenti", pill confidenza) */
export function Chip({ label, tone = 'neutral', icon, style }: ChipProps) {
  const { bg, fg } = toneStyles[tone];
  return (
    <View style={[styles.chip, { backgroundColor: bg }, style]}>
      {icon}
      <Text style={[styles.label, { color: fg }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    borderRadius: radius.full,
    paddingVertical: spacing.xs + 2,
    paddingHorizontal: spacing.md,
    alignSelf: 'flex-start',
  },
  label: {
    fontSize: typography.size.sm,
    fontWeight: typography.weight.medium,
  },
});

export default Chip;
