import React, { useEffect, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  Animated,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { CuteIcon } from '../../components';
import type { BehaviorEventStatus } from '../../contracts/types';
import { colors, radius, spacing, typography } from '../../theme/tokens';

export function ProcessingCompanion({
  dogName,
  status,
  finishing,
}: {
  dogName: string;
  status: BehaviorEventStatus;
  finishing: boolean;
}) {
  const pulse = useRef(new Animated.Value(0)).current;
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    void AccessibilityInfo.isReduceMotionEnabled().then(setReduceMotion);
    const subscription = AccessibilityInfo.addEventListener(
      'reduceMotionChanged',
      setReduceMotion,
    );
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    if (reduceMotion || finishing) {
      pulse.stopAnimation();
      pulse.setValue(0);
      return;
    }
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: 1100,
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0,
          duration: 1100,
          useNativeDriver: true,
        }),
      ]),
    );
    animation.start();
    return () => animation.stop();
  }, [finishing, pulse, reduceMotion]);

  const title =
    status === 'FAILED_RETRYABLE'
      ? 'Ci riprovo…'
      : `Analizzando ${dogName}…`;

  const ringScale = pulse.interpolate({
    inputRange: [0, 1],
    outputRange: [0.9, 1.12],
  });
  const ringOpacity = pulse.interpolate({
    inputRange: [0, 1],
    outputRange: [0.4, 0.1],
  });
  const glow = pulse.interpolate({
    inputRange: [0, 1],
    outputRange: [0.18, 0.72],
  });
  const glowShift = pulse.interpolate({
    inputRange: [0, 1],
    outputRange: [-22, 22],
  });
  const dotA = pulse.interpolate({
    inputRange: [0, 0.35, 1],
    outputRange: [0.28, 1, 0.28],
  });
  const dotB = pulse.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [0.28, 1, 0.28],
  });
  const dotC = pulse.interpolate({
    inputRange: [0, 0.7, 1],
    outputRange: [0.28, 1, 0.28],
  });

  return (
    <View
      style={styles.wrap}
      accessibilityLiveRegion="polite"
      accessibilityLabel={title}
    >
      <View style={styles.visual}>
        {!reduceMotion && !finishing ? (
          <>
            <Animated.View
              style={[
                styles.ring,
                {
                  opacity: ringOpacity,
                  transform: [{ scale: ringScale }],
                },
              ]}
            />
            <Animated.View
              style={[
                styles.ring,
                styles.ringInner,
                {
                  opacity: ringOpacity,
                  transform: [{ scale: ringScale }],
                },
              ]}
            />
          </>
        ) : null}
        <View style={[styles.icon, finishing && styles.iconDone]}>
          <CuteIcon name={finishing ? 'play' : 'gaze'} size={40} />
        </View>
      </View>
      <View style={styles.statusRow}>
        <View style={styles.liveDot} />
        <Text style={styles.title}>{title}</Text>
      </View>
      <View style={styles.glowTrack} accessibilityElementsHidden>
        <Animated.View
          style={[
            styles.glowFill,
            {
              opacity: reduceMotion || finishing ? 0.35 : glow,
              transform: [
                { translateX: reduceMotion || finishing ? 0 : glowShift },
              ],
            },
          ]}
        />
      </View>
      <View style={styles.dots} accessibilityElementsHidden>
        {[dotA, dotB, dotC].map((opacity, index) => (
          <Animated.View
            key={index}
            style={[
              styles.dot,
              { opacity: reduceMotion || finishing ? 0.45 : opacity },
            ]}
          />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    paddingTop: spacing.xl,
  },
  visual: {
    width: 108,
    height: 108,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  ring: {
    position: 'absolute',
    width: 104,
    height: 104,
    borderRadius: radius.full,
    borderWidth: 2,
    borderColor: colors.accent,
  },
  ringInner: {
    width: 82,
    height: 82,
    borderColor: colors.primary,
  },
  icon: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accentSoft,
  },
  iconDone: {
    backgroundColor: colors.primarySoft,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  liveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.accent,
  },
  title: {
    color: colors.text,
    fontSize: typography.size.md,
    fontWeight: typography.weight.semibold,
    textAlign: 'center',
  },
  glowTrack: {
    width: 96,
    height: 3,
    borderRadius: 2,
    overflow: 'hidden',
    backgroundColor: colors.surfaceMuted,
    marginTop: spacing.sm,
  },
  glowFill: {
    width: 42,
    height: 3,
    borderRadius: 2,
    backgroundColor: colors.accent,
    alignSelf: 'center',
  },
  dots: {
    flexDirection: 'row',
    gap: 6,
    marginTop: spacing.sm,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.accent,
  },
});
