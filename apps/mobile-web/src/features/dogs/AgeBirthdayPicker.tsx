import React, { useMemo, useState } from 'react';
import {
  FlatList,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius, spacing, typography } from '../../theme/tokens';
import {
  ageLabelFromYears,
  DOG_AGE_OPTIONS,
  formatBirthday,
  MONTH_NAMES,
  parseIsoDate,
  toIsoDate,
} from './profileDates';

export function AgePicker({
  value,
  onChange,
  testID,
}: {
  value: number | null;
  onChange: (years: number) => void;
  testID?: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <PickerField
        icon="hourglass-outline"
        label={value === null ? 'Seleziona l’età' : ageLabelFromYears(value)}
        placeholder={value === null}
        onPress={() => setOpen(true)}
        testID={testID}
      />
      <Modal
        visible={open}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setOpen(false)}
      >
        <SafeAreaView style={styles.modal}>
          <ModalHeader title="Quanti anni ha?" onClose={() => setOpen(false)} />
          <FlatList
            data={DOG_AGE_OPTIONS}
            keyExtractor={(years) => String(years)}
            contentContainerStyle={styles.ageList}
            renderItem={({ item }) => (
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ selected: value === item }}
                onPress={() => {
                  onChange(item);
                  setOpen(false);
                }}
                style={[
                  styles.ageRow,
                  value === item && styles.ageRowSelected,
                ]}
              >
                <Text
                  style={[
                    styles.ageText,
                    value === item && styles.ageTextSelected,
                  ]}
                >
                  {ageLabelFromYears(item)}
                </Text>
                {value === item ? (
                  <Ionicons
                    name="checkmark-circle"
                    size={22}
                    color={colors.primary}
                  />
                ) : null}
              </Pressable>
            )}
          />
        </SafeAreaView>
      </Modal>
    </>
  );
}

export function BirthdayPicker({
  value,
  ageYears,
  onChange,
  testID,
}: {
  value: string | null;
  ageYears: number | null;
  onChange: (birthDate: string | null) => void;
  testID?: string;
}) {
  const today = new Date();
  const [open, setOpen] = useState(false);
  const [visibleMonth, setVisibleMonth] = useState(
    initialVisibleMonth(value, ageYears, today),
  );
  const parsedValue = value ? parseIsoDate(value) : null;
  const yearOptions = useMemo(
    () => Array.from({ length: 31 }, (_, index) => today.getFullYear() - index),
    [today.getFullYear()],
  );
  const calendarDays = useMemo(
    () => daysForCalendar(visibleMonth),
    [visibleMonth],
  );
  const currentMonthReached =
    visibleMonth.getFullYear() === today.getFullYear() &&
    visibleMonth.getMonth() === today.getMonth();

  const openCalendar = () => {
    setVisibleMonth(initialVisibleMonth(value, ageYears, today));
    setOpen(true);
  };

  return (
    <>
      <PickerField
        icon="gift-outline"
        label={value ? formatBirthday(value) : 'Aggiungi il compleanno'}
        placeholder={!value}
        onPress={openCalendar}
        testID={testID}
      />
      <Modal
        visible={open}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setOpen(false)}
      >
        <SafeAreaView style={styles.modal}>
          <ModalHeader title="Compleanno" onClose={() => setOpen(false)} />

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.years}
          >
            {yearOptions.map((year) => (
              <Pressable
                key={year}
                accessibilityRole="button"
                accessibilityState={{
                  selected: visibleMonth.getFullYear() === year,
                }}
                onPress={() =>
                  setVisibleMonth(
                    new Date(year, visibleMonth.getMonth(), 1),
                  )
                }
                style={[
                  styles.yearChip,
                  visibleMonth.getFullYear() === year &&
                    styles.yearChipSelected,
                ]}
              >
                <Text
                  style={[
                    styles.yearText,
                    visibleMonth.getFullYear() === year &&
                      styles.yearTextSelected,
                  ]}
                >
                  {year}
                </Text>
              </Pressable>
            ))}
          </ScrollView>

          <View style={styles.monthHeader}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Mese precedente"
              onPress={() =>
                setVisibleMonth(
                  new Date(
                    visibleMonth.getFullYear(),
                    visibleMonth.getMonth() - 1,
                    1,
                  ),
                )
              }
              style={styles.monthArrow}
            >
              <Ionicons name="chevron-back" size={23} color={colors.text} />
            </Pressable>
            <Text style={styles.monthTitle}>
              {capitalize(MONTH_NAMES[visibleMonth.getMonth()])}
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Mese successivo"
              accessibilityState={{ disabled: currentMonthReached }}
              disabled={currentMonthReached}
              onPress={() =>
                setVisibleMonth(
                  new Date(
                    visibleMonth.getFullYear(),
                    visibleMonth.getMonth() + 1,
                    1,
                  ),
                )
              }
              style={styles.monthArrow}
            >
              <Ionicons
                name="chevron-forward"
                size={23}
                color={
                  currentMonthReached ? colors.textMuted : colors.text
                }
              />
            </Pressable>
          </View>

          <View style={styles.weekRow}>
            {['L', 'M', 'M', 'G', 'V', 'S', 'D'].map((day, index) => (
              <Text key={`${day}-${index}`} style={styles.weekDay}>
                {day}
              </Text>
            ))}
          </View>

          <View style={styles.calendar}>
            {calendarDays.map((day, index) => {
              if (!day) return <View key={`empty-${index}`} style={styles.day} />;
              const candidate = new Date(
                visibleMonth.getFullYear(),
                visibleMonth.getMonth(),
                day,
              );
              const future = candidate > endOfToday(today);
              const selected =
                parsedValue?.year === visibleMonth.getFullYear() &&
                parsedValue.month === visibleMonth.getMonth() + 1 &&
                parsedValue.day === day;
              return (
                <Pressable
                  key={day}
                  accessibilityRole="button"
                  accessibilityLabel={`${day} ${MONTH_NAMES[visibleMonth.getMonth()]}`}
                  accessibilityState={{ selected, disabled: future }}
                  disabled={future}
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
                      future && styles.dayTextDisabled,
                      selected && styles.dayTextSelected,
                    ]}
                  >
                    {day}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {value ? (
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                onChange(null);
                setOpen(false);
              }}
              style={styles.clearDate}
            >
              <Text style={styles.clearDateText}>Non ricordo la data</Text>
            </Pressable>
          ) : null}
        </SafeAreaView>
      </Modal>
    </>
  );
}

function PickerField({
  icon,
  label,
  placeholder,
  onPress,
  testID,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  placeholder: boolean;
  onPress: () => void;
  testID?: string;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      testID={testID}
      style={({ pressed }) => [
        styles.field,
        pressed && styles.fieldPressed,
      ]}
    >
      <View style={styles.fieldIcon}>
        <Ionicons name={icon} size={19} color={colors.accent} />
      </View>
      <Text
        style={[styles.fieldText, placeholder && styles.fieldPlaceholder]}
        numberOfLines={1}
      >
        {label}
      </Text>
      <Ionicons name="chevron-down" size={20} color={colors.textMuted} />
    </Pressable>
  );
}

function ModalHeader({
  title,
  onClose,
}: {
  title: string;
  onClose: () => void;
}) {
  return (
    <View style={styles.header}>
      <Text style={styles.title}>{title}</Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Chiudi"
        onPress={onClose}
        hitSlop={12}
        style={styles.close}
      >
        <Ionicons name="close" size={25} color={colors.text} />
      </Pressable>
    </View>
  );
}

function initialVisibleMonth(
  value: string | null,
  ageYears: number | null,
  today: Date,
): Date {
  const parsed = value ? parseIsoDate(value) : null;
  if (parsed) return new Date(parsed.year, parsed.month - 1, 1);
  return new Date(today.getFullYear() - (ageYears ?? 0), today.getMonth(), 1);
}

function daysForCalendar(month: Date): Array<number | null> {
  const firstWeekday = (new Date(month.getFullYear(), month.getMonth(), 1).getDay() + 6) % 7;
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

function endOfToday(today: Date): Date {
  return new Date(
    today.getFullYear(),
    today.getMonth(),
    today.getDate(),
    23,
    59,
    59,
  );
}

function capitalize(value: string): string {
  return `${value[0].toUpperCase()}${value.slice(1)}`;
}

const styles = StyleSheet.create({
  field: {
    minHeight: 54,
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
    backgroundColor: colors.accentSoft,
  },
  fieldText: {
    flex: 1,
    color: colors.text,
    fontSize: typography.size.md,
  },
  fieldPlaceholder: {
    color: colors.textMuted,
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
  ageList: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xxl,
  },
  ageRow: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
  },
  ageRowSelected: {
    backgroundColor: colors.primarySoft,
  },
  ageText: {
    color: colors.text,
    fontSize: typography.size.md,
  },
  ageTextSelected: {
    color: colors.primary,
    fontWeight: typography.weight.semibold,
  },
  years: {
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  yearChip: {
    minWidth: 64,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.full,
    backgroundColor: colors.surface,
  },
  yearChipSelected: {
    backgroundColor: colors.primary,
  },
  yearText: {
    color: colors.textSecondary,
    fontSize: typography.size.sm,
    fontWeight: typography.weight.semibold,
  },
  yearTextSelected: {
    color: colors.textOnPrimary,
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
  clearDate: {
    alignSelf: 'center',
    marginTop: spacing.xl,
    padding: spacing.md,
  },
  clearDateText: {
    color: colors.primary,
    fontSize: typography.size.sm,
    fontWeight: typography.weight.semibold,
  },
});
