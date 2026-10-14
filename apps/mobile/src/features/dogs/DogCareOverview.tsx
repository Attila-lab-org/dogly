import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
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
import { colors, radius, spacing, typography } from '../../theme/tokens';
import { digestiveSummaryLabel, foodSummary, routineSummary } from './profileSummary';

export function DogCareOverview({
  dogId,
  dogName,
  compact = false,
}: {
  dogId: string;
  dogName: string;
  compact?: boolean;
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
      {!compact ? (
        <Text style={styles.heading}>Ogni giorno con {dogName}</Text>
      ) : null}
      <View style={styles.card}>
        <CareRow
          compact={compact}
          tone="food"
          icon="nutrition-outline"
          title="Alimentazione"
          detail={feeding}
          onPress={() => router.push('/nutrition/foods')}
        />
        <CareRow
          compact={compact}
          tone="wellness"
          icon="heart-outline"
          title={compact ? 'Benessere' : 'Digestione'}
          detail={digestiveSummaryLabel(
            digestive.data,
            enabled && digestive.isLoading,
            enabled && digestive.isError,
          )}
          onPress={() => router.push('/digestive' as never)}
        />
        <CareRow
          compact={compact}
          tone="routine"
          icon="walk-outline"
          title="Routine"
          detail={routineDetail}
          onPress={() => router.push(`/dogs/${dogId}/routine` as never)}
        />
        <CareRow
          compact={compact}
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
  food: { background: '#FFF5F1', icon: '#ED752B', soft: '#FFEBDD' },
  wellness: { background: '#F0FAF6', icon: '#079D78', soft: '#DDF6EA' },
  routine: { background: '#F1F8FF', icon: '#0077D8', soft: '#E1F1FF' },
  agenda: { background: '#F6F3FF', icon: '#8650CC', soft: '#EEE5FF' },
} as const;

function CareRow({
  icon,
  title,
  detail,
  onPress,
  compact,
  tone,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  detail: string;
  onPress: () => void;
  compact: boolean;
  tone: keyof typeof tones;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${title}: ${detail}`}
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        compact && { backgroundColor: tones[tone].background },
        pressed && styles.pressed,
      ]}
    >
      <View style={[styles.icon, { backgroundColor: tones[tone].soft }]}>
        <Ionicons name={icon} size={24} color={tones[tone].icon} />
      </View>
      <Text style={styles.title} numberOfLines={1}>
        {title}
      </Text>
    </Pressable>
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
  row: {
    width: '48%',
    flexGrow: 1,
    minHeight: 108,
    padding: 14,
    alignItems: 'flex-start',
    gap: 10,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
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
  pressed: { opacity: 0.78 },
});
