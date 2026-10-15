/**
 * Skeleton di caricamento: blocco rounded con pulse morbido (Reanimated,
 * UI thread). Reduce-motion → statico. Le sagome imitano il contenuto.
 */
import React, { useEffect } from 'react';
import { StyleProp, View, ViewStyle } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { colors, radius } from '../theme/tokens';

export function Skeleton({
  width,
  height,
  borderRadius = radius.md,
  circle = false,
  style,
}: {
  width?: number | `${number}%`;
  height: number;
  borderRadius?: number;
  circle?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const reducedMotion = useReducedMotion();
  const pulse = useSharedValue(1);
  useEffect(() => {
    if (reducedMotion) return;
    pulse.value = withRepeat(
      withSequence(
        withTiming(0.45, { duration: 750, easing: Easing.inOut(Easing.sin) }),
        withTiming(1, { duration: 750, easing: Easing.inOut(Easing.sin) }),
      ),
      -1,
      true,
    );
  }, [reducedMotion, pulse]);
  const animatedStyle = useAnimatedStyle(() => ({ opacity: pulse.value }));
  return (
    <Animated.View
      accessible={false}
      style={[
        {
          width,
          height,
          borderRadius: circle ? height / 2 : borderRadius,
          backgroundColor: colors.surfaceMuted,
        },
        style,
        animatedStyle,
      ]}
    />
  );
}

/** Sagoma di una card lista (icona cerchio + due righe di testo). */
export function SkeletonCard({ style }: { style?: StyleProp<ViewStyle> }) {
  return (
    <View
      style={[
        {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 12,
          padding: 14,
          borderRadius: radius.lg,
          backgroundColor: colors.surface,
        },
        style,
      ]}
    >
      <Skeleton width={48} height={48} circle />
      <View style={{ flex: 1, gap: 8 }}>
        <Skeleton width="70%" height={14} />
        <Skeleton width="45%" height={11} />
      </View>
    </View>
  );
}
