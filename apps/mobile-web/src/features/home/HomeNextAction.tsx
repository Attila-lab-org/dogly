/**
 * Una sola azione contestuale sulla Home (agenda entro 7gg o gap alimento).
 * Se non c’è nulla di utile → non renderizza niente.
 */
import React, { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { useSession } from '@/features/auth/SessionProvider';
import {
  nextCareEvent,
  useCareEvents,
  useCareEventsHydrating,
} from '@/features/care/store';
import { dayDistance, relativeCareDate } from '@/features/care/date';
import { listFeedingPeriods, listFoods } from '@/features/nutrition/api';
import { isPersistedId } from '@/lib/persistedId';
import { queryKeys } from '@/lib/queryClient';
import { feedingPeriodsMock, foodProductsMock } from '@/mocks/secondary';
import { foodSummary } from '@/features/dogs/profileSummary';
import { colors, spacing, typography } from '@/theme/tokens';

const CARE_WINDOW_DAYS = 7;

type NextAction = {
  key: string;
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  detail: string;
  href: string;
  tone: 'care' | 'food';
};

export function HomeNextAction({
  dogId,
  dogName,
}: {
  dogId: string;
  dogName: string;
}) {
  const router = useRouter();
  const { userId, usingMockGate } = useSession();
  const enabled = !usingMockGate && isPersistedId(dogId);

  useCareEvents(dogId, dogName);
  const careLoading = useCareEventsHydrating(dogId);
  const nextCare = nextCareEvent(dogId);

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

  const action = useMemo<NextAction | null>(() => {
    if (!careLoading && nextCare) {
      const distance = dayDistance(nextCare.scheduledAt);
      if (distance >= 0 && distance <= CARE_WINDOW_DAYS) {
        return {
          key: `care-${nextCare.id}`,
          icon: 'calendar-outline',
          title: nextCare.title,
          detail: relativeCareDate(nextCare.scheduledAt),
          href: '/care',
          tone: 'care',
        };
      }
    }

    if (usingMockGate) {
      const demoPeriod = feedingPeriodsMock.find((item) => item.endedAt === null);
      const label = foodSummary(
        foodProductsMock.find((item) => item.id === demoPeriod?.foodProductId),
        demoPeriod?.quantityPerDay,
      );
      if (!label) {
        return {
          key: 'food-gap',
          icon: 'nutrition-outline',
          title: `Aggiungi l’alimento di ${dogName}`,
          detail: 'Così teniamo traccia della pappa.',
          href: '/nutrition/foods',
          tone: 'food',
        };
      }
      return null;
    }

    if (!enabled) return null;
    if (foods.isLoading || periods.isLoading) return null;
    if (foods.isError || periods.isError) return null;

    const period = periods.data?.find((item) => item.end_at == null);
    const food = foods.data?.find((item) => item.id === period?.food_product_id);
    const label = foodSummary(food, period?.quantity_per_day);
    if (!label) {
      return {
        key: 'food-gap',
        icon: 'nutrition-outline',
        title: `Aggiungi l’alimento di ${dogName}`,
        detail: 'Così teniamo traccia della pappa.',
        href: '/nutrition/foods',
        tone: 'food',
      };
    }
    return null;
  }, [
    careLoading,
    dogName,
    enabled,
    foods.data,
    foods.isError,
    foods.isLoading,
    nextCare,
    periods.data,
    periods.isError,
    periods.isLoading,
    usingMockGate,
  ]);

  if (!action) return null;

  const palette =
    action.tone === 'care'
      ? { bg: '#F6F3FF', iconBg: '#EEE5FF', icon: '#8650CC' }
      : { bg: '#FFF5F1', iconBg: '#FFEBDD', icon: '#ED752B' };

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${action.title}. ${action.detail}`}
      onPress={() => router.push(action.href as never)}
      style={({ pressed }) => [
        styles.row,
        { backgroundColor: palette.bg },
        pressed && styles.pressed,
      ]}
    >
      <View style={[styles.iconWrap, { backgroundColor: palette.iconBg }]}>
        <Ionicons name={action.icon} size={22} color={palette.icon} />
      </View>
      <View style={styles.copy}>
        <Text style={styles.eyebrow}>OGGI</Text>
        <Text style={styles.title} numberOfLines={1}>
          {action.title}
        </Text>
        <Text style={styles.detail} numberOfLines={1}>
          {action.detail}
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    borderRadius: 20,
  },
  iconWrap: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  copy: { flex: 1, gap: 2, minWidth: 0 },
  eyebrow: {
    color: colors.textMuted,
    fontSize: 10,
    fontWeight: typography.weight.bold,
    letterSpacing: 0.8,
  },
  title: {
    color: colors.text,
    fontSize: typography.size.md,
    fontWeight: typography.weight.bold,
  },
  detail: {
    color: colors.textSecondary,
    fontSize: typography.size.sm,
  },
  pressed: { opacity: 0.84 },
});
