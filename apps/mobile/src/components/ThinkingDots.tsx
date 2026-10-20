/**
 * Tre puntini che rimbalzano ("sta scrivendo"). Piccolo, riusabile
 * (chat Ask, hero). Reduce-motion → puntini statici.
 */
import React, { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { colors, radius } from '../theme/tokens';

function Dot({ index, reducedMotion }: { index: number; reducedMotion: boolean }) {
  const bounce = useSharedValue(0);
  useEffect(() => {
    if (reducedMotion) return;
    bounce.value = withDelay(
      index * 150,
      withRepeat(
        withSequence(
          withTiming(-4, { duration: 260, easing: Easing.out(Easing.quad) }),
          withTiming(0, { duration: 260, easing: Easing.in(Easing.quad) }),
        ),
        -1,
        false,
      ),
    );
  }, [index, reducedMotion, bounce]);
  const style = useAnimatedStyle(() => ({
    transform: [{ translateY: bounce.value }],
  }));
  return <Animated.View style={[styles.dot, style]} />;
}

export function ThinkingDots() {
  const reducedMotion = useReducedMotion();
  return (
    <View style={styles.wrap} accessibilityLabel="Sta scrivendo">
      {[0, 1, 2].map((index) => (
        <Dot key={index} index={index} reducedMotion={reducedMotion} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', gap: 5, alignItems: 'center' },
  dot: {
    width: 7,
    height: 7,
    borderRadius: radius.full,
    backgroundColor: colors.iconMuted,
  },
});
