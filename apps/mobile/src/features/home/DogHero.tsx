/**
 * Hero Home ("Oreo ti parla"): card viva sopra la conversazione.
 * Sfondo con gradiente legato alla fascia oraria, avatar che respira,
 * fumetto in prima persona alimentato solo da dati reali (agenda, pattern,
 * digestione) con saluto di default come riserva. Niente animazioni con
 * riduzione del movimento attiva.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import Animated, {
  Easing,
  FadeIn,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { colors, radius, shadows, spacing, typography } from '../../theme/tokens';
import { useSession } from '../auth/SessionProvider';
import { isApiConfigured } from '../auth/env';
import { isPersistedId } from '../../lib/persistedId';
import { queryKeys } from '../../lib/queryClient';
import { localDayKey } from '../checkin/persistence';
import { useCareEvents } from '../care/store';
import { usePersonalPatterns } from '../patterns/api';
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

const HERO_GRADIENTS: Record<DayPart, [string, string, string]> = {
  morning: ['#FFE8D1', '#FBD7C2', '#CDF2EC'],
  afternoon: ['#DCEBFE', '#C9E7FB', '#D9F4EF'],
  evening: ['#0E2A47', '#14385E', '#1D4E77'],
};

const STARS: ReadonlyArray<{ top: `${number}%`; left: `${number}%`; size: number }> = [
  { top: '16%', left: '38%', size: 2 },
  { top: '26%', left: '58%', size: 3 },
  { top: '12%', left: '74%', size: 2 },
  { top: '34%', left: '86%', size: 2 },
  { top: '60%', left: '92%', size: 3 },
  { top: '70%', left: '48%', size: 2 },
  { top: '20%', left: '26%', size: 2 },
  { top: '78%', left: '70%', size: 2 },
];

const HERO_ROUTES: Record<Exclude<HeroMessageKind, 'greeting'>, string> = {
  care: '/care',
  pattern: '/patterns',
  digestive: '/digestive',
};

function startOfLocalDay(value: Date): number {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate()).getTime();
}

export function DogHero({
  dogId,
  dogName,
  photoUri,
}: {
  dogId: string;
  dogName: string;
  photoUri?: string | null;
}) {
  const router = useRouter();
  const reducedMotion = useReducedMotion();
  const { userId } = useSession();
  const careEvents = useCareEvents(dogId, dogName);
  const patternsQuery = usePersonalPatterns(dogId);
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

  const message = useMemo(
    () =>
      selectHeroMessage({
        hour: now.getHours(),
        careHint,
        patternTitle,
        daysSinceDigestive,
      }),
    [careHint, patternTitle, daysSinceDigestive],
  );

  const [tapLine, setTapLine] = useState<string | null>(null);
  const [joyful, setJoyful] = useState(false);
  const [entrance, setEntrance] = useState<'pending' | 'animate' | 'static'>(
    'pending',
  );
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
    const timer = setTimeout(() => setEntrance('static'), 1800);
    return () => clearTimeout(timer);
  }, [entrance]);

  useEffect(
    () => () => {
      if (joyfulTimer.current) clearTimeout(joyfulTimer.current);
    },
    [],
  );

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
    !joyful && !tapLine && message.kind !== 'greeting'
      ? HERO_ROUTES[message.kind]
      : null;
  const words = useMemo(() => splitWords(displayText), [displayText]);
  const wordStep = words.length > 0 ? Math.min(90, 850 / words.length) : 0;

  const bubbleBody =
    entrance === 'animate' ? (
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
      <Animated.View
        pointerEvents="none"
        style={[styles.gradientShift, driftStyle]}
      >
        <LinearGradient
          colors={HERO_GRADIENTS[dayPart]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
      </Animated.View>
      {dayPart === 'evening'
        ? STARS.map((star, index) => (
            <View
              key={index}
              pointerEvents="none"
              style={[
                styles.star,
                {
                  top: star.top,
                  left: star.left,
                  width: star.size,
                  height: star.size,
                  borderRadius: star.size / 2,
                },
              ]}
            />
          ))
        : null}

      <View style={styles.row}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${dogName}: tocca per un saluto, tieni premuto per farlo scodinzolare`}
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
            <DogAvatar size={72} photoUri={photoUri} dogName={dogName} />
          </Animated.View>
        </Pressable>

        <View style={styles.bubbleWrap}>
          <View style={styles.tail} />
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
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
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
  star: {
    position: 'absolute',
    backgroundColor: 'rgba(255, 255, 255, 0.75)',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.lg,
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
  bubbleWrap: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
  },
  tail: {
    width: 14,
    height: 14,
    marginRight: -7,
    backgroundColor: colors.surface,
    transform: [{ rotate: '45deg' }],
    borderRadius: 2,
    zIndex: 1,
  },
  bubble: {
    flex: 1,
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
});
