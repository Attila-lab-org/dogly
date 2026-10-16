import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Circle, Ellipse, Path, Rect } from 'react-native-svg';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { useSession } from '../auth/SessionProvider';
import { useCareEvents, useCareEventsHydrating, nextCareEvent } from '../care/store';
import { relativeCareDate } from '../care/date';
import { useLifestyle } from '../lifestyle/api';
import { listFoods, listFeedingPeriods } from '../nutrition/api';
import { getDigestiveSummary } from '../digestive/api';
import { listDailyActivities } from '../routine/api';
import { isPersistedId } from '../../lib/persistedId';
import { queryKeys } from '../../lib/queryClient';
import { feedingPeriodsMock, foodProductsMock } from '../../mocks/secondary';
import { colors, radius, shadows, spacing, typography } from '../../theme/tokens';
import { usePressSpring } from '../../components/pressSpring';
import Animated from 'react-native-reanimated';
import { digestiveSummaryLabel, foodSummary, routineSummary } from './profileSummary';

/** Hub cura sul profilo cane (Oreo) — non usare in Home. */
export function DogCareOverview({
  dogId,
  dogName,
}: {
  dogId: string;
  dogName: string;
}) {
  const router = useRouter();
  const { userId, usingMockGate } = useSession();
  const enabled = !usingMockGate && isPersistedId(dogId);
  const foods = useQuery({
    queryKey: queryKeys.foods(userId ?? 'anon', dogId),
    queryFn: () => listFoods(dogId),
    enabled,
  });
  const periods = useQuery({
    queryKey: [...queryKeys.foods(userId ?? 'anon', dogId), 'periods'],
    queryFn: () => listFeedingPeriods(dogId),
    enabled,
  });
  const digestive = useQuery({
    queryKey: ['digestive-summary', dogId],
    queryFn: () => getDigestiveSummary(dogId),
    enabled,
  });
  const lifestyle = useLifestyle(dogId);
  const weekday = (new Date().getDay() + 6) % 7;
  const daily = useQuery({
    queryKey: ['daily-activities', dogId, weekday],
    queryFn: () => listDailyActivities(dogId, weekday),
    enabled,
  });
  useCareEvents(dogId, dogName);
  const careLoading = useCareEventsHydrating(dogId);
  const nextCare = nextCareEvent(dogId);
  const period = periods.data?.find((item) => item.end_at == null);
  const food = foods.data?.find((item) => item.id === period?.food_product_id);
  const demoPeriod = usingMockGate
    ? feedingPeriodsMock.find((item) => item.endedAt === null)
    : undefined;
  const foodLabel = usingMockGate
    ? foodSummary(
        foodProductsMock.find((item) => item.id === demoPeriod?.foodProductId),
        demoPeriod?.quantityPerDay,
      )
    : foodSummary(food, period?.quantity_per_day);
  const feeding =
    enabled && (foods.isLoading || periods.isLoading)
      ? 'Carico l’alimento attuale…'
      : enabled && (foods.isError || periods.isError)
        ? 'Non riesco ad aggiornare · Apri per riprovare'
        : foodLabel || lifestyle.profile?.feedingLabel || 'Aggiungi il suo alimento';
  const activityCount = daily.data?.items.length ?? 0;
  const routineDetail = daily.isLoading
    ? 'Carico la giornata…'
    : daily.isError
      ? 'Apri la giornata'
      : activityCount > 0
        ? `${activityCount} ${activityCount === 1 ? 'attività oggi' : 'attività oggi'}`
        : routineSummary(lifestyle.profile) || 'Giornata e abitudini';

  return (
    <View style={styles.section}>
      <Text style={styles.heading}>Ogni giorno con {dogName}</Text>
      <View style={styles.card}>
        <CareRow
          tone="food"
          icon="nutrition-outline"
          title="Alimentazione"
          detail={feeding}
          onPress={() => router.push('/nutrition/foods')}
        />
        <CareRow
          tone="wellness"
          icon="heart-outline"
          title="Digestione"
          detail={digestiveSummaryLabel(
            digestive.data,
            enabled && digestive.isLoading,
            enabled && digestive.isError,
          )}
          onPress={() => router.push('/digestive' as never)}
        />
        <CareRow
          tone="routine"
          icon="walk-outline"
          title="Giornata"
          detail={routineDetail}
          onPress={() => router.push(`/dogs/${dogId}/routine` as never)}
        />
        <CareRow
          tone="agenda"
          icon="calendar-outline"
          title="Agenda"
          detail={
            careLoading
              ? 'Carico gli appuntamenti…'
              : nextCare
                ? `${nextCare.title} · ${relativeCareDate(nextCare.scheduledAt)}`
                : 'Prossimi appuntamenti'
          }
          onPress={() => router.push('/care' as never)}
        />
      </View>
    </View>
  );
}

const tones = {
  food: { background: '#FFF5F1', icon: '#ED752B', soft: '#FFEBDD', border: '#FFD9CA' },
  wellness: { background: '#F0FAF6', icon: '#079D78', soft: '#DDF6EA', border: '#C8EEDF' },
  routine: { background: '#F1F8FF', icon: '#0077D8', soft: '#E1F1FF', border: '#CFE7FF' },
  agenda: { background: '#F6F3FF', icon: '#8650CC', soft: '#EEE5FF', border: '#E1D5FF' },
} as const;

/** Oggetti di scena del mondo cura: riconoscibili al primo sguardo e senza mascotte. */
function CareArt({ tone, color }: { tone: keyof typeof tones; color: string }) {
  if (tone === 'food') {
    return (
      <Svg width={86} height={78} viewBox="0 0 86 78" style={styles.art} accessible={false}>
        <Ellipse cx="44" cy="59" rx="26" ry="7" fill={color} opacity={0.24} />
        <Path d="M20 36 C22 60 64 60 68 36 Z" fill={color} opacity={0.17} />
        <Path d="M18 35 C27 29 58 29 70 35 C61 42 28 42 18 35 Z" fill={color} opacity={0.3} />
        <Circle cx="34" cy="32" r="4" fill={color} opacity={0.3} />
        <Circle cx="49" cy="27" r="3" fill={color} opacity={0.27} />
        <Circle cx="58" cy="34" r="3.5" fill={color} opacity={0.24} />
      </Svg>
    );
  }
  if (tone === 'wellness') {
    return (
      <Svg width={86} height={78} viewBox="0 0 86 78" style={styles.art} accessible={false}>
        <Path d="M42 61 C41 45 46 30 60 20" stroke={color} strokeWidth={3} strokeLinecap="round" opacity={0.22} fill="none" />
        <Ellipse cx="51" cy="32" rx="18" ry="8" fill={color} opacity={0.2} transform="rotate(-32 51 32)" />
        <Ellipse cx="36" cy="42" rx="15" ry="7" fill={color} opacity={0.15} transform="rotate(26 36 42)" />
        <Path d="M65 45 C65 37 76 37 76 45 C76 52 66 58 66 58 C66 58 55 52 55 45 C55 37 65 37 65 45 Z" fill={color} opacity={0.14} />
      </Svg>
    );
  }
  if (tone === 'routine') {
    return (
      <Svg width={86} height={78} viewBox="0 0 86 78" style={styles.art} accessible={false}>
        <Path d="M12 62 C26 48 39 53 45 42 C52 29 62 34 75 18" stroke={color} strokeWidth={5} strokeLinecap="round" opacity={0.18} fill="none" />
        <Circle cx="26" cy="26" r="9" fill={color} opacity={0.16} />
        <Circle cx="26" cy="26" r="3" fill={color} opacity={0.3} />
        <Circle cx="67" cy="59" r="5" fill={color} opacity={0.26} />
      </Svg>
    );
  }
  return (
    <Svg width={86} height={78} viewBox="0 0 86 78" style={styles.art} accessible={false}>
      <Rect x="16" y="20" width="51" height="42" rx="9" fill={color} opacity={0.14} />
      <Path d="M16 34 H67" stroke={color} strokeWidth={3} opacity={0.22} />
      <Path d="M29 14 V26 M55 14 V26" stroke={color} strokeWidth={4} strokeLinecap="round" opacity={0.23} />
      <Circle cx="31" cy="46" r="3" fill={color} opacity={0.25} />
      <Circle cx="44" cy="46" r="3" fill={color} opacity={0.25} />
      <Circle cx="57" cy="46" r="3" fill={color} opacity={0.25} />
    </Svg>
  );
}

function CareRow({
  icon,
  title,
  detail,
  onPress,
  tone,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  detail: string;
  onPress: () => void;
  tone: keyof typeof tones;
}) {
  const press = usePressSpring();
  return (
    <Animated.View style={[press.style, styles.rowWrap]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${title}: ${detail}`}
        onPress={onPress}
        onPressIn={press.onPressIn}
        onPressOut={press.onPressOut}
        style={({ pressed }) => [
          styles.row,
          { borderColor: tones[tone].border },
          pressed && styles.pressed,
        ]}
      >
        <LinearGradient
          colors={[tones[tone].background, colors.surface]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
        <CareArt tone={tone} color={tones[tone].icon} />
        <View style={[styles.icon, { backgroundColor: tones[tone].soft }]}>
          <Ionicons name={icon} size={24} color={tones[tone].icon} />
        </View>
        <Text style={styles.title} numberOfLines={1}>
          {title}
        </Text>
        <Text style={styles.detail} numberOfLines={2}>
          {detail}
        </Text>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  section: { marginBottom: spacing.sm },
  heading: {
    color: colors.text,
    fontSize: typography.size.lg,
    fontWeight: typography.weight.bold,
    marginBottom: spacing.md,
  },
  card: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  rowWrap: { width: '48%', flexGrow: 1 },
  row: {
    width: '100%',
    minHeight: 132,
    padding: 14,
    alignItems: 'flex-start',
    gap: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
    ...shadows.card,
  },
  art: { position: 'absolute', right: -7, top: -6 },
  icon: {
    width: 44,
    height: 44,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    alignSelf: 'stretch',
    color: colors.text,
    fontSize: 14,
    fontWeight: typography.weight.semibold,
  },
  detail: {
    alignSelf: 'stretch',
    color: colors.textSecondary,
    fontSize: 12,
    lineHeight: 16,
  },
  pressed: { opacity: 0.78 },
});
