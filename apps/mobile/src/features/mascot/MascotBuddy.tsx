/**
 * MascotBuddy — la mascotte di Dogly: il cucciolo del mockup originale
 * (asset PNG approvato) animato via coreografie Reanimated. L'arte è una
 * sola; le "espressioni" sono movimento: bounce happy, saltino+confetti
 * celebrate, tilt sad, lean focused, respiro neutral. Reduce-motion → statica.
 */
import React, { useEffect } from 'react';
import { Image, StyleSheet, View } from 'react-native';
import Svg, { Circle, Ellipse, Path, Rect } from 'react-native-svg';
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { colors } from '../../theme/tokens';

export type BuddyExpression =
  | 'happy'
  | 'focused'
  | 'celebrate'
  | 'sad'
  | 'neutral';

const mascotSource = require('../../../assets/images/mascot-play.png');

/** Coriandoli per `celebrate`: appaiono attorno alla mascotte. */
function Confetti({ size }: { size: number }) {
  return (
    <Svg
      pointerEvents="none"
      style={StyleSheet.absoluteFill}
      viewBox="0 0 100 100"
    >
      <Rect x={8} y={16} width={5} height={5} rx={1.4} fill={colors.accent} transform="rotate(20 10 18)" />
      <Rect x={86} y={12} width={5} height={5} rx={1.4} fill="#F6C94C" transform="rotate(-18 88 14)" />
      <Circle cx={16} cy={8} r={2.4} fill="#FF8B74" />
      <Circle cx={92} cy={34} r={2.4} fill={colors.primary} />
      <Path d="M6 40 q3 -5 6 0" stroke={colors.accent} strokeWidth={2.4} strokeLinecap="round" fill="none" />
      <Path d="M90 24 q4 -5 7 -1" stroke="#F6C94C" strokeWidth={2.4} strokeLinecap="round" fill="none" />
    </Svg>
  );
}

export function MascotBuddy({
  expression = 'neutral',
  size = 96,
  animate = true,
}: {
  expression?: BuddyExpression;
  size?: number;
  animate?: boolean;
}) {
  const reducedMotion = useReducedMotion();
  const loop = useSharedValue(0);

  useEffect(() => {
    if (!animate || reducedMotion) return;
    loop.value = 0;
    switch (expression) {
      case 'happy':
        loop.value = withRepeat(
          withSequence(
            withTiming(1, { duration: 320, easing: Easing.out(Easing.quad) }),
            withTiming(0, { duration: 320, easing: Easing.in(Easing.quad) }),
          ),
          -1,
          true,
        );
        break;
      case 'celebrate':
        loop.value = withRepeat(
          withSequence(
            withTiming(1, { duration: 300, easing: Easing.out(Easing.quad) }),
            withTiming(0, { duration: 300, easing: Easing.in(Easing.quad) }),
          ),
          -1,
          true,
        );
        break;
      case 'neutral':
        loop.value = withRepeat(
          withSequence(
            withTiming(1, { duration: 1400, easing: Easing.inOut(Easing.sin) }),
            withTiming(0, { duration: 1400, easing: Easing.inOut(Easing.sin) }),
          ),
          -1,
          true,
        );
        break;
      default:
        break;
    }
    return () => {
      loop.value = 0;
    };
  }, [expression, animate, reducedMotion, loop]);

  const style = useAnimatedStyle(() => {
    const v = loop.value;
    switch (expression) {
      case 'happy':
        return {
          transform: [
            { scale: 1 + v * 0.06 },
            { translateY: -v * 6 },
          ],
        };
      case 'celebrate':
        return {
          transform: [
            { translateY: -v * 10 },
            { rotate: `${v * 16 - 8}deg` },
          ],
        };
      case 'sad':
        return {
          opacity: 0.75,
          transform: [{ rotate: '-10deg' }, { translateY: 6 }],
        };
      case 'focused':
        return {
          transform: [{ scale: 1.05 }, { rotate: '4deg' }],
        };
      default:
        return { transform: [{ scale: 1 + v * 0.02 }] };
    }
  }, [expression]);

  const showConfetti = expression === 'celebrate' && animate && !reducedMotion;

  return (
    <View
      style={{ width: size, height: size }}
      accessibilityLabel="Buddy, la mascotte di Dogly"
      accessibilityRole="image"
    >
      <Svg
        pointerEvents="none"
        style={[styles.shadow, { width: size * 0.7, height: size * 0.14, left: size * 0.15, bottom: 0 }]}
        viewBox="0 0 100 20"
      >
        <Ellipse cx={50} cy={10} rx={46} ry={9} fill={colors.text} opacity={0.1} />
      </Svg>
      {showConfetti ? <Confetti size={size} /> : null}
      <Animated.View style={[styles.fill, style]}>
        <Image
          source={mascotSource}
          style={{ width: size, height: size }}
          resizeMode="contain"
          accessibilityIgnoresInvertColors
        />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { width: '100%', height: '100%' },
  shadow: { position: 'absolute' },
});
