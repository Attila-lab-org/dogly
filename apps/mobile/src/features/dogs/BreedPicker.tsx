import React, { useMemo, useState } from 'react';
import {
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, radius, spacing, typography } from '../../theme/tokens';
import {
  filterBreeds,
  type BreedSelection,
} from './breeds';

export function BreedPicker({
  value,
  onChange,
  testID,
}: {
  value: BreedSelection;
  onChange: (value: BreedSelection) => void;
  testID?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const breeds = useMemo(() => filterBreeds(query), [query]);

  const select = (selection: BreedSelection) => {
    onChange(selection);
    setQuery('');
    setOpen(false);
  };

  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Razza: ${selectionLabel(value)}`}
        onPress={() => setOpen(true)}
        testID={testID}
        style={({ pressed }) => [
          styles.field,
          pressed && styles.fieldPressed,
        ]}
      >
        <Text
          style={[
            styles.fieldText,
            value.kind === 'unselected' && styles.placeholder,
          ]}
          numberOfLines={1}
        >
          {selectionLabel(value)}
        </Text>
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
            <Text style={styles.title}>Scegli la razza</Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Chiudi"
              onPress={() => setOpen(false)}
              hitSlop={12}
              style={styles.close}
            >
              <Ionicons name="close" size={25} color={colors.text} />
            </Pressable>
          </View>

          <View style={styles.search}>
            <Ionicons name="search" size={19} color={colors.textMuted} />
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="Cerca una razza"
              placeholderTextColor={colors.textMuted}
              autoCapitalize="none"
              autoCorrect={false}
              style={styles.searchInput}
            />
            {query ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Cancella ricerca"
                onPress={() => setQuery('')}
                hitSlop={8}
              >
                <Ionicons
                  name="close-circle"
                  size={19}
                  color={colors.textMuted}
                />
              </Pressable>
            ) : null}
          </View>

          {!query ? (
            <View style={styles.specialChoices}>
              <SpecialChoice
                icon="help"
                label="Non lo so"
                selected={value.kind === 'unknown'}
                onPress={() => select({ kind: 'unknown' })}
              />
              <SpecialChoice
                icon="paw"
                label="È un mix"
                selected={value.kind === 'mixed'}
                onPress={() => select({ kind: 'mixed' })}
              />
            </View>
          ) : null}

          <Text style={styles.listLabel}>
            {query ? `${breeds.length} risultati` : 'Razze'}
          </Text>
          <FlatList
            data={breeds}
            keyExtractor={(breed) => breed}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={styles.list}
            renderItem={({ item }) => (
              <ChoiceRow
                label={item}
                selected={value.kind === 'breed' && value.name === item}
                onPress={() => select({ kind: 'breed', name: item })}
              />
            )}
            ListEmptyComponent={
              <Text style={styles.empty}>Nessuna razza trovata</Text>
            }
          />
        </SafeAreaView>
      </Modal>
    </>
  );
}

function ChoiceRow({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.choice,
        selected && styles.choiceSelected,
        pressed && styles.choicePressed,
      ]}
    >
      <Text
        style={[styles.choiceText, selected && styles.choiceTextSelected]}
      >
        {label}
      </Text>
      {selected ? (
        <Ionicons name="checkmark-circle" size={21} color={colors.primary} />
      ) : null}
    </Pressable>
  );
}

function SpecialChoice({
  icon,
  label,
  selected,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.specialCard,
        selected && styles.specialCardSelected,
        pressed && styles.choicePressed,
      ]}
    >
      <View
        style={[
          styles.specialIcon,
          selected && styles.specialIconSelected,
        ]}
      >
        <Ionicons
          name={icon}
          size={22}
          color={selected ? colors.textOnPrimary : colors.accent}
        />
      </View>
      <Text
        style={[styles.specialLabel, selected && styles.choiceTextSelected]}
      >
        {label}
      </Text>
      {selected ? (
        <Ionicons
          name="checkmark-circle"
          size={19}
          color={colors.primary}
          style={styles.specialCheck}
        />
      ) : null}
    </Pressable>
  );
}

function selectionLabel(selection: BreedSelection): string {
  switch (selection.kind) {
    case 'unknown':
      return 'Non lo so';
    case 'mixed':
      return 'È un mix';
    case 'breed':
      return selection.name;
    case 'unselected':
      return 'Seleziona la razza';
  }
}

const styles = StyleSheet.create({
  field: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
  },
  fieldPressed: {
    borderColor: colors.primary,
  },
  fieldText: {
    flex: 1,
    color: colors.text,
    fontSize: typography.size.md,
  },
  placeholder: {
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
  search: {
    minHeight: 50,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginHorizontal: spacing.lg,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
  },
  searchInput: {
    flex: 1,
    color: colors.text,
    fontSize: typography.size.md,
  },
  specialChoices: {
    flexDirection: 'row',
    gap: spacing.sm,
    padding: spacing.lg,
  },
  specialCard: {
    flex: 1,
    minHeight: 112,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
  },
  specialCardSelected: {
    borderColor: colors.primary,
    backgroundColor: colors.primarySoft,
  },
  specialIcon: {
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accentSoft,
  },
  specialIconSelected: {
    backgroundColor: colors.primary,
  },
  specialLabel: {
    color: colors.text,
    fontSize: typography.size.sm,
    fontWeight: typography.weight.semibold,
  },
  specialCheck: {
    position: 'absolute',
    top: spacing.sm,
    right: spacing.sm,
  },
  listLabel: {
    marginHorizontal: spacing.lg,
    marginTop: spacing.md,
    marginBottom: spacing.sm,
    color: colors.textSecondary,
    fontSize: typography.size.xs,
    fontWeight: typography.weight.bold,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  list: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xxl,
  },
  choice: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
  },
  choiceSelected: {
    backgroundColor: colors.primarySoft,
  },
  choicePressed: {
    backgroundColor: colors.surfaceMuted,
  },
  choiceText: {
    flex: 1,
    color: colors.text,
    fontSize: typography.size.md,
  },
  choiceTextSelected: {
    color: colors.primary,
    fontWeight: typography.weight.semibold,
  },
  empty: {
    paddingVertical: spacing.xxl,
    color: colors.textSecondary,
    fontSize: typography.size.sm,
    textAlign: 'center',
  },
});
