import React from 'react';
import { StyleSheet, View, ViewStyle } from 'react-native';
import { colors, radius, spacing } from '../theme/tokens';

export interface ProgressBarProps {
  /** 0–1 */
  progress: number;
  /** Colore barra: default accent teal (mockup Home); 'primary' per profilo Rocky */
  tone?: 'accent' | 'primary';
  height?: number;
  style?: ViewStyle;
}

/** Progress bar (Knowledge Score "Quanto conosco Rocky") */
export function ProgressBar({
  progress,
  tone = 'accent',
  height = 8,
  style,
}: ProgressBarProps) {
  const clamped = Math.min(1, Math.max(0, progress));
  const fill = tone === 'accent' ? colors.accent : colors.primary;
  const percent = Math.round(clamped * 100);
  return (
    <View
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max: 100, now: percent }}
      accessibilityLabel={`Progresso ${percent} percento`}
      style={[styles.track, { height, borderRadius: height / 2 }, style]}
    >
      <View
        style={[
          styles.fill,
          {
            width: `${clamped * 100}%`,
            backgroundColor: fill,
            borderRadius: height / 2,
          },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    backgroundColor: colors.surfaceMuted,
    overflow: 'hidden',
    marginVertical: spacing.xs,
  },
  fill: {
    height: '100%',
  },
});

export default ProgressBar;
