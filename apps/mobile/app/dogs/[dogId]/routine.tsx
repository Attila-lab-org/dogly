import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button, ScreenContainer } from '@/components';
import { StackScreenHeader } from '@/features/secondary/components';
import { useDogProfile } from '@/features/core/useDogProfile';
import { useSession } from '@/features/auth/SessionProvider';
import {
  ACTIVITY_META,
  createDailyActivity,
  deleteDailyActivity,
  formatLocalTime,
  listDailyActivities,
  parseLocalTime,
  type DailyActivityKind,
} from '@/features/routine/api';
import { colors, radius, spacing, typography } from '@/theme/tokens';

const WEEKDAYS = ['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom'];
const KINDS = Object.keys(ACTIVITY_META) as DailyActivityKind[];

function mondayBasedToday(): number {
  return (new Date().getDay() + 6) % 7;
}

function dateForWeekday(weekday: number): Date {
  const today = new Date();
  const current = mondayBasedToday();
  const date = new Date(today);
  date.setDate(today.getDate() + (weekday - current));
  return date;
}

export default function DailyRoutineScreen() {
  const router = useRouter();
  const { dogId = '' } = useLocalSearchParams<{ dogId: string }>();
  const { dog } = useDogProfile();
  const { userId } = useSession();
  const queryClient = useQueryClient();
  const [selectedDay, setSelectedDay] = useState(mondayBasedToday);
  const [composerOpen, setComposerOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [time, setTime] = useState('08:00');
  const [duration, setDuration] = useState('30');
  const [kind, setKind] = useState<DailyActivityKind>('WALK');
  const [error, setError] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<{ id: string; title: string } | null>(null);

  const query = useQuery({
    queryKey: ['daily-activities', dogId, selectedDay],
    queryFn: () => listDailyActivities(dogId, selectedDay),
    enabled: Boolean(dogId && userId),
  });

  const createMutation = useMutation({
    mutationFn: () => {
      const minutes = parseLocalTime(time);
      if (minutes == null) throw new Error('Orario non valido');
      const durationMinutes = duration.trim() ? Number(duration) : null;
      if (durationMinutes != null && (Number.isNaN(durationMinutes) || durationMinutes < 1)) {
        throw new Error('Durata non valida');
      }
      return createDailyActivity(dogId, {
        title: title.trim() || ACTIVITY_META[kind].label,
        activity_kind: kind,
        local_time_minutes: minutes,
        duration_minutes: durationMinutes,
        weekday_mask: 1 << selectedDay,
      });
    },
    onSuccess: async () => {
      setPendingDelete(null);
      setComposerOpen(false);
      setTitle('');
      setError(null);
      await queryClient.invalidateQueries({ queryKey: ['daily-activities', dogId] });
    },
    onError: () => setError('Non sono riuscito a salvare. Riprova.'),
  });

  const removeMutation = useMutation({
    mutationFn: (activityId: string) => deleteDailyActivity(activityId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['daily-activities', dogId] });
    },
    onError: () => setError('Non sono riuscito a rimuovere l’attività. Riprova.'),
  });

  const selectedDate = useMemo(() => dateForWeekday(selectedDay), [selectedDay]);
  const dayLabel = selectedDate.toLocaleDateString('it-IT', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
  const items = query.data?.items ?? [];

  return (
    <ScreenContainer scroll contentStyle={styles.content}>
      <StackScreenHeader title={`La giornata di ${dog.name || '…'}`} />
      <Text style={styles.subtitle}>Organizza passeggiate, pasti e riposo. Puoi cambiare giorno dalla striscia.</Text>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.week}>
        {WEEKDAYS.map((label, index) => {
          const date = dateForWeekday(index);
          const selected = index === selectedDay;
          return (
            <Pressable
              key={label}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              onPress={() => setSelectedDay(index)}
              style={[styles.dayChip, selected && styles.dayChipActive]}
            >
              <Text style={[styles.dayLabel, selected && styles.dayLabelActive]}>{label}</Text>
              <Text style={[styles.dayNumber, selected && styles.dayLabelActive]}>{date.getDate()}</Text>
            </Pressable>
          );
        })}
      </ScrollView>

      <Text style={styles.todayLine}>
        {selectedDay === mondayBasedToday() ? 'Oggi, ' : ''}
        {dayLabel.charAt(0).toUpperCase() + dayLabel.slice(1)}
      </Text>

      {query.isLoading ? (
        <View style={styles.loading}>
          <ActivityIndicator color={colors.primary} />
          <Text style={styles.muted}>Carico la giornata…</Text>
        </View>
      ) : query.isError ? (
        <Pressable onPress={() => void query.refetch()} style={styles.empty}>
          <Text style={styles.emptyTitle}>Non riesco a caricare la routine</Text>
          <Text style={styles.link}>Riprova</Text>
        </Pressable>
      ) : items.length === 0 ? (
        <View style={styles.empty}>
          <View style={styles.emptyIcon}>
            <Ionicons name="sunny-outline" size={28} color={colors.primary} />
          </View>
          <Text style={styles.emptyTitle}>Ancora nessuna attività</Text>
          <Text style={styles.emptyText}>Aggiungi la prima passeggiata o il pasto di {dog.name}.</Text>
        </View>
      ) : (
        <View style={styles.timeline}>
          {items.map((item, index) => {
            const meta = ACTIVITY_META[item.activity_kind];
            return (
              <View key={item.id} style={styles.row}>
                <View style={styles.timeCol}>
                  <Text style={styles.time}>{formatLocalTime(item.local_time_minutes)}</Text>
                  {index < items.length - 1 ? <View style={styles.rail} /> : null}
                </View>
                <View style={[styles.card, { borderLeftColor: meta.color }]}>
                  <View style={[styles.kindIcon, { backgroundColor: meta.soft }]}>
                    <Ionicons name={meta.icon} size={20} color={meta.color} />
                  </View>
                  <View style={styles.cardCopy}>
                    <Text style={styles.cardTitle}>{item.title}</Text>
                    <Text style={styles.cardMeta}>
                      {meta.label}
                      {item.duration_minutes ? ` · ${item.duration_minutes} min` : ''}
                    </Text>
                  </View>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Elimina ${item.title}`}
                    disabled={removeMutation.isPending}
                    onPress={() => setPendingDelete({ id: item.id, title: item.title })}
                    hitSlop={10}
                  >
                    <Ionicons name="trash-outline" size={18} color={colors.textMuted} />
                  </Pressable>
                </View>
              </View>
            );
          })}
        </View>
      )}

      {error && !composerOpen ? <Text style={styles.error}>{error}</Text> : null}

      <Button
        title="Aggiungi attività"
        icon={<Ionicons name="add" size={20} color={colors.textOnPrimary} />}
        onPress={() => {
          setError(null);
          setComposerOpen(true);
        }}
      />
      <Button
        title="Abitudini generali"
        variant="outline"
        onPress={() => router.push(`/dogs/${dogId}/lifestyle` as never)}
      />

      <Modal visible={composerOpen} animationType="slide" transparent onRequestClose={() => setComposerOpen(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Nuova attività</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.kindRow}>
              {KINDS.map((value) => {
                const meta = ACTIVITY_META[value];
                const selected = kind === value;
                return (
                  <Pressable
                    key={value}
                    onPress={() => setKind(value)}
                    style={[styles.kindChip, selected && { backgroundColor: meta.soft, borderColor: meta.color }]}
                  >
                    <Ionicons name={meta.icon} size={16} color={meta.color} />
                    <Text style={styles.kindChipText}>{meta.label}</Text>
                  </Pressable>
                );
              })}
            </ScrollView>
            <TextInput
              value={title}
              onChangeText={setTitle}
              placeholder="Titolo (es. Passeggiata al parco)"
              placeholderTextColor={colors.textMuted}
              style={styles.input}
            />
            <View style={styles.formRow}>
              <TextInput
                value={time}
                onChangeText={setTime}
                placeholder="08:00"
                placeholderTextColor={colors.textMuted}
                style={[styles.input, styles.half]}
              />
              <TextInput
                value={duration}
                onChangeText={setDuration}
                placeholder="Durata min"
                keyboardType="number-pad"
                placeholderTextColor={colors.textMuted}
                style={[styles.input, styles.half]}
              />
            </View>
            {error ? <Text style={styles.error}>{error}</Text> : null}
            <Button
              title="Salva"
              loading={createMutation.isPending}
              onPress={() => createMutation.mutate()}
            />
            <Button title="Annulla" variant="outline" onPress={() => setComposerOpen(false)} />
          </View>
        </View>
      </Modal>
      <Modal visible={pendingDelete !== null} animationType="fade" transparent onRequestClose={() => { if (!removeMutation.isPending) setPendingDelete(null); }}>
        <View style={styles.modalBackdrop}>
          <View style={styles.confirmCard}>
            <Text style={styles.modalTitle}>Rimuovere attività?</Text>
            <Text style={styles.confirmText}>{pendingDelete?.title} verrà tolta dalla giornata.</Text>
            <Button title="Rimuovi attività" loading={removeMutation.isPending} onPress={() => { if (pendingDelete) removeMutation.mutate(pendingDelete.id); }} />
            <Button title="Annulla" variant="outline" disabled={removeMutation.isPending} onPress={() => setPendingDelete(null)} />
          </View>
        </View>
      </Modal>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  content: { gap: spacing.md, paddingBottom: spacing.xxxl },
  subtitle: { color: colors.textSecondary, fontSize: typography.size.sm, lineHeight: 20 },
  week: { gap: 8, paddingVertical: 4 },
  dayChip: {
    width: 54,
    paddingVertical: 10,
    borderRadius: 16,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    gap: 4,
  },
  dayChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  dayLabel: { color: colors.textMuted, fontSize: 11, fontWeight: '600' },
  dayNumber: { color: colors.text, fontSize: 16, fontWeight: '700' },
  dayLabelActive: { color: '#FFFFFF' },
  todayLine: { color: colors.text, fontSize: typography.size.md, fontWeight: '700' },
  loading: { alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.xl },
  muted: { color: colors.textSecondary },
  empty: {
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.xl,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  emptyIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyTitle: { color: colors.text, fontSize: typography.size.md, fontWeight: '700' },
  emptyText: { color: colors.textSecondary, textAlign: 'center', fontSize: typography.size.sm },
  link: { color: colors.primary, fontWeight: '700' },
  timeline: { gap: spacing.md },
  row: { flexDirection: 'row', gap: spacing.sm },
  timeCol: { width: 52, alignItems: 'center' },
  time: { color: colors.text, fontWeight: '700', fontSize: 13 },
  rail: { flex: 1, width: 2, backgroundColor: colors.border, marginTop: 6 },
  card: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: 18,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderLeftWidth: 4,
  },
  kindIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardCopy: { flex: 1, gap: 2 },
  cardTitle: { color: colors.text, fontWeight: '700', fontSize: typography.size.sm },
  cardMeta: { color: colors.textSecondary, fontSize: 12 },
  modalBackdrop: {
    flex: 1,
    backgroundColor: colors.overlay,
    justifyContent: 'flex-end',
  },
  modalCard: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: spacing.lg,
    gap: spacing.md,
  },
  confirmCard: { backgroundColor: colors.surface, borderRadius: 24, padding: spacing.lg, gap: spacing.md, width: '90%', maxWidth: 420, alignSelf: 'center' },
  confirmText: { color: colors.textSecondary, fontSize: typography.size.sm, lineHeight: 20 },
  modalTitle: { fontSize: typography.size.lg, fontWeight: '700', color: colors.text },
  kindRow: { gap: 8 },
  kindChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
  },
  kindChipText: { color: colors.text, fontSize: 12, fontWeight: '600' },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    color: colors.text,
    backgroundColor: colors.background,
  },
  formRow: { flexDirection: 'row', gap: spacing.sm },
  half: { flex: 1 },
  error: { color: colors.danger, fontSize: 13 },
});
