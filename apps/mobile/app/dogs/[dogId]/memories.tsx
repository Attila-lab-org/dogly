import React, { useMemo, useState } from 'react';
import {
  Alert,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import { Button, ScreenContainer } from '@/components';
import { StackScreenHeader } from '@/features/secondary/components';
import { useDogProfile } from '@/features/core/useDogProfile';
import { useSession } from '@/features/auth/SessionProvider';
import {
  deleteOwnerStory,
  fetchOwnerStories,
  updateOwnerStory,
  type OwnerFact,
  type OwnerStoryObservation,
} from '@/features/ownerStory/api';
import { queryKeys } from '@/lib/queryClient';
import { colors, radius, shadows, spacing, typography } from '@/theme/tokens';

export default function DogMemoriesScreen() {
  const { dogId = '' } = useLocalSearchParams<{ dogId: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { dog } = useDogProfile();
  const { userId } = useSession();
  const [search, setSearch] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<OwnerFact[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const query = useQuery({
    queryKey: queryKeys.ownerStories(userId ?? 'anon', dogId),
    queryFn: () => fetchOwnerStories(dogId),
    enabled: Boolean(dogId),
  });
  const stories = useMemo(() => {
    const needle = search.trim().toLocaleLowerCase('it-IT');
    if (!needle) return query.data ?? [];
    return (query.data ?? []).filter((story) =>
      story.facts.some((fact) =>
        fact.statement.toLocaleLowerCase('it-IT').includes(needle),
      ),
    );
  }, [query.data, search]);
  const count = (query.data ?? []).reduce(
    (total, story) => total + story.facts.length,
    0,
  );

  const beginEdit = (story: OwnerStoryObservation) => {
    setDraft(story.facts.map((fact) => ({ ...fact })));
    setEditingId(story.id);
    setError(null);
  };
  const save = async () => {
    if (!editingId || draft.some((fact) => fact.statement.trim().length < 2)) {
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await updateOwnerStory(dogId, editingId, draft);
      await query.refetch();
      setEditingId(null);
      setOpenId(null);
    } catch {
      setError('Non sono riuscito a salvare il ricordo.');
    } finally {
      setSaving(false);
    }
  };
  const remove = (storyId: string) => {
    Alert.alert(
      'Eliminare questo ricordo?',
      `Non verrà più usato per conoscere ${dog.name}.`,
      [
        { text: 'Annulla', style: 'cancel' },
        {
          text: 'Elimina',
          style: 'destructive',
          onPress: () => {
            void deleteOwnerStory(dogId, storyId)
              .then(async () => {
                await query.refetch();
                if (userId) {
                  await queryClient.invalidateQueries({
                    queryKey: queryKeys.knowledgeScore(userId, dogId),
                  });
                }
                setOpenId(null);
              })
              .catch(() =>
                setError('Non sono riuscito a eliminare il ricordo.'),
              );
          },
        },
      ],
    );
  };

  return (
    <ScreenContainer style={styles.screen}>
      <StackScreenHeader title={`Ricordi di ${dog.name}`} />
      <Text style={styles.intro}>
        Qui trovi soltanto le informazioni utili che hai scelto di conservare.
      </Text>
      <Button
        title="Aggiungi un ricordo"
        icon={<Ionicons name="add" size={20} color={colors.textOnPrimary} />}
        onPress={() => router.push(`/dogs/${dogId}/tell` as never)}
      />
      {count > 5 ? (
        <View style={styles.searchBox}>
          <Ionicons name="search" size={19} color={colors.textMuted} />
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder={`Cerca nei ricordi di ${dog.name}`}
            placeholderTextColor={colors.textMuted}
            style={styles.searchInput}
          />
        </View>
      ) : null}
      <Text style={styles.count}>
        {count} {count === 1 ? 'ricordo' : 'ricordi'}
      </Text>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <FlatList
        data={stories}
        keyExtractor={(story) => story.id}
        contentContainerStyle={styles.list}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons name="heart-outline" size={28} color={colors.accent} />
            <Text style={styles.emptyTitle}>
              {query.isLoading ? 'Carico i ricordi…' : 'Nessun ricordo trovato'}
            </Text>
            {!query.isLoading ? (
              <Text style={styles.emptyText}>
                Prova un’altra ricerca oppure raccontami qualcosa di {dog.name}.
              </Text>
            ) : null}
          </View>
        }
        renderItem={({ item }) => {
          const open = openId === item.id;
          const editing = editingId === item.id;
          return (
            <View style={styles.memoryCard}>
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ expanded: open }}
                onPress={() => {
                  setOpenId(open ? null : item.id);
                  setEditingId(null);
                }}
                style={styles.memoryHeader}
              >
                <View style={styles.memoryIcon}>
                  <Ionicons name="heart-outline" size={18} color={colors.accent} />
                </View>
                <View style={styles.memoryBody}>
                  <Text style={styles.date}>
                    {new Date(item.confirmed_at).toLocaleDateString('it-IT', {
                      day: 'numeric',
                      month: 'long',
                      year: 'numeric',
                    })}
                  </Text>
                  {!editing
                    ? item.facts.map((fact) => (
                        <Text
                          key={fact.id}
                          style={styles.statement}
                          numberOfLines={open ? undefined : 2}
                        >
                          {fact.statement}
                        </Text>
                      ))
                    : null}
                </View>
                <Ionicons
                  name={open ? 'chevron-up' : 'chevron-down'}
                  size={19}
                  color={colors.textMuted}
                />
              </Pressable>
              {editing ? (
                <View style={styles.editor}>
                  {draft.map((fact, index) => (
                    <TextInput
                      key={fact.id}
                      value={fact.statement}
                      multiline
                      maxLength={280}
                      onChangeText={(statement) =>
                        setDraft((current) =>
                          current.map((value, valueIndex) =>
                            valueIndex === index
                              ? { ...value, statement }
                              : value,
                          ),
                        )
                      }
                      style={styles.factInput}
                    />
                  ))}
                  <View style={styles.actions}>
                    <Pressable onPress={() => setEditingId(null)}>
                      <Text style={styles.secondaryAction}>Annulla</Text>
                    </Pressable>
                    <Pressable disabled={saving} onPress={() => void save()}>
                      <Text style={styles.primaryAction}>
                        {saving ? 'Salvo…' : 'Salva'}
                      </Text>
                    </Pressable>
                  </View>
                </View>
              ) : open ? (
                <View style={styles.actions}>
                  <Pressable onPress={() => remove(item.id)}>
                    <Text style={styles.deleteAction}>Elimina</Text>
                  </Pressable>
                  <Pressable onPress={() => beginEdit(item)}>
                    <Text style={styles.primaryAction}>Modifica</Text>
                  </Pressable>
                </View>
              ) : null}
            </View>
          );
        }}
      />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  screen: { backgroundColor: colors.background },
  intro: {
    color: colors.textSecondary,
    fontSize: typography.size.sm,
    lineHeight: typography.size.sm * typography.lineHeight.relaxed,
    marginBottom: spacing.md,
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.md,
    paddingHorizontal: spacing.md,
    minHeight: 48,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  searchInput: { flex: 1, color: colors.text, fontSize: typography.size.sm },
  count: {
    color: colors.textMuted,
    fontSize: typography.size.xs,
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },
  list: { gap: spacing.sm, paddingBottom: spacing.xxxl },
  memoryCard: {
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    padding: spacing.md,
    ...shadows.card,
  },
  memoryHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  memoryIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accentSoft,
  },
  memoryBody: { flex: 1, gap: spacing.xs },
  date: {
    color: colors.accent,
    fontSize: typography.size.xs,
    fontWeight: typography.weight.semibold,
  },
  statement: {
    color: colors.text,
    fontSize: typography.size.sm,
    lineHeight: typography.size.sm * typography.lineHeight.relaxed,
  },
  editor: { gap: spacing.sm, marginTop: spacing.md },
  factInput: {
    minHeight: 72,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceMuted,
    color: colors.text,
    fontSize: typography.size.sm,
    textAlignVertical: 'top',
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: spacing.lg,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    paddingTop: spacing.md,
    marginTop: spacing.md,
  },
  primaryAction: {
    color: colors.primary,
    fontSize: typography.size.sm,
    fontWeight: typography.weight.semibold,
  },
  secondaryAction: { color: colors.textSecondary, fontSize: typography.size.sm },
  deleteAction: { color: colors.danger, fontSize: typography.size.sm },
  empty: {
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.xxxl,
  },
  emptyTitle: {
    color: colors.text,
    fontSize: typography.size.md,
    fontWeight: typography.weight.bold,
  },
  emptyText: {
    color: colors.textSecondary,
    fontSize: typography.size.sm,
    textAlign: 'center',
  },
  error: { color: colors.danger, fontSize: typography.size.sm },
});
