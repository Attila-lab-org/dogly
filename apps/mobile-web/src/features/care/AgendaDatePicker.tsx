import React, { useMemo, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius, spacing, typography } from '../../theme/tokens';
import {
  MONTH_NAMES,
  parseIsoDate,
  toIsoDate,
} from '../dogs/profileDates';
import { formatDateKey } from './date';

export function AgendaDatePicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const parsed = parseIsoDate(value);
  const [open, setOpen] = useState(false);
  const [visibleMonth, setVisibleMonth] = useState(
    parsed
      ? new Date(parsed.year, parsed.month - 1, 1)
      : new Date(new Date().getFullYear(), new Date().getMonth(), 1),
  );
  const days = useMemo(() => daysForCalendar(visibleMonth), [visibleMonth]);
  const today = startOfDay(new Date());
  const lastMonth = new Date(today.getFullYear() + 2, today.getMonth(), 1);
  const previousDisabled =
    visibleMonth.getFullYear() === today.getFullYear() &&
    visibleMonth.getMonth() === today.getMonth();
  const nextDisabled = visibleMonth >= lastMonth;

  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Data: ${formatDateKey(value)}`}
        onPress={() => setOpen(true)}
        style={({ pressed }) => [
          styles.field,
          pressed && styles.fieldPressed,
        ]}
      >
        <View style={styles.fieldIcon}>
          <Ionicons name="calendar-outline" size={19} color={colors.primary} />
        </View>
        <Text style={styles.fieldText}>{formatDateKey(value)}</Text>
        <Ionicons name="chevron-down" size={20} color={colors.textMuted} />
      </Pressable>

      <Modal
        visible={open}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setOpen(false)}
      >
        <SafeAreaView style={styles.modal}>
          <View style={styles.header}>
            <Text style={styles.title}>Scegli la data</Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Chiudi"
              onPress={() => setOpen(false)}
              style={styles.close}
            >
              <Ionicons name="close" size={25} color={colors.text} />
            </Pressable>
          </View>

          <View style={styles.monthHeader}>
            <MonthButton
              icon="chevron-back"
              disabled={previousDisabled}
              onPress={() =>
                setVisibleMonth(
                  new Date(
                    visibleMonth.getFullYear(),
                    visibleMonth.getMonth() - 1,
                    1,
                  ),
                )
              }
            />
            <Text style={styles.monthTitle}>
              {capitalize(MONTH_NAMES[visibleMonth.getMonth()])}{' '}
              {visibleMonth.getFullYear()}
            </Text>
            <MonthButton
              icon="chevron-forward"
              disabled={nextDisabled}
              onPress={() =>
                setVisibleMonth(
                  new Date(
                    visibleMonth.getFullYear(),
                    visibleMonth.getMonth() + 1,
                    1,
                  ),
                )
              }
            />
          </View>

          <View style={styles.weekRow}>
            {['L', 'M', 'M', 'G', 'V', 'S', 'D'].map((day, index) => (
              <Text key={`${day}-${index}`} style={styles.weekDay}>
                {day}
              </Text>
            ))}
          </View>

          <View style={styles.calendar}>
            {days.map((day, index) => {
              if (!day) return <View key={`empty-${index}`} style={styles.day} />;
              const candidate = new Date(
                visibleMonth.getFullYear(),
                visibleMonth.getMonth(),
                day,
              );
              const disabled = startOfDay(candidate) < today;
              const selected =
                parsed?.year === visibleMonth.getFullYear() &&
                parsed.month === visibleMonth.getMonth() + 1 &&
                parsed.day === day;
              return (
                <Pressable
                  key={day}
                  accessibilityRole="button"
                  accessibilityState={{ selected, disabled }}
                  disabled={disabled}
                  onPress={() => {
                    onChange(
                      toIsoDate(
                        visibleMonth.getFullYear(),
                        visibleMonth.getMonth(),
                        day,
                      ),
                    );
                    setOpen(false);
                  }}
                  style={[styles.day, selected && styles.daySelected]}
                >
                  <Text
                    style={[
                      styles.dayText,
                      disabled && styles.dayTextDisabled,
                      selected && styles.dayTextSelected,
                    ]}
                  >
                    {day}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </SafeAreaView>
      </Modal>
    </>
  );
}

function MonthButton({
  icon,
  disabled,
  onPress,
}: {
  icon: 'chevron-back' | 'chevron-forward';
  disabled: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={styles.monthArrow}
    >
      <Ionicons
        name={icon}
        size={23}
        color={disabled ? colors.textMuted : colors.text}
      />
    </Pressable>
  );
}

function daysForCalendar(month: Date): Array<number | null> {
  const firstWeekday =
    (new Date(month.getFullYear(), month.getMonth(), 1).getDay() + 6) % 7;
  const daysInMonth = new Date(
    month.getFullYear(),
    month.getMonth() + 1,
    0,
  ).getDate();
  const cells: Array<number | null> = Array(firstWeekday).fill(null);
  for (let day = 1; day <= daysInMonth; day += 1) cells.push(day);
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function capitalize(value: string): string {
  return `${value[0].toUpperCase()}${value.slice(1)}`;
}

const styles = StyleSheet.create({
  field: {
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
  },
  fieldPressed: {
    borderColor: colors.primary,
  },
  fieldIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primarySoft,
  },
  fieldText: {
    flex: 1,
    color: colors.text,
    fontSize: typography.size.md,
    fontWeight: typography.weight.medium,
  },
  modal: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    minHeight: 64,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
  },
  title: {
    color: colors.text,
    fontSize: typography.size.xl,
    fontWeight: typography.weight.bold,
  },
  close: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  monthHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    marginTop: spacing.lg,
    marginBottom: spacing.md,
  },
  monthArrow: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  monthTitle: {
    color: colors.text,
    fontSize: typography.size.lg,
    fontWeight: typography.weight.bold,
  },
  weekRow: {
    flexDirection: 'row',
    paddingHorizontal: spacing.lg,
  },
  weekDay: {
    width: '14.2857%',
    color: colors.textMuted,
    fontSize: typography.size.xs,
    fontWeight: typography.weight.semibold,
    textAlign: 'center',
  },
  calendar: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: spacing.lg,
    marginTop: spacing.sm,
  },
  day: {
    width: '14.2857%',
    aspectRatio: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.full,
  },
  daySelected: {
    backgroundColor: colors.primary,
  },
  dayText: {
    color: colors.text,
    fontSize: typography.size.sm,
    fontWeight: typography.weight.medium,
  },
  dayTextDisabled: {
    color: colors.border,
  },
  dayTextSelected: {
    color: colors.textOnPrimary,
    fontWeight: typography.weight.bold,
  },
});
