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
  accent: { bg: colors.accentSoft, fg: colors.accentPressed },
  primary: { bg: colors.primarySoft, fg: colors.primary },
  success: { bg: colors.successSoft, fg: colors.success },
  warning: { bg: colors.warningSoft, fg: colors.warning },
  danger: { bg: colors.dangerSoft, fg: colors.danger },
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
