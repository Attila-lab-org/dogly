import React from 'react';
import { StyleSheet, Text, View, ViewStyle } from 'react-native';
import { colors, spacing, typography } from '../theme/tokens';

export type SectionHeaderProps = {
  title: string;
  /** Icona a sinistra (core) o a destra (profilo) in base a `iconPosition`. */
  icon?: React.ReactNode;
  iconPosition?: 'left' | 'right';
  trailing?: React.ReactNode;
  style?: ViewStyle;
};

/**
 * Header di sezione unico per Home, Diario, Profilo e flussi secondari.
 */
export function SectionHeader({
  title,
  icon,
  iconPosition = 'left',
  trailing,
  style,
}: SectionHeaderProps) {
  const trailingNode = trailing ?? (iconPosition === 'right' ? icon : null);
  const leadingNode = iconPosition === 'left' ? icon : null;

  return (
    <View style={[styles.row, style]}>
      <View style={styles.leading}>
        {leadingNode}
        <Text style={styles.title}>{title}</Text>
      </View>
      {trailingNode}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
    gap: spacing.sm,
  },
  leading: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    flex: 1,
  },
  title: {
    fontSize: typography.size.lg,
    fontWeight: typography.weight.bold,
    color: colors.text,
  },
});
