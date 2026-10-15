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

export function usePressSpring(scaleTo = 0.97) {
  const reducedMotion = useReducedMotion();
  const scale = useSharedValue(1);
  const opacity = useSharedValue(1);
  const style = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: opacity.value,
  }));
  const onPressIn = () => {
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
