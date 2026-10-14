/**
 * Hero Home ("Il mondo di {nome}"): mini-scena vivente sopra la
 * conversazione. Cielo per fascia oraria (sole che sorge al mattino,
 * nuvolette in loop di giorno, luna e stelle che brillano la sera),
 * colline in parallasse, avatar del cane sulla collina che respira
 * (tap = boing + cuoricini/zampine, long-press = scodinzolata),
 * fumetto con coreografia "sta pensando" (3 puntini) poi parola per
 * parola al primo accesso del giorno, particella ambientale ogni ~8s.
 * Tutto sull'UI thread Reanimated; reduce-motion → scena statica.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Circle, Path } from 'react-native-svg';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import Animated, {
  Easing,
  FadeIn,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { colors, radius, shadows, spacing, typography } from '../../theme/tokens';
import { CuteIcon } from '../../components/CuteIcon';
import { useSession } from '../auth/SessionProvider';
import { isApiConfigured } from '../auth/env';
import { isPersistedId } from '../../lib/persistedId';
import { queryKeys } from '../../lib/queryClient';
import { localDayKey } from '../checkin/persistence';
import { useCareEvents } from '../care/store';
import { usePersonalPatterns } from '../patterns/api';
import { useLifestyle } from '../lifestyle/api';
import { breedTipFor } from '../dogs/breedTraits';
import { DogAvatar } from '../core/components';
import { fetchDiaryPage } from './api';
import {
  JOYFUL_LINE,
  dayPartForHour,
  loadHeroShownDay,
  randomAffectionateLine,
  saveHeroShownDay,
  selectHeroMessage,
  splitWords,
  type DayPart,
  type HeroMessageKind,
} from './dogHeroCopy';

const DAY_MS = 24 * 60 * 60 * 1000;
const JOYFUL_MS = 2600;
const THINKING_MS = 900;
const ENTRANCE_DONE_MS = 2700;
const SCENE_HEIGHT = 224;

const HERO_GRADIENTS: Record<DayPart, [string, string, string]> = {
  morning: ['#FFE8D1', '#FBD7C2', '#CDF2EC'],
  afternoon: ['#DCEBFE', '#C9E7FB', '#D9F4EF'],
  evening: ['#0E2A47', '#14385E', '#1D4E77'],
};

const HILL_COLORS: Record<DayPart, [string, string, string]> = {
  morning: ['#B8E3D2', '#96D4BE', '#74C4A9'],
  afternoon: ['#A9DCCF', '#85CDBB', '#63BDA6'],
  evening: ['#1C4B6E', '#173F5F', '#123452'],
};

const HILL_PATHS = [
  'M0 50 C120 26 220 60 350 44 C480 28 580 56 720 40 L720 84 L0 84 Z',
  'M0 62 C140 42 260 68 400 55 C520 45 620 64 720 56 L720 84 L0 84 Z',
  'M0 74 C160 60 320 78 480 68 C580 62 660 72 720 68 L720 84 L0 84 Z',
] as const;

const STARS: ReadonlyArray<{ top: `${number}%`; left: `${number}%`; size: number }> = [
  { top: '10%', left: '34%', size: 2 },
  { top: '18%', left: '52%', size: 3 },
  { top: '8%', left: '68%', size: 2 },
  { top: '24%', left: '82%', size: 2 },
  { top: '38%', left: '90%', size: 3 },
  { top: '30%', left: '44%', size: 2 },
  { top: '14%', left: '22%', size: 2 },
  { top: '44%', left: '64%', size: 2 },
  { top: '6%', left: '48%', size: 2 },
  { top: '28%', left: '12%', size: 3 },
  { top: '36%', left: '30%', size: 2 },
  { top: '16%', left: '88%', size: 2 },
];

const CLOUDS: ReadonlyArray<{ top: number; scale: number; duration: number; delay: number }> = [
  { top: 22, scale: 1, duration: 46000, delay: 0 },
  { top: 52, scale: 0.72, duration: 62000, delay: 9000 },
  { top: 36, scale: 0.55, duration: 54000, delay: 24000 },
];

const BURST_PARTICLES: ReadonlyArray<{ dx: number; delay: number; tone: 'accent' | 'light' }> = [
  { dx: -20, delay: 0, tone: 'accent' },
  { dx: 4, delay: 90, tone: 'light' },
  { dx: -6, delay: 180, tone: 'accent' },
  { dx: 18, delay: 260, tone: 'light' },
];

const HERO_ROUTES: Partial<Record<HeroMessageKind, string>> = {
  care: '/care',
  pattern: '/patterns',
  digestive: '/digestive',
};

function startOfLocalDay(value: Date): number {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate()).getTime();
}

/* ------------------------------------------------------------------ */
/* Strati di scena — ognuno con i propri shared value (UI thread).     */
/* ------------------------------------------------------------------ */

function RisingSun({ reducedMotion }: { reducedMotion: boolean }) {
  const rise = useSharedValue(reducedMotion ? 1 : 0);
  useEffect(() => {
    if (reducedMotion) return;
    rise.value = withTiming(1, { duration: 2000, easing: Easing.out(Easing.cubic) });
  }, [reducedMotion, rise]);
  const style = useAnimatedStyle(() => ({
    transform: [{ translateY: (1 - rise.value) * 78 }],
  }));
  return (
    <Animated.View pointerEvents="none" style={[styles.sun, style]}>
      <View style={styles.sunHalo} />
      <View style={styles.sunCore} />
    </Animated.View>
  );
}

function Cloud({
  top,
  scale,
  duration,
  delay,
  reducedMotion,
}: {
  top: number;
  scale: number;
  duration: number;
  delay: number;
  reducedMotion: boolean;
}) {
  const x = useSharedValue(-170);
  useEffect(() => {
    if (reducedMotion) {
      x.value = 90 + delay / 300;
      return;
    }
    x.value = -170;
    x.value = withDelay(
      delay,
      withRepeat(withTiming(760, { duration, easing: Easing.linear }), -1, false),
    );
  }, [reducedMotion, duration, delay, x]);
  const style = useAnimatedStyle(() => ({
    transform: [{ translateX: x.value }, { scale }],
  }));
  return (
    <Animated.View pointerEvents="none" style={[styles.cloud, { top }, style]}>
      <View style={styles.cloudBumpLeft} />
      <View style={styles.cloudBumpRight} />
      <View style={styles.cloudBase} />
    </Animated.View>
  );
}

function TwinkleStar({
  top,
  left,
  size,
  index,
  reducedMotion,
}: {
  top: `${number}%`;
  left: `${number}%`;
  size: number;
  index: number;
  reducedMotion: boolean;
}) {
  const glow = useSharedValue(0.75);
  useEffect(() => {
    if (reducedMotion) return;
    glow.value = withDelay(
      index * 340,
      withRepeat(
        withSequence(
          withTiming(1, { duration: 820, easing: Easing.inOut(Easing.sin) }),
          withTiming(0.22, { duration: 940, easing: Easing.inOut(Easing.sin) }),
        ),
        -1,
        true,
      ),
    );
  }, [reducedMotion, index, glow]);
  const style = useAnimatedStyle(() => ({ opacity: glow.value }));
  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.star,
        style,
        { top, left, width: size, height: size, borderRadius: size / 2 },
      ]}
    />
  );
}

function Moon() {
  return (
    <View pointerEvents="none" style={styles.moon}>
      <View style={styles.moonHalo} />
      <Svg width={42} height={42} viewBox="0 0 42 42">
        <Circle cx={21} cy={21} r={15} fill="#F7F3E3" />
        <Circle cx={28} cy={15} r={13} fill="#14385E" />
      </Svg>
    </View>
  );
}

function HillLayer({
  path,
  color,
  amplitude,
  duration,
  reducedMotion,
}: {
  path: string;
  color: string;
  amplitude: number;
  duration: number;
  reducedMotion: boolean;
}) {
  const drift = useSharedValue(0);
  useEffect(() => {
    if (reducedMotion) return;
    drift.value = withRepeat(
      withTiming(1, { duration, easing: Easing.inOut(Easing.sin) }),
      -1,
      true,
    );
  }, [reducedMotion, duration, drift]);
  const style = useAnimatedStyle(() => ({
    transform: [{ translateX: (drift.value - 0.5) * 2 * amplitude }],
  }));
  return (
    <Animated.View pointerEvents="none" style={[styles.hill, style]}>
      <Svg width={760} height={84} viewBox="0 0 720 84">
        <Path d={path} fill={color} />
      </Svg>
    </Animated.View>
  );
}

function PawParticle({
  dx,
  delay,
  tone,
  trigger,
  reducedMotion,
}: {
  dx: number;
  delay: number;
  tone: 'accent' | 'light';
  trigger: number;
  reducedMotion: boolean;
}) {
  const progress = useSharedValue(1);
  useEffect(() => {
    if (!trigger || reducedMotion) return;
    progress.value = 0;
    progress.value = withDelay(
      delay,
      withTiming(1, { duration: 850, easing: Easing.out(Easing.quad) }),
    );
  }, [trigger, delay, reducedMotion, progress]);
  const style = useAnimatedStyle(() => {
    const p = progress.value;
    const fadeIn = Math.min(1, p / 0.15);
    return {
      opacity: fadeIn * (1 - p) * 1.1,
      transform: [{ translateY: -72 * p }, { translateX: dx }],
    };
  });
  return (
    <Animated.View pointerEvents="none" style={[styles.particle, style]}>
      <CuteIcon
        name="paw"
        size={tone === 'accent' ? 15 : 12}
        color={tone === 'accent' ? colors.accent : colors.textOnPrimary}
        secondary={tone === 'accent' ? colors.accent : colors.textOnPrimary}
      />
    </Animated.View>
  );
}

function AmbientPaw({ xPercent, id }: { xPercent: number; id: number }) {
  const progress = useSharedValue(0);
  useEffect(() => {
    progress.value = withTiming(1, { duration: 1500, easing: Easing.out(Easing.quad) });
  }, [id, progress]);
  const style = useAnimatedStyle(() => {
    const p = progress.value;
    const fadeIn = Math.min(1, p * 4);
    return {
      opacity: Math.max(0, 0.5 * fadeIn * (1 - p)),
      transform: [{ translateY: -64 * p }],
    };
  });
  return (
    <Animated.View
      pointerEvents="none"
      style={[styles.ambient, { left: `${xPercent}%` }, style]}
    >
      <CuteIcon name="paw" size={11} color={colors.textOnPrimary} secondary={colors.textOnPrimary} />
    </Animated.View>
  );
}

function ThinkingDots() {
  return (
    <View style={styles.thinking} accessibilityLabel={`Sto pensando`}>
      {[0, 1, 2].map((index) => (
        <ThinkingDot key={index} index={index} />
      ))}
    </View>
  );
}

function ThinkingDot({ index }: { index: number }) {
  const bounce = useSharedValue(0);
  useEffect(() => {
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
  }, [index, bounce]);
  const style = useAnimatedStyle(() => ({
    transform: [{ translateY: bounce.value }],
  }));
  return <Animated.View style={[styles.thinkingDot, style]} />;
}

/* ------------------------------------------------------------------ */
/* Hero                                                                 */
/* ------------------------------------------------------------------ */

export function DogHero({
  dogId,
  dogName,
  photoUri,
  breedLabel,
}: {
  dogId: string;
  dogName: string;
  photoUri?: string | null;
  breedLabel?: string | null;
}) {
  const router = useRouter();
  const reducedMotion = useReducedMotion();
  const { userId } = useSession();
  const careEvents = useCareEvents(dogId, dogName);
  const patternsQuery = usePersonalPatterns(dogId);
  const lifestyle = useLifestyle(dogId);
  const digestiveEnabled =
    Boolean(userId) && isApiConfigured() && isPersistedId(dogId);
  const digestiveQuery = useQuery({
    queryKey: [...queryKeys.diary(userId ?? 'anon', dogId), 'hero-last-digestive'],
    queryFn: () => fetchDiaryPage({ dogId, domain: 'DIGESTIVE', limit: 1 }),
    enabled: digestiveEnabled,
  });

  const now = new Date();
  const dayPart = dayPartForHour(now.getHours());

  const careHint = useMemo(() => {
    const todayStart = startOfLocalDay(now);
    const next = careEvents.find(
      (event) =>
        event.status === 'SCHEDULED' &&
        Date.parse(event.scheduledAt) >= todayStart,
    );
    if (!next) return null;
    const daysUntil = Math.round(
      (startOfLocalDay(new Date(next.scheduledAt)) - todayStart) / DAY_MS,
    );
    return { eventType: next.eventType, daysUntil };
  }, [careEvents]);

  const patternTitle = useMemo(() => {
    if (!patternsQuery.live || patternsQuery.isError) return undefined;
    const visible = patternsQuery.patterns
      .filter((pattern) => pattern.state !== 'ARCHIVED')
      .sort((a, b) =>
        Date.parse(b.lastSeen ?? b.firstSeen ?? '') -
        Date.parse(a.lastSeen ?? a.firstSeen ?? ''),
      );
    return visible[0]?.title ?? undefined;
  }, [patternsQuery.live, patternsQuery.isError, patternsQuery.patterns]);

  const daysSinceDigestive = useMemo(() => {
    if (!digestiveEnabled || !digestiveQuery.data) return undefined;
    const last = digestiveQuery.data.items[0];
    if (!last) return null;
    return Math.floor((Date.now() - Date.parse(last.created_at)) / DAY_MS);
  }, [digestiveEnabled, digestiveQuery.data]);

  const breedTip = useMemo(
    () =>
      breedTipFor(breedLabel, dayPart, {
        timeAlone: lifestyle.profile?.timeAlone ?? null,
      }),
    [breedLabel, dayPart, lifestyle.profile],
  );

  const message = useMemo(
    () =>
      selectHeroMessage({
        hour: now.getHours(),
        careHint,
        patternTitle,
        daysSinceDigestive,
        breedTip,
        dayKey: localDayKey(now),
        dogId,
      }),
    [careHint, patternTitle, daysSinceDigestive, breedTip, dogId],
  );

  const [tapLine, setTapLine] = useState<string | null>(null);
  const [joyful, setJoyful] = useState(false);
  const [entrance, setEntrance] = useState<'pending' | 'animate' | 'static'>(
    'pending',
  );
  const [thinkingDone, setThinkingDone] = useState(false);
  const [burstTick, setBurstTick] = useState(0);
  const [ambient, setAmbient] = useState<{ id: number; x: number } | null>(null);
  const joyfulTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let alive = true;
    void loadHeroShownDay(dogId).then((shownDay) => {
      if (!alive) return;
      if (shownDay === localDayKey() || reducedMotion) {
        setEntrance('static');
      } else {
        setEntrance('animate');
        void saveHeroShownDay(localDayKey(), dogId);
      }
    });
    return () => {
      alive = false;
    };
  }, [dogId, reducedMotion]);

  useEffect(() => {
    if (entrance !== 'animate') return;
    const thinking = setTimeout(() => setThinkingDone(true), THINKING_MS);
    const done = setTimeout(() => setEntrance('static'), ENTRANCE_DONE_MS);
    return () => {
      clearTimeout(thinking);
      clearTimeout(done);
    };
  }, [entrance]);

  useEffect(
    () => () => {
      if (joyfulTimer.current) clearTimeout(joyfulTimer.current);
    },
    [],
  );

  useEffect(() => {
    if (reducedMotion) return;
    let counter = 0;
    const timer = setInterval(() => {
      counter += 1;
      setAmbient({ id: counter, x: 12 + Math.random() * 72 });
    }, 8000);
    return () => clearInterval(timer);
  }, [reducedMotion]);

  const drift = useSharedValue(0);
  const breath = useSharedValue(1);
  const tapScale = useSharedValue(1);
  const wag = useSharedValue(0);

  useEffect(() => {
    if (reducedMotion) return;
    drift.value = withRepeat(
      withTiming(1, { duration: 6000, easing: Easing.inOut(Easing.sin) }),
      -1,
      true,
    );
    breath.value = withRepeat(
      withTiming(1.03, { duration: 1400, easing: Easing.inOut(Easing.sin) }),
      -1,
      true,
    );
  }, [reducedMotion, drift, breath]);

  const driftStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: drift.value * 56 }],
  }));
  const avatarStyle = useAnimatedStyle(() => ({
    transform: [
      { scale: breath.value * tapScale.value },
      { rotate: `${wag.value}deg` },
    ],
  }));
  const haloStyle = useAnimatedStyle(() => ({
    opacity: 0.25 + (breath.value - 1) * 8,
  }));

  const onAvatarPress = () => {
    setJoyful(false);
    setTapLine(randomAffectionateLine());
    setBurstTick((tick) => tick + 1);
    if (reducedMotion) return;
    tapScale.value = withSequence(
      withSpring(1.12, { damping: 5, stiffness: 220 }),
      withSpring(1, { damping: 7, stiffness: 180 }),
    );
  };

  const onAvatarLongPress = () => {
    setTapLine(null);
    setJoyful(true);
    if (joyfulTimer.current) clearTimeout(joyfulTimer.current);
    joyfulTimer.current = setTimeout(() => setJoyful(false), JOYFUL_MS);
    if (reducedMotion) return;
    wag.value = withSequence(
      withTiming(-9, { duration: 90 }),
      withTiming(9, { duration: 120 }),
      withTiming(-9, { duration: 120 }),
      withTiming(9, { duration: 120 }),
      withTiming(0, { duration: 90 }),
    );
  };

  const displayText = joyful ? JOYFUL_LINE : (tapLine ?? message.text);
  const route =
    !joyful && !tapLine ? (HERO_ROUTES[message.kind] ?? null) : null;
  const words = useMemo(() => splitWords(displayText), [displayText]);
  const wordStep = words.length > 0 ? Math.min(90, 850 / words.length) : 0;

  const bubbleBody =
    entrance === 'animate' && !thinkingDone ? (
      <ThinkingDots />
    ) : entrance === 'animate' ? (
      <Text
        style={styles.bubbleText}
        accessible
        accessibilityLabel={displayText}
      >
        {words.map((word, index) => (
          <Animated.Text
            key={`${displayText}-${index}`}
            entering={FadeIn.duration(200).delay(150 + index * wordStep)}
          >
            {word}
            {index < words.length - 1 ? ' ' : ''}
          </Animated.Text>
        ))}
      </Text>
    ) : (
      <Text style={styles.bubbleText}>{displayText}</Text>
    );

  return (
    <View style={styles.card}>
      <View
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
        accessible={false}
        accessibilityElementsHidden
        importantForAccessibility="no"
      >
        <Animated.View style={[styles.gradientShift, driftStyle]}>
          <LinearGradient
            colors={HERO_GRADIENTS[dayPart]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
        </Animated.View>

        {dayPart === 'morning' ? <RisingSun reducedMotion={reducedMotion} /> : null}
        {dayPart === 'afternoon'
          ? CLOUDS.map((cloud, index) => (
              <Cloud key={index} {...cloud} reducedMotion={reducedMotion} />
            ))
          : null}
        {dayPart === 'evening' ? (
          <>
            <Moon />
            {STARS.map((star, index) => (
              <TwinkleStar
                key={index}
                {...star}
                index={index}
                reducedMotion={reducedMotion}
              />
            ))}
          </>
        ) : null}

        {HILL_PATHS.map((path, index) => (
          <HillLayer
            key={index}
            path={path}
            color={HILL_COLORS[dayPart][index]}
            amplitude={10 + index * 7}
            duration={26000 + index * 13000}
            reducedMotion={reducedMotion}
          />
        ))}

        {ambient && !reducedMotion ? (
          <AmbientPaw key={ambient.id} id={ambient.id} xPercent={ambient.x} />
        ) : null}
      </View>

      <View style={styles.bubbleWrap}>
        <Pressable
          accessibilityRole={route ? 'button' : undefined}
          accessibilityLabel={
            route ? `${displayText} Tocca per aprire` : displayText
          }
          disabled={!route}
          onPress={route ? () => router.push(route as never) : undefined}
          style={({ pressed }) => [
            styles.bubble,
            pressed && route ? styles.bubblePressed : null,
          ]}
        >
          {bubbleBody}
          {route ? (
            <View style={styles.bubbleHint}>
              <Ionicons
                name="chevron-forward"
                size={14}
                color={colors.primary}
              />
            </View>
          ) : null}
        </Pressable>
        <View style={styles.tail} pointerEvents="none" />
      </View>

      <View style={styles.avatarSpot}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${dogName} in un prato: tocca per un saluto, tieni premuto per farlo scodinzolare`}
          onPress={onAvatarPress}
          onLongPress={onAvatarLongPress}
          delayLongPress={450}
          hitSlop={8}
        >
          <Animated.View style={[styles.avatarRing, avatarStyle]}>
            <Animated.View
              pointerEvents="none"
              style={[styles.halo, haloStyle]}
            />
            <DogAvatar size={76} photoUri={photoUri} dogName={dogName} />
          </Animated.View>
        </Pressable>
        <View pointerEvents="none" style={styles.burstLayer}>
          {BURST_PARTICLES.map((particle, index) => (
            <PawParticle
              key={index}
              {...particle}
              trigger={burstTick}
              reducedMotion={reducedMotion}
            />
          ))}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    height: SCENE_HEIGHT,
    overflow: 'hidden',
    borderRadius: radius.lg,
    ...shadows.card,
  },
  gradientShift: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: -56,
    right: -56,
  },
  sun: {
    position: 'absolute',
    left: '30%',
    bottom: 66,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sunHalo: {
    position: 'absolute',
    width: 68,
    height: 68,
    borderRadius: radius.full,
    backgroundColor: 'rgba(255, 201, 107, 0.35)',
  },
  sunCore: {
    width: 38,
    height: 38,
    borderRadius: radius.full,
    backgroundColor: '#FFC96B',
  },
  cloud: {
    position: 'absolute',
    left: 0,
    width: 64,
    height: 24,
  },
  cloudBase: {
    position: 'absolute',
    bottom: 0,
    width: 64,
    height: 16,
    borderRadius: radius.sm,
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
  },
  cloudBumpLeft: {
    position: 'absolute',
    bottom: 8,
    left: 10,
    width: 22,
    height: 22,
    borderRadius: radius.full,
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
  },
  cloudBumpRight: {
    position: 'absolute',
    bottom: 8,
    left: 30,
    width: 26,
    height: 26,
    borderRadius: radius.full,
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
  },
  moon: {
    position: 'absolute',
    top: 16,
    right: 26,
    alignItems: 'center',
    justifyContent: 'center',
  },
  moonHalo: {
    position: 'absolute',
    width: 58,
    height: 58,
    borderRadius: radius.full,
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
  },
  star: {
    position: 'absolute',
    backgroundColor: 'rgba(255, 255, 255, 0.85)',
  },
  hill: {
    position: 'absolute',
    bottom: -2,
    left: -70,
  },
  ambient: {
    position: 'absolute',
    bottom: 34,
  },
  bubbleWrap: {
    position: 'absolute',
    top: spacing.md,
    left: 116,
    right: 14,
  },
  bubble: {
    minWidth: 0,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    gap: spacing.xs,
  },
  bubblePressed: {
    opacity: 0.86,
  },
  bubbleText: {
    color: colors.text,
    fontSize: typography.size.sm,
    lineHeight: typography.size.sm * typography.lineHeight.relaxed,
    fontWeight: typography.weight.medium,
  },
  bubbleHint: {
    alignSelf: 'flex-end',
  },
  tail: {
    position: 'absolute',
    left: 22,
    bottom: -6,
    width: 14,
    height: 14,
    backgroundColor: colors.surface,
    transform: [{ rotate: '45deg' }],
    borderRadius: 2,
  },
  thinking: {
    flexDirection: 'row',
    gap: 6,
    paddingVertical: spacing.xs,
  },
  thinkingDot: {
    width: 7,
    height: 7,
    borderRadius: radius.full,
    backgroundColor: colors.iconMuted,
  },
  avatarSpot: {
    position: 'absolute',
    left: 18,
    bottom: 14,
  },
  avatarRing: {
    padding: 3,
    borderRadius: radius.full,
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.9)',
    backgroundColor: 'rgba(255, 255, 255, 0.35)',
  },
  halo: {
    position: 'absolute',
    top: -6,
    bottom: -6,
    left: -6,
    right: -6,
    borderRadius: radius.full,
    backgroundColor: colors.accentSoft,
  },
  burstLayer: {
    position: 'absolute',
    left: '50%',
    top: -6,
  },
  particle: {
    position: 'absolute',
  },
});
