import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  ViewStyle,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, gradients, radius, spacing, typography } from '../theme/tokens';

export type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'danger';

export interface ButtonProps {
  title: string;
  onPress?: () => void;
  variant?: ButtonVariant;
  disabled?: boolean;
  loading?: boolean;
  /** Icona opzionale a sinistra del testo (es. Ionicons) */
  icon?: React.ReactNode;
  style?: ViewStyle;
  testID?: string;
}

/**
 * Bottone condiviso.
 * - primary: gradiente blu→azzurro (CTA dominante, es. "Sì, è così")
 * - secondary: teal pieno
 * - outline: bordo teal, testo teal (es. "Salva nel diario")
 * - danger: rosso/corallo pieno (es. "Non credo")
 */
export function Button({
  title,
  onPress,
  variant = 'primary',
  disabled,
  loading,
  icon,
  style,
  testID,
}: ButtonProps) {
  const isDisabled = disabled || loading;

  const content = (
    <>
      {loading ? (
        <>
          <ActivityIndicator
            color={variant === 'outline' ? colors.accent : colors.textOnPrimary}
          />
          <Text
            style={[
              styles.label,
              variant === 'outline' ? styles.labelOutline : styles.labelFilled,
            ]}
          >
            {title}
          </Text>
        </>
      ) : (
        <>
          {icon}
          <Text
            style={[
              styles.label,
              variant === 'outline' ? styles.labelOutline : styles.labelFilled,
            ]}
          >
            {title}
          </Text>
        </>
      )}
    </>
  );

  if (variant === 'primary') {
    return (
      <Pressable
        accessibilityRole="button"
        onPress={onPress}
        disabled={isDisabled}
        testID={testID}
        style={({ pressed }) => [
          styles.base,
          pressed && !isDisabled && styles.pressedPrimary,
          isDisabled && styles.disabled,
          style,
        ]}
      >
        <LinearGradient
          colors={[...gradients.cta]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.gradient}
        >
          {content}
        </LinearGradient>
      </Pressable>
    );
  }

  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={isDisabled}
      testID={testID}
      style={({ pressed }) => [
        styles.base,
        styles.inner,
        variant === 'secondary' && styles.secondary,
        variant === 'secondary' && pressed && !isDisabled && styles.secondaryPressed,
        variant === 'outline' && styles.outline,
        variant === 'outline' && pressed && !isDisabled && styles.outlinePressed,
        variant === 'danger' && styles.danger,
        variant === 'danger' && pressed && !isDisabled && styles.dangerPressed,
        isDisabled && styles.disabled,
        style,
      ]}
    >
      {content}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: radius.full,
    overflow: 'hidden',
  },
  gradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: 14,
    paddingHorizontal: spacing.xl,
  },
  inner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: 14,
    paddingHorizontal: spacing.xl,
  },
  label: {
    fontSize: typography.size.md,
    fontWeight: typography.weight.semibold,
  },
  labelFilled: {
    color: colors.textOnPrimary,
  },
  labelOutline: {
    color: colors.teal,
  },
  pressedPrimary: {
    opacity: 0.9,
    transform: [{ scale: 0.98 }],
  },
  secondary: {
    backgroundColor: colors.teal,
  },
  secondaryPressed: {
    backgroundColor: '#269394',
    transform: [{ scale: 0.98 }],
  },
  outline: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: colors.teal,
  },
  outlinePressed: {
    backgroundColor: colors.tealSoft,
  },
  danger: {
    backgroundColor: colors.coral,
  },
  dangerPressed: {
    backgroundColor: '#E5735D',
    transform: [{ scale: 0.98 }],
  },
  disabled: {
    opacity: 0.5,
  },
});

export default Button;
