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

  const copy = finishing
    ? {
        title: 'Fatto! Ho capito qualcosa in più.',
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
            title: `Sto guardando ${dogName} con attenzione…`,
            detail: 'Osservo postura, movimento e contesto senza tirare conclusioni.',
          };

  const ringScale = pulse.interpolate({
    inputRange: [0, 1],
    outputRange: [0.88, 1.16],
  });
  const ringOpacity = pulse.interpolate({
    inputRange: [0, 1],
    outputRange: [0.42, 0.08],
  });

  return (
    <View
      style={styles.wrap}
      accessibilityLiveRegion="polite"
      accessibilityLabel={`${copy.title} ${copy.detail}`}
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
    marginBottom: spacing.xl,
  },
  visual: {
    width: 132,
    height: 132,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  ring: {
    position: 'absolute',
    width: 126,
    height: 126,
    borderRadius: radius.full,
    borderWidth: 3,
    borderColor: colors.accent,
  },
  ringInner: {
    width: 100,
    height: 100,
    borderColor: colors.primary,
  },
  icon: {
    width: 88,
    height: 88,
    borderRadius: 44,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accentSoft,
  },
  iconDone: {
    backgroundColor: colors.primarySoft,
  },
  title: {
    color: colors.text,
    fontSize: typography.size.lg,
    fontWeight: typography.weight.bold,
    textAlign: 'center',
  },
  detail: {
    maxWidth: 320,
    marginTop: spacing.xs,
    color: colors.textSecondary,
    fontSize: typography.size.sm,
    lineHeight: typography.size.sm * typography.lineHeight.relaxed,
    textAlign: 'center',
  },
});
