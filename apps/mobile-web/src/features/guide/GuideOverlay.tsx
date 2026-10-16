import React, { useEffect, useMemo, useState } from 'react';
import {
  Image,
  Modal,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Animated, { Easing, FadeIn, FadeInDown, useAnimatedStyle, useReducedMotion, useSharedValue, withRepeat, withSequence, withTiming } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Path } from 'react-native-svg';
import { SpringPress } from '@/components/pressSpring';
import { colors, radius, shadows, spacing, typography } from '@/theme/tokens';
import type { GuideLocale, GuidePage } from './copy';
import { guideForPage } from './copy';
import { arrowPath, positionGuide, type GuideRect } from './layout';
import type { MeasureGuideTarget } from './useGuideTargets';

const MASCOT = require('../../../assets/images/dog-sex-male.png');
const LOGO = require('../../../assets/brand/dogly-logo-mark.png');

export function GuideOverlay({
  visible,
  page,
  dogName,
  locale,
  onLocaleChange,
  onClose,
  measureTarget,
}: {
  visible: boolean;
  page: GuidePage;
  dogName?: string;
  locale: GuideLocale;
  onLocaleChange: (locale: GuideLocale) => void;
  onClose: () => void | Promise<void>;
  measureTarget?: MeasureGuideTarget;
}) {
  const { width, height } = useWindowDimensions();
  const reducedMotion = useReducedMotion();
  const [stepIndex, setStepIndex] = useState(0);
  const [targetRect, setTargetRect] = useState<GuideRect | null>(null);
  const definition = useMemo(() => guideForPage(page, locale, dogName), [page, locale, dogName]);

  useEffect(() => {
    if (visible) setStepIndex(0);
  }, [visible, page]);

  const step = definition.steps[stepIndex] ?? definition.steps[0];
  useEffect(() => {
    let active = true;
    setTargetRect(null);
    if (!visible || !measureTarget) return () => { active = false; };
    let attempt = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const read = () => {
      void measureTarget(step.target).then((next) => {
        if (!active) return;
        if (next || attempt >= 3) {
          setTargetRect(next);
          return;
        }
        attempt += 1;
        timer = setTimeout(read, 140);
      });
    };
    timer = setTimeout(read, 70);
    return () => { active = false; if (timer) clearTimeout(timer); };
  }, [visible, step.target, measureTarget, width, height]);

  if (!visible) return null;
  const last = stepIndex === definition.steps.length - 1;
  const compact = height < 720;
  const mascotSize = Math.min(compact ? 142 : 184, Math.max(128, width * 0.43));
  const labels = locale === 'en'
    ? { skip: 'Skip guide', back: 'Back', next: last ? 'Let’s begin' : 'Next', of: 'of' }
    : { skip: 'Salta guida', back: 'Indietro', next: last ? 'Iniziamo' : 'Avanti', of: 'di' };

  const guideLayout = positionGuide({ width, height, top: 0, bottom: 0 }, targetRect, compact ? 190 : 220);
  const targetStyle = guideLayout.target
    ? { left: guideLayout.target.x - 8, top: guideLayout.target.y - 8, width: guideLayout.target.width + 16, height: guideLayout.target.height + 16 }
    : null;
  const panelStyle = guideLayout.target
    ? { position: 'absolute' as const, left: guideLayout.panel.x, top: guideLayout.panel.y, width: guideLayout.panel.width, marginBottom: 0 }
    : null;
  return (
    <Modal visible transparent animationType={reducedMotion ? 'none' : 'fade'} statusBarTranslucent onRequestClose={() => void onClose()}>
      <View style={styles.root}>
        <Pressable accessibilityRole="button" accessibilityLabel={labels.skip} onPress={() => void onClose()} style={styles.scrim} />
        <SafeAreaView style={styles.safe}>
          <View style={styles.topBar}>
            <View style={styles.brandLockup}>
              <View style={styles.logoDisc}><Image source={LOGO} style={styles.logo} resizeMode="contain" /></View>
              <View>
                <Text style={styles.brandName}>DOGly</Text>
                <Text style={styles.guideLabel}>{locale === 'en' ? 'QUICK GUIDE' : 'GUIDA RAPIDA'}</Text>
              </View>
            </View>
            <View style={styles.topActions}>
              <View style={styles.localeSwitch} accessibilityRole="tablist">
                {(['it', 'en'] as const).map((option) => (
                  <Pressable
                    key={option}
                    accessibilityRole="tab"
                    accessibilityState={{ selected: locale === option }}
                    onPress={() => onLocaleChange(option)}
                    style={[styles.localeOption, locale === option && styles.localeOptionSelected]}
                  >
                    <Text style={[styles.localeText, locale === option && styles.localeTextSelected]}>{option.toUpperCase()}</Text>
                  </Pressable>
                ))}
              </View>
              <Pressable accessibilityRole="button" accessibilityLabel={labels.skip} onPress={() => void onClose()} style={styles.skipButton}>
                <Text style={styles.skipText}>{labels.skip}</Text>
              </Pressable>
            </View>
          </View>

          {targetStyle ? <View pointerEvents="none" style={[styles.targetRing, targetStyle]}><View style={styles.targetGlow} /></View> : null}
          {guideLayout.arrow ? <GuideArrow start={guideLayout.arrow.start} end={guideLayout.arrow.end} /> : null}

          <View style={styles.content}>
            <Animated.View entering={reducedMotion ? undefined : FadeInDown.duration(360)} key={`${page}-${locale}-${stepIndex}`} style={[styles.coachRow, compact && styles.coachRowCompact, panelStyle]}>
              <Animated.View entering={reducedMotion ? undefined : FadeIn.duration(450)} style={[styles.mascotWrap, { width: mascotSize, height: mascotSize }]}>
                <View style={styles.mascotHalo} />
                <Image source={MASCOT} style={styles.mascot} resizeMode="contain" accessibilityLabel="Mascotte DOGly" />
                <View style={styles.mascotSpark}><Ionicons name="sparkles" size={17} color="#FFFFFF" /></View>
              </Animated.View>
              <View style={styles.speechBubble}>
                <View style={styles.speechTail} />
                <Text style={styles.eyebrow}>{definition.eyebrow}</Text>
                <Text style={styles.title}>{step.title}</Text>
                <Text style={styles.body}>{step.body}</Text>
                <View style={styles.stepBadge}><Text style={styles.stepBadgeText}>{stepIndex + 1} {labels.of} {definition.steps.length}</Text></View>
              </View>
            </Animated.View>

            <View style={styles.progress} accessibilityLabel={`${stepIndex + 1} ${labels.of} ${definition.steps.length}`}>
              {definition.steps.map((_, index) => <View key={index} style={[styles.progressDot, index === stepIndex && styles.progressDotActive]} />)}
            </View>

            <View style={styles.actions}>
              <SpringPress accessibilityRole="button" accessibilityLabel={labels.back} onPress={() => setStepIndex((value) => Math.max(0, value - 1))} disabled={stepIndex === 0} style={styles.backAction} pressableStyle={styles.backPressable}>
                <Ionicons name="arrow-back" size={17} color={stepIndex === 0 ? colors.iconMuted : colors.text} />
                <Text style={[styles.backText, stepIndex === 0 && styles.disabledText]}>{labels.back}</Text>
              </SpringPress>
              <LinearGradient colors={[colors.primary, '#4F8CFF']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.nextGradient}>
                <SpringPress accessibilityRole="button" accessibilityLabel={labels.next} onPress={() => last ? void onClose() : setStepIndex((value) => Math.min(definition.steps.length - 1, value + 1))} style={styles.nextAction} pressableStyle={styles.nextPressable}>
                  <Text style={styles.nextText}>{labels.next}</Text>
                  <Ionicons name={last ? 'checkmark' : 'arrow-forward'} size={18} color="#FFFFFF" />
                </SpringPress>
              </LinearGradient>
            </View>
          </View>
        </SafeAreaView>
      </View>
    </Modal>
  );
}

function GuideArrow({ start, end }: { start: { x: number; y: number }; end: { x: number; y: number } }) {
  const bob = useSharedValue(0);
  useEffect(() => {
    bob.value = withRepeat(
      withSequence(
        withTiming(-7, { duration: 520, easing: Easing.inOut(Easing.quad) }),
        withTiming(0, { duration: 520, easing: Easing.inOut(Easing.quad) }),
      ),
      -1,
      false,
    );
  }, [bob]);
  const animatedStyle = useAnimatedStyle(() => ({ transform: [{ translateY: bob.value }] }));
  return (
    <Animated.View pointerEvents="none" style={[styles.arrowLayer, animatedStyle]}>
      <Svg width="100%" height="100%" pointerEvents="none">
        <Path d={arrowPath(start, end)} fill="none" stroke="#FF5B63" strokeWidth={3.5} strokeLinecap="round" strokeLinejoin="round" />
      </Svg>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  scrim: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(9, 32, 66, 0.72)' },
  safe: { flex: 1, paddingHorizontal: spacing.lg, paddingTop: spacing.sm, paddingBottom: spacing.sm },
  topBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', zIndex: 3 },
  brandLockup: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  logoDisc: { width: 38, height: 38, borderRadius: radius.full, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: 'rgba(255,255,255,0.72)' },
  logo: { width: 28, height: 28 },
  brandName: { color: '#FFFFFF', fontSize: typography.size.md, fontWeight: typography.weight.bold, letterSpacing: 0.2 },
  guideLabel: { color: 'rgba(255,255,255,0.72)', fontSize: 9, fontWeight: typography.weight.bold, letterSpacing: 1.2, marginTop: 1 },
  topActions: { alignItems: 'flex-end', gap: spacing.sm },
  localeSwitch: { flexDirection: 'row', padding: 3, borderRadius: radius.full, backgroundColor: 'rgba(255,255,255,0.15)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.25)' },
  localeOption: { minWidth: 34, minHeight: 26, paddingHorizontal: spacing.xs, borderRadius: radius.full, alignItems: 'center', justifyContent: 'center' },
  localeOptionSelected: { backgroundColor: '#FFFFFF' },
  localeText: { color: 'rgba(255,255,255,0.8)', fontSize: 10, fontWeight: typography.weight.bold },
  localeTextSelected: { color: colors.primary },
  skipButton: { minHeight: 32, paddingHorizontal: spacing.sm, justifyContent: 'center' },
  skipText: { color: '#FFFFFF', fontSize: typography.size.sm, fontWeight: typography.weight.semibold },
  content: { flex: 1, justifyContent: 'flex-end', paddingBottom: spacing.md, position: 'relative', zIndex: 2 },
  coachRow: { flexDirection: 'row', alignItems: 'flex-end', maxWidth: 560, width: '100%', alignSelf: 'center', marginBottom: 102, zIndex: 3 },
  coachRowCompact: { marginBottom: 75 },
  mascotWrap: { position: 'relative', justifyContent: 'flex-end', alignItems: 'center', marginRight: -spacing.sm, zIndex: 2 },
  mascotHalo: { position: 'absolute', width: '82%', height: '82%', bottom: 4, borderRadius: radius.full, backgroundColor: 'rgba(20,184,166,0.26)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.42)' },
  mascot: { width: '100%', height: '100%' },
  mascotSpark: { position: 'absolute', top: '8%', right: -2, width: 30, height: 30, borderRadius: radius.full, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center', borderWidth: 3, borderColor: '#FFFFFF' },
  speechBubble: { flex: 1, minHeight: 188, paddingHorizontal: spacing.lg, paddingTop: spacing.lg, paddingBottom: spacing.md, borderRadius: 28, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: 'rgba(255,255,255,0.85)', ...shadows.raised },
  speechTail: { position: 'absolute', left: -16, bottom: 28, width: 28, height: 28, backgroundColor: '#FFFFFF', transform: [{ rotate: '45deg' }], borderBottomLeftRadius: 5 },
  eyebrow: { color: colors.accentPressed, fontSize: 10, fontWeight: typography.weight.bold, letterSpacing: 1.1, marginBottom: spacing.xs },
  title: { color: colors.text, fontSize: typography.size.xl, lineHeight: typography.size.xl * 1.16, fontWeight: typography.weight.bold },
  body: { color: colors.textSecondary, fontSize: typography.size.md, lineHeight: typography.size.md * 1.4, marginTop: spacing.sm },
  stepBadge: { alignSelf: 'flex-start', marginTop: spacing.md, paddingHorizontal: spacing.sm, paddingVertical: 5, borderRadius: radius.full, backgroundColor: colors.primarySoft },
  stepBadgeText: { color: colors.primaryPressed, fontSize: typography.size.xs, fontWeight: typography.weight.bold },
  progress: { flexDirection: 'row', justifyContent: 'center', gap: spacing.xs, marginBottom: spacing.md },
  progressDot: { width: 8, height: 8, borderRadius: radius.full, backgroundColor: 'rgba(255,255,255,0.4)' },
  progressDotActive: { width: 24, backgroundColor: colors.accent },
  actions: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, maxWidth: 560, width: '100%', alignSelf: 'center' },
  backAction: { flex: 1, minHeight: 52 },
  backPressable: { minHeight: 52, borderRadius: radius.lg, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: spacing.xs },
  backText: { color: '#FFFFFF', fontSize: typography.size.sm, fontWeight: typography.weight.semibold },
  disabledText: { color: 'rgba(255,255,255,0.42)' },
  nextGradient: { flex: 1.55, borderRadius: radius.lg, ...shadows.raised },
  nextAction: { minHeight: 52 },
  nextPressable: { minHeight: 52, borderRadius: radius.lg, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: spacing.sm },
  nextText: { color: '#FFFFFF', fontSize: typography.size.md, fontWeight: typography.weight.bold },
  targetRing: { position: 'absolute', zIndex: 1, borderRadius: radius.lg, borderWidth: 2, borderColor: 'rgba(20,184,166,0.72)', borderStyle: 'dashed', shadowColor: colors.accent, shadowOpacity: 0.65, shadowRadius: 18, elevation: 8 },
  targetGlow: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(20,184,166,0.08)', borderRadius: radius.lg },
  arrowLayer: { ...StyleSheet.absoluteFill, zIndex: 4 },
});

export default GuideOverlay;
