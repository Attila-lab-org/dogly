import React, { useEffect, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  Animated,
  Platform,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { CuteIcon } from '../../components';
import type { BehaviorEventStatus } from '../../contracts/types';
import { spacing, typography } from '../../theme/tokens';

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
          useNativeDriver: Platform.OS !== 'web',
        }),
        Animated.timing(pulse, {
          toValue: 0,
          duration: 1100,
          useNativeDriver: Platform.OS !== 'web',
        }),
      ]),
    );
    animation.start();
    return () => animation.stop();
  }, [finishing, pulse, reduceMotion]);

  const copy = finishing
    ? {
        title: 'Fatto! Ho osservato qualcosa in più.',
        detail: `Ti mostro subito cosa ho osservato di ${dogName}.`,
      }
    : status === 'INTERPRETING'
      ? {
          title: `Sto mettendo insieme i segnali di ${dogName}…`,
          detail: 'Confronto ciò che vedo con il suo contesto, con prudenza.',
        }
      : status === 'FAILED_RETRYABLE'
        ? {
            title: 'Ci riprovo con calma…',
            detail: 'Non devi fare nulla e non userò un’altra analisi.',
          }
        : {
            title: `Sto capendo cosa fa ${dogName}...`,
            detail: 'Osservo postura, movimento e contesto senza tirare conclusioni.',
          };

  const ringScale = pulse.interpolate({
    inputRange: [0, 1],
    outputRange: [0.92, 1.12],
  });
  const ringOpacity = pulse.interpolate({
    inputRange: [0, 1],
    outputRange: [0.55, 0.12],
  });

  return (
    <View
      style={styles.wrap}
      accessibilityLiveRegion="polite"
      accessibilityLabel={`${copy.title} ${copy.detail}`}
    >
      <View style={styles.visual}>
        {!reduceMotion && !finishing ? (
          <Animated.View
            style={[
              styles.ring,
              {
                opacity: ringOpacity,
                transform: [{ scale: ringScale }],
              },
            ]}
          />
        ) : null}
        <View style={[styles.icon, finishing && styles.iconDone]}>
          <CuteIcon name={finishing ? 'play' : 'gaze'} size={54} />
        </View>
      </View>
      <Text style={styles.title}>{copy.title}</Text>
      <Text style={styles.detail}>{copy.detail}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  visual: {
    width: 140,
    height: 140,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  ring: {
    position: 'absolute',
    width: 128,
    height: 128,
    borderRadius: 64,
    backgroundColor: '#E0F2F7',
  },
  icon: {
    width: 110,
    height: 110,
    borderRadius: 55,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#E0F2F7',
  },
  iconDone: {
    backgroundColor: '#E0F7F6',
  },
  title: {
    color: '#1A2B48',
    fontSize: 22,
    fontWeight: typography.weight.bold,
    textAlign: 'center',
    paddingHorizontal: spacing.md,
  },
  detail: {
    maxWidth: 320,
    marginTop: spacing.xs,
    color: '#64748B',
    fontSize: 13,
    lineHeight: 19,
    textAlign: 'center',
  },
});
