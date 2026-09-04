import React from 'react';
import { StyleSheet, Text, View, ViewStyle } from 'react-native';
import { colors, spacing, typography } from '../theme/tokens';
import Button from './Button';

export interface ErrorStateProps {
  title?: string;
  message?: string;
  /** Label del bottone retry (default "Riprova") */
  retryLabel?: string;
  onRetry?: () => void;
  style?: ViewStyle;
}

/** Stato di errore con retry opzionale */
export function ErrorState({
  title = 'Qualcosa è andato storto',
  message,
  retryLabel = 'Riprova',
  onRetry,
  style,
}: ErrorStateProps) {
  return (
    <View style={[styles.container, style]}>
      <Text style={styles.title}>{title}</Text>
      {message ? <Text style={styles.message}>{message}</Text> : null}
      {onRetry ? (
        <Button title={retryLabel} onPress={onRetry} variant="outline" />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
    gap: spacing.md,
  },
  title: {
    fontSize: typography.size.lg,
    fontWeight: typography.weight.bold,
    color: colors.text,
    textAlign: 'center',
  },
  message: {
    fontSize: typography.size.md,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: typography.size.md * typography.lineHeight.normal,
  },
});

export default ErrorState;
