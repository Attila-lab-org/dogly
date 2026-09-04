import React from 'react';
import { StyleSheet, View, ViewProps, ViewStyle } from 'react-native';
import { colors, radius, shadows, spacing } from '../theme/tokens';

export interface CardProps extends ViewProps {
  /** Rimuove il padding interno (es. card media full-bleed) */
  noPadding?: boolean;
  style?: ViewStyle | ViewStyle[];
  children?: React.ReactNode;
}

/** Card bianca: radius grande + ombra morbida (design language vincolante) */
export function Card({ noPadding, style, children, ...rest }: CardProps) {
  return (
    <View
      style={[styles.card, !noPadding && styles.padding, style]}
      {...rest}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    ...shadows.card,
  },
  padding: {
    padding: spacing.lg,
  },
});

export default Card;
