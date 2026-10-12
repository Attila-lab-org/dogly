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
import { isPersistedId } from '../../lib/persistedId';
import { queryKeys } from '../../lib/queryClient';
import { feedingPeriodsMock, foodProductsMock } from '../../mocks/secondary';
import { colors, radius, spacing, typography } from '../../theme/tokens';
import { digestiveSummaryLabel, foodSummary, routineSummary } from './profileSummary';

export function DogCareOverview({ dogId, dogName }: { dogId: string; dogName: string }) {
  const router = useRouter();
  const { userId, usingMockGate } = useSession();
  const enabled = !usingMockGate && isPersistedId(dogId);
  const foods = useQuery({ queryKey: queryKeys.foods(userId ?? 'anon', dogId), queryFn: () => listFoods(dogId), enabled });
  const periods = useQuery({ queryKey: [...queryKeys.foods(userId ?? 'anon', dogId), 'periods'], queryFn: () => listFeedingPeriods(dogId), enabled });
  const digestive = useQuery({ queryKey: ['digestive-summary', dogId], queryFn: () => getDigestiveSummary(dogId), enabled });
  const lifestyle = useLifestyle(dogId);
  useCareEvents(dogId, dogName);
  const careLoading = useCareEventsHydrating(dogId);
  const nextCare = nextCareEvent(dogId);
  const period = periods.data?.find((item) => item.end_at == null);
  const food = foods.data?.find((item) => item.id === period?.food_product_id);
  const demoPeriod = usingMockGate ? feedingPeriodsMock.find((item) => item.endedAt === null) : undefined;
  const foodLabel = usingMockGate
    ? foodSummary(foodProductsMock.find((item) => item.id === demoPeriod?.foodProductId), demoPeriod?.quantityPerDay)
    : foodSummary(food, period?.quantity_per_day);
  const feeding = enabled && (foods.isLoading || periods.isLoading)
    ? 'Carico l’alimento attuale…'
    : enabled && (foods.isError || periods.isError)
      ? 'Non riesco ad aggiornare · Apri per riprovare'
      : foodLabel || lifestyle.profile?.feedingLabel || 'Aggiungi il suo alimento';
  const routine = lifestyle.loading ? 'Carico le abitudini…'
    : lifestyle.error ? 'Non riesco ad aggiornare · Apri per riprovare'
      : routineSummary(lifestyle.profile);
  return (
    <View style={styles.section}>
      <Text style={styles.heading}>Ogni giorno con {dogName}</Text>
      <View style={styles.card}>
        <CareRow icon="nutrition-outline" title="Alimentazione" detail={feeding} onPress={() => router.push('/nutrition/foods')} />
        <CareRow icon="leaf-outline" title="Benessere" detail={digestiveSummaryLabel(digestive.data, enabled && digestive.isLoading, enabled && digestive.isError)} onPress={() => router.push('/digestive' as never)} />
        <CareRow icon="walk-outline" title="Routine" detail={routine} onPress={() => router.push(`/dogs/${dogId}/lifestyle` as never)} />
        <CareRow icon="calendar-outline" title="Agenda" detail={careLoading ? 'Carico gli appuntamenti…' : nextCare ? nextCare.title + ' · ' + relativeCareDate(nextCare.scheduledAt) : 'Apri appuntamenti e promemoria'} onPress={() => router.push('/care' as never)} last />
      </View>
    </View>
  );
}

function CareRow({ icon, title, detail, onPress, last }: {
  icon: keyof typeof Ionicons.glyphMap; title: string; detail: string; onPress: () => void; last?: boolean;
}) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={title + ': ' + detail}
      onPress={onPress} style={({ pressed }) => [styles.row, !last && styles.border, pressed && styles.pressed]}>
      <View style={styles.icon}><Ionicons name={icon} size={22} color={colors.primary} /></View>
      <View style={styles.copy}><Text style={styles.title}>{title}</Text><Text style={styles.detail}>{detail}</Text></View>
      <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  section: { marginBottom: spacing.xl },
  heading: { color: colors.text, fontSize: typography.size.lg, fontWeight: typography.weight.bold, marginBottom: spacing.md },
  card: { borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, overflow: 'hidden' },
  row: { minHeight: 86, padding: spacing.md, flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  border: { borderBottomWidth: 1, borderBottomColor: colors.border },
  icon: { width: 42, height: 42, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primarySoft },
  copy: { flex: 1, gap: 4 },
  title: { color: colors.text, fontSize: typography.size.md, fontWeight: typography.weight.semibold },
  detail: { color: colors.textSecondary, fontSize: typography.size.sm, lineHeight: 20 },
  pressed: { opacity: 0.75 },
});
