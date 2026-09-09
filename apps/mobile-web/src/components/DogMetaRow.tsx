import React from 'react';
import { StyleSheet, Text, View, ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, typography } from '../theme/tokens';

export type DogMetaRowProps = {
  ageLabel: string;
  sizeLabel: string;
  breedLabel: string | null;
  style?: ViewStyle;
};

/**
 * Riga meta condivisa (età · taglia · razza) usata in Home e Profilo.
 */
export function DogMetaRow({
  ageLabel,
  sizeLabel,
  breedLabel,
  style,
}: DogMetaRowProps) {
  const items: Array<{ icon: keyof typeof Ionicons.glyphMap; label: string }> = [
    { icon: 'calendar-outline', label: ageLabel },
    { icon: 'resize-outline', label: sizeLabel },
  ];
  if (breedLabel) {
    items.push({ icon: 'paw-outline', label: breedLabel });
  }

  return (
    <View style={[styles.row, style]} accessibilityRole="text">
      {items.map((item) => (
        <View key={item.label} style={styles.item}>
          <Ionicons name={item.icon} size={14} color={colors.accent} />
          <Text style={styles.label}>{item.label}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  label: {
    fontSize: typography.size.sm,
    color: colors.textSecondary,
  },
});
