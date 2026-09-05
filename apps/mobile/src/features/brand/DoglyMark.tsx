/**
 * Marchio Dogly — solo splash / app icon / welcome auth.
 * Non usare in Home, check-in o risultato.
 */
import React, { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';
import Animated, {
  Easing,
  useAnimatedProps,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { colors, spacing, typography } from '../../theme/tokens';

const AnimatedPath = Animated.createAnimatedComponent(Path);

type MarkTone = 'onLight' | 'onDark' | 'inverse';

export function DoglyMark({
  size = 120,
  tone = 'onLight',
  wag = true,
  showWordmark = false,
}: {
  size?: number;
  tone?: MarkTone;
  wag?: boolean;
  showWordmark?: boolean;
}) {
  const fill = tone === 'inverse' ? colors.textOnPrimary : colors.text;
  const counter = tone === 'inverse' ? colors.text : colors.background;
  const bark = colors.accent;
  const wordColor =
    tone === 'onDark' || tone === 'inverse'
      ? colors.textOnPrimary
      : colors.text;

  const phase = useSharedValue(0);
  useEffect(() => {
    if (!wag) return;
    phase.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 320, easing: Easing.inOut(Easing.sin) }),
        withTiming(0, { duration: 320, easing: Easing.inOut(Easing.sin) }),
      ),
      -1,
      false,
    );
  }, [wag, phase]);

  const bark1 = useAnimatedProps(() => ({
    opacity: 0.55 + phase.value * 0.45,
    strokeWidth: 5.5 + phase.value * 1.2,
  }));
  const bark2 = useAnimatedProps(() => ({
    opacity: 0.32 + phase.value * 0.45,
    strokeWidth: 4.5 + phase.value * 1.6,
  }));

  const h = size;
  const w = size * 1.38;

  return (
    <View style={styles.wrap} accessibilityRole="image" accessibilityLabel="Dogly">
      <Svg width={w} height={h} viewBox="0 0 138 100">
        <Path
          d="M14 10 H54 C82 10 102 28 102 50 C102 72 82 90 54 90 H14 Z M36 28 V72 H54 C70 72 80 63 80 50 C80 37 70 28 54 28 Z"
          fill={fill}
        />
        <Path
          d="M50 36 C54 24 66 22 70 32 C74 28 82 32 80 42 C84 48 82 60 72 64 C64 68 56 62 54 54 C50 50 48 42 50 36 Z"
          fill={counter}
        />
        <Circle cx="72" cy="44" r="2.4" fill={fill} />
        <AnimatedPath
          animatedProps={bark1}
          d="M110 20 C122 34 122 48 110 60"
          stroke={bark}
          fill="none"
          strokeLinecap="round"
        />
        <AnimatedPath
          animatedProps={bark2}
          d="M120 16 C136 34 136 54 120 70"
          stroke={bark}
          fill="none"
          strokeLinecap="round"
        />
        <Circle cx="115" cy="80" r="6.5" fill={bark} />
      </Svg>
      {showWordmark ? (
        <Text style={[styles.wordmark, { color: wordColor }]}>DOGLY</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
  },
  wordmark: {
    marginTop: spacing.sm,
    fontSize: typography.size.lg,
    fontWeight: typography.weight.bold,
    letterSpacing: 3,
  },
});
