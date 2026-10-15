import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  ViewStyle,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated from 'react-native-reanimated';
import { colors, gradients, radius, spacing, typography } from '../theme/tokens';
import { usePressSpring } from './pressSpring';

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
  const press = usePressSpring();

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

  const springHandlers = {
    onPressIn: press.onPressIn,
    onPressOut: press.onPressOut,
  };

  if (variant === 'primary') {
    return (
      <Animated.View style={[press.style, style]}>
        <Pressable
          accessibilityRole="button"
          onPress={onPress}
          disabled={isDisabled}
          testID={testID}
          {...springHandlers}
          style={({ pressed }) => [
            styles.base,
            pressed && !isDisabled && styles.pressedPrimary,
            isDisabled && styles.disabled,
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
      </Animated.View>
    );
  }

  return (
    <Animated.View style={[press.style, style]}>
      <Pressable
        accessibilityRole="button"
        onPress={onPress}
        disabled={isDisabled}
        testID={testID}
        {...springHandlers}
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
        ]}
      >
        {content}
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: radius.md,
    overflow: 'hidden',
  },
  gradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.xl,
  },
  inner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.lg,
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
    color: colors.accent,
  },
  pressedPrimary: {
    opacity: 0.9,
  },
  secondary: {
    backgroundColor: colors.accent,
  },
  secondaryPressed: {
    backgroundColor: colors.accentPressed,
  },
  outline: {
    backgroundColor: 'transparent',
    borderWidth: 1.5,
    borderColor: colors.accent,
  },
  outlinePressed: {
    backgroundColor: colors.accentSoft,
  },
  danger: {
    backgroundColor: colors.danger,
  },
  dangerPressed: {
    backgroundColor: colors.dangerPressed,
  },
  disabled: {
    opacity: 0.5,
  },
});

export default Button;
