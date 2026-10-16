/**
 * Press spring condiviso: feedback fisico sui tap (scala 0.97 + leggera
 * opacity, rebound morbido). Reduce-motion → solo opacity, niente scala.
 */
import {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { hapticLight } from '../lib/haptics';

export function usePressSpring(scaleTo = 0.97) {
  const reducedMotion = useReducedMotion();
  const scale = useSharedValue(1);
  const opacity = useSharedValue(1);
  const style = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: opacity.value,
  }));
  const onPressIn = () => {
    void hapticLight();
    opacity.value = withTiming(0.9, { duration: 90 });
    if (!reducedMotion) {
      scale.value = withSpring(scaleTo, { damping: 12, stiffness: 260 });
    }
  };
  const onPressOut = () => {
    opacity.value = withTiming(1, { duration: 140 });
    if (!reducedMotion) {
      scale.value = withSpring(1, { damping: 10, stiffness: 220 });
    }
  };
  return { style, onPressIn, onPressOut };
}

import React from 'react';
import { Pressable, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';
import Animated from 'react-native-reanimated';

/**
 * Pressable con press spring incorporato — per elementi in lista/mappa dove
 * l'hook non può stare nel genitore. style si applica al wrapper animato;
 * pressableStyle al Pressable interno.
 */
export function SpringPress({
  children,
  style,
  pressableStyle,
  scaleTo,
  ...rest
}: PressableProps & {
  style?: StyleProp<ViewStyle>;
  pressableStyle?: PressableProps['style'];
  scaleTo?: number;
}) {
  const press = usePressSpring(scaleTo);
  return (
    <Animated.View style={[press.style, style]}>
      <Pressable
        {...rest}
        onPressIn={(event) => {
          press.onPressIn();
          rest.onPressIn?.(event);
        }}
        onPressOut={(event) => {
          press.onPressOut();
          rest.onPressOut?.(event);
        }}
        style={pressableStyle}
      >
        {children}
      </Pressable>
    </Animated.View>
  );
}
