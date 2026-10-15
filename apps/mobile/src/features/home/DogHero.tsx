/**
 * Hero Home: card “insight del giorno” (foto + messaggio tip + meteo).
 * I testi restano il mazzo buildHeroTips (dogHeroCopy): passeggiata è solo
 * una delle carte possibili. Tap sulla foto / CTA avanza il mazzo o apre route.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
  type ImageSourcePropType,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { useReducedMotion } from 'react-native-reanimated';
import { colors, radius, shadows, spacing, typography } from '../../theme/tokens';
import { useSession } from '../auth/SessionProvider';
import { isApiConfigured } from '../auth/env';
import { isPersistedId } from '../../lib/persistedId';
import { api } from '../../lib/apiClient';
import { queryKeys } from '../../lib/queryClient';
import { localDayKey } from '../checkin/persistence';
import { useCareEvents } from '../care/store';
import { usePersonalPatterns } from '../patterns/api';
import { useLifestyle } from '../lifestyle/api';
import { listFeedingPeriods, listFoods } from '../nutrition/api';
import { readDeviceLocationResult } from '../places/api';
import { breedTipFor, coatTypeFor } from '../dogs/breedTraits';
import { fetchDiaryPage } from './api';
import {
  JOYFUL_LINE,
  ageYearsFrom,
  buildHeroTips,
  dayPartForHour,
  loadHeroShownDay,
  loadShownTipIds,
  randomAffectionateLine,
  saveHeroShownDay,
  saveShownTipIds,
  shuffleTips,
  type DayPart,
  type HeroWeather,
} from './dogHeroCopy';

const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_DOG_PHOTO: ImageSourcePropType = require('../../../assets/images/rocky-avatar.png');

/** Anelli stile Instagram: ruotano a ogni cambio consiglio per invitare il tap. */
const STORY_RINGS: ReadonlyArray<readonly [string, string, string, string]> = [
  ['#F58529', '#DD2A7B', '#8134AF', '#515BD4'],
  ['#22D3EE', '#2DAAAB', '#0050D8', '#7C3AED'],
  ['#FBBF24', '#F97316', '#EF4444', '#EC4899'],
  ['#34D399', '#14B8A6', '#0EA5E9', '#6366F1'],
];

interface ApiWeatherCurrent {
  temperature_c: number;
  weather_code: number | null;
  wind_speed_kmh: number | null;
  humidity_pct: number | null;
}

function humidityLabel(pct: number | null | undefined): string {
  if (pct == null || Number.isNaN(pct)) return '—';
  if (pct < 40) return 'Bassa';
  if (pct < 70) return 'Media';
  return 'Alta';
}

/** Best-effort finché non c’è Air Quality API: stima da meteo/umidità. */
function airQualityLabel(weather: HeroWeather | null): string {
  if (!weather) return '—';
  const code = weather.weatherCode;
  const humidity = weather.humidityPct ?? 50;
  if (code != null && code >= 45 && code <= 48) return 'Scarsa'; // nebbia
  if (code != null && ((code >= 51 && code <= 67) || (code >= 80 && code <= 82))) {
    return 'Discreta';
  }
  if (code != null && code >= 95) return 'Discreta';
  if (humidity >= 85 && weather.temperatureC >= 28) return 'Media';
  if (humidity <= 55 && (code == null || code <= 3)) return 'Ottima';
  if (humidity <= 70) return 'Buona';
  return 'Media';
}

function dayIcon(dayPart: DayPart): keyof typeof Ionicons.glyphMap {
  if (dayPart === 'morning') return 'sunny';
  if (dayPart === 'afternoon') return 'partly-sunny';
  return 'moon';
}

function startOfLocalDay(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

export function DogHero({
  dogId,
  dogName,
  photoUri,
  breedLabel,
  birthDate,
  ageLabel,
  sizeLabel,
}: {
  dogId: string;
  dogName: string;
  photoUri?: string | null;
  breedLabel?: string | null;
  birthDate?: string | null;
  ageLabel?: string | null;
  sizeLabel?: string | null;
}) {
  const router = useRouter();
  const reducedMotion = useReducedMotion();
  const { userId, usingMockGate } = useSession();
  const careEvents = useCareEvents(dogId, dogName);
  const patternsQuery = usePersonalPatterns(dogId);
  const lifestyle = useLifestyle(dogId);
  const realEnabled =
    Boolean(userId) && isApiConfigured() && !usingMockGate && isPersistedId(dogId);
  const digestiveQuery = useQuery({
    queryKey: [...queryKeys.diary(userId ?? 'anon', dogId), 'hero-last-digestive'],
    queryFn: () => fetchDiaryPage({ dogId, domain: 'DIGESTIVE', limit: 1 }),
    enabled: realEnabled,
  });

  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [locationDenied, setLocationDenied] = useState(false);
  useEffect(() => {
    if (!realEnabled) return;
    let alive = true;
    void readDeviceLocationResult().then((result) => {
      if (!alive) return;
      if (result.ok) setCoords({ lat: result.lat, lng: result.lng });
      else if (result.reason === 'denied') setLocationDenied(true);
    });
    return () => {
      alive = false;
    };
  }, [realEnabled]);

  const weatherQuery = useQuery({
    queryKey: ['hero-weather', coords?.lat ?? 0, coords?.lng ?? 0],
    queryFn: async () => {
      const data = await api.get<ApiWeatherCurrent | undefined>(
        `/v1/weather/current?lat=${coords?.lat}&lng=${coords?.lng}`,
      );
      return data ?? null;
    },
    enabled: realEnabled && coords !== null,
    staleTime: 30 * 60 * 1000,
  });
  const weather: HeroWeather | null = useMemo(
    () =>
      weatherQuery.data
        ? {
            temperatureC: weatherQuery.data.temperature_c,
            weatherCode: weatherQuery.data.weather_code,
            windSpeedKmh: weatherQuery.data.wind_speed_kmh,
            humidityPct: weatherQuery.data.humidity_pct,
          }
        : null,
    [weatherQuery.data],
  );

  const foodsQuery = useQuery({
    queryKey: queryKeys.foods(userId ?? 'anon', dogId),
    queryFn: () => listFoods(dogId),
    enabled: realEnabled,
  });
  const periodsQuery = useQuery({
    queryKey: [...queryKeys.foods(userId ?? 'anon', dogId), 'periods'],
    queryFn: () => listFeedingPeriods(dogId),
    enabled: realEnabled,
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
      .sort(
        (a, b) =>
          Date.parse(b.lastSeen ?? b.firstSeen ?? '') -
          Date.parse(a.lastSeen ?? a.firstSeen ?? ''),
      );
    return visible[0]?.title ?? undefined;
  }, [patternsQuery.live, patternsQuery.isError, patternsQuery.patterns]);

  const daysSinceDigestive = useMemo(() => {
    if (!realEnabled || !digestiveQuery.data) return undefined;
    const last = digestiveQuery.data.items[0];
    if (!last) return null;
    return Math.floor((Date.now() - Date.parse(last.created_at)) / DAY_MS);
  }, [realEnabled, digestiveQuery.data]);

  const breedTip = useMemo(
    () =>
      breedTipFor(breedLabel, dayPart, {
        timeAlone: lifestyle.profile?.timeAlone ?? null,
      }),
    [breedLabel, dayPart, lifestyle.profile],
  );

  const activeFood = useMemo(() => {
    if (!realEnabled || !foodsQuery.data || !periodsQuery.data) return undefined;
    const period = periodsQuery.data.find((item) => item.end_at == null);
    const food = foodsQuery.data.find((item) => item.id === period?.food_product_id);
    const name = [food?.brand, food?.name].filter(Boolean).join(' ').trim();
    return {
      name: name || null,
      months: period
        ? (Date.now() - Date.parse(period.start_at)) / (30.44 * DAY_MS)
        : null,
    };
  }, [realEnabled, foodsQuery.data, periodsQuery.data]);

  const [recentTipIds, setRecentTipIds] = useState<readonly string[]>([]);
  const shownTipsRef = useRef<string[]>([]);
  const lastRecordedTip = useRef<string | null>(null);

  const baseTips = useMemo(
    () =>
      buildHeroTips({
        dogId,
        dayKey: localDayKey(now),
        hour: now.getHours(),
        month: now.getMonth() + 1,
        careHint,
        patternTitle,
        daysSinceDigestive,
        breedTip,
        weather,
        ageYears: ageYearsFrom(birthDate, ageLabel, now),
        smallSize: /piccola|toy|mini|nano/i.test(sizeLabel ?? ''),
        coatType: coatTypeFor(breedLabel),
        recentTipIds,
        locationDenied,
        activeFoodName: activeFood?.name ?? null,
        activeFoodMonths: activeFood?.months ?? null,
        foodDataKnown: activeFood !== undefined,
      }),
    [
      dogId,
      careHint,
      patternTitle,
      daysSinceDigestive,
      breedTip,
      weather,
      birthDate,
      ageLabel,
      sizeLabel,
      breedLabel,
      recentTipIds,
      locationDenied,
      activeFood,
    ],
  );

  const [round, setRound] = useState(0);
  const [tipIndex, setTipIndex] = useState(0);
  const tips = useMemo(() => {
    if (round === 0) return baseTips;
    const urgent = baseTips.filter((tip) => tip.priority === 'urgent');
    const rest = shuffleTips(
      baseTips.filter((tip) => tip.priority === 'normal'),
      Math.random,
    );
    return [...urgent, ...rest];
  }, [baseTips, round]);

  const baseTipIds = baseTips.map((tip) => tip.id).join('|');
  const lastTipIds = useRef(baseTipIds);
  useEffect(() => {
    if (lastTipIds.current === baseTipIds) return;
    lastTipIds.current = baseTipIds;
    setTipIndex(0);
  }, [baseTipIds]);

  const tip = tips[Math.min(tipIndex, Math.max(tips.length - 1, 0))];

  const [tapLine, setTapLine] = useState<string | null>(null);
  const [joyful, setJoyful] = useState(false);

  useEffect(() => {
    let alive = true;
    void loadShownTipIds(dogId).then((ids) => {
      if (!alive) return;
      shownTipsRef.current = ids;
      setRecentTipIds(ids);
    });
    return () => {
      alive = false;
    };
  }, [dogId]);

  useEffect(() => {
    if (!tip || tip.id === lastRecordedTip.current) return;
    lastRecordedTip.current = tip.id;
    shownTipsRef.current = [...shownTipsRef.current, tip.id];
    void saveShownTipIds(shownTipsRef.current, dogId);
  }, [tip, dogId]);

  useEffect(() => {
    let alive = true;
    void loadHeroShownDay(dogId).then((shownDay) => {
      if (!alive) return;
      if (shownDay !== localDayKey() && !reducedMotion) {
        void saveHeroShownDay(localDayKey(), dogId);
      }
    });
    return () => {
      alive = false;
    };
  }, [dogId, reducedMotion]);

  const advanceTip = () => {
    setJoyful(false);
    if (tips.length > 1) {
      setTapLine(null);
      if (tipIndex + 1 >= tips.length) {
        setRound((value) => value + 1);
        setTipIndex(0);
      } else {
        setTipIndex(tipIndex + 1);
      }
      return;
    }
    setTapLine(randomAffectionateLine());
  };

  const openAsk = () => {
    router.push('/ask' as never);
  };

  const onPhotoLongPress = () => {
    setTapLine(null);
    setJoyful(true);
    setTimeout(() => setJoyful(false), 2600);
  };

  if (!tip) return null;

  const headline = joyful ? JOYFUL_LINE : (tapLine ?? tip.dogLine);
  const support = !joyful && !tapLine ? tip.adviceLine : undefined;
  const photoSource = photoUri
    ? ({ uri: photoUri } as const)
    : DEFAULT_DOG_PHOTO;
  const ringColors = STORY_RINGS[tipIndex % STORY_RINGS.length];

  const tempText =
    weather != null ? `${Math.round(weather.temperatureC)}°` : '—';
  const humidityText = humidityLabel(weather?.humidityPct);
  const airText = airQualityLabel(weather);

  return (
    <View style={styles.card}>
      <View style={styles.topRow}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${dogName}: tocca per il prossimo consiglio`}
          onPress={advanceTip}
          onLongPress={onPhotoLongPress}
          delayLongPress={450}
          style={styles.photoHit}
        >
          <LinearGradient
            colors={[...ringColors]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.photoRing}
          >
            <View style={styles.photoInner}>
              <Image
                source={photoSource}
                style={styles.photo}
                resizeMode="cover"
              />
            </View>
          </LinearGradient>
        </Pressable>

        <View style={styles.copy}>
          <View style={styles.eyebrowRow}>
            <Ionicons
              name={dayIcon(dayPart)}
              size={14}
              color={colors.iconHighlight}
            />
            <Text style={styles.eyebrow}>Oggi per {dogName}</Text>
          </View>
          <Text style={styles.headline} numberOfLines={3}>
            {headline}
          </Text>
          {support ? (
            <Text style={styles.support} numberOfLines={3}>
              {support}
            </Text>
          ) : null}
        </View>
      </View>

      <View style={styles.metrics}>
        <Metric
          icon="thermometer-outline"
          iconColor={colors.primaryBright}
          value={tempText}
          label="Temperatura"
        />
        <Metric
          icon="water-outline"
          iconColor={colors.primary}
          value={humidityText}
          label="Umidità"
        />
        <Metric
          icon="leaf-outline"
          iconColor={colors.accent}
          value={airText}
          label="Qualità aria"
        />
      </View>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Parla con DOGly di ${dogName}`}
        onPress={openAsk}
        style={({ pressed }) => [styles.cta, pressed && styles.ctaPressed]}
      >
        <View style={styles.ctaPaw}>
          <Ionicons name="paw" size={14} color="#FFFFFF" />
        </View>
        <Text style={styles.ctaText}>Parla con DOGly</Text>
        <Ionicons name="chevron-forward" size={18} color="#FFFFFF" />
      </Pressable>
    </View>
  );
}

function Metric({
  icon,
  iconColor,
  value,
  label,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  iconColor: string;
  value: string;
  label: string;
}) {
  return (
    <View style={styles.metric}>
      <View style={styles.metricTop}>
        <Ionicons name={icon} size={16} color={iconColor} />
        <Text style={styles.metricValue}>{value}</Text>
      </View>
      <Text style={styles.metricLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadows.card,
  },
  topRow: {
    flexDirection: 'row',
    gap: spacing.md,
    alignItems: 'flex-start',
  },
  photoHit: {
    width: 122,
    height: 142,
  },
  photoRing: {
    width: 122,
    height: 142,
    borderRadius: 26,
    padding: 3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoInner: {
    width: '100%',
    height: '100%',
    borderRadius: 23,
    overflow: 'hidden',
    backgroundColor: colors.surfaceMuted,
    borderWidth: 2,
    borderColor: colors.surface,
  },
  photo: {
    width: '100%',
    height: '100%',
  },
  copy: {
    flex: 1,
    minWidth: 0,
    gap: 6,
    paddingTop: 2,
  },
  eyebrowRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  eyebrow: {
    color: colors.textSecondary,
    fontSize: typography.size.sm,
    fontWeight: typography.weight.medium,
  },
  headline: {
    color: colors.text,
    fontSize: 20,
    lineHeight: 26,
    fontWeight: typography.weight.bold,
  },
  support: {
    color: colors.textSecondary,
    fontSize: typography.size.sm,
    lineHeight: 20,
  },
  metrics: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: spacing.sm,
    paddingHorizontal: 2,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceMuted,
  },
  metric: {
    flex: 1,
    gap: 2,
    paddingHorizontal: spacing.xs,
  },
  metricTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  metricValue: {
    color: colors.text,
    fontSize: typography.size.md,
    fontWeight: typography.weight.bold,
  },
  metricLabel: {
    color: colors.textMuted,
    fontSize: 11,
    marginLeft: 21,
  },
  cta: {
    minHeight: 52,
    borderRadius: 999,
    backgroundColor: colors.primary,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    gap: spacing.sm,
  },
  ctaPressed: { opacity: 0.88 },
  ctaPaw: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaText: {
    flex: 1,
    color: colors.textOnPrimary,
    fontSize: typography.size.md,
    fontWeight: typography.weight.bold,
  },
});
