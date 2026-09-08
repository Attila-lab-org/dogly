/**
 * Profilo cane: spazio personale, visivo e orientato alle azioni.
 * Le spiegazioni tecniche e le policy restano fuori da questa schermata.
 */
import React, { useState } from 'react';
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { Card } from '@/components';
import {
  colors,
  gradients,
  radius,
  shadows,
  spacing,
  typography,
} from '@/theme/tokens';
import {
  digestiveBaselineMock,
  feedingPeriodsMock,
  foodProductsMock,
} from '@/mocks/secondary';
import { DogAvatar } from '@/features/core/components';
import { useDogProfile } from '@/features/core/useDogProfile';
import { PhotoThumbnail } from '@/features/photos/components';
import { albumsMock, photosForAlbum } from '@/mocks/photos';
import {
  fetchAlbumPhotos,
  fetchAlbums,
} from '@/features/photos/api';
import { currentAgeLabel } from '@/features/dogs/profileDates';
import { relativeCareDate } from '@/features/care/date';
import { nextCareEvent, useCareEvents } from '@/features/care/store';
import { useLifestyle } from '@/features/lifestyle/api';
import { useSession } from '@/features/auth/SessionProvider';
import { isPersistedId } from '@/lib/persistedId';
import {
  getDigestiveSummary,
  type DigestiveSummary,
} from '@/features/digestive/api';
import {
  deleteOwnerStory,
  fetchOwnerStories,
  updateOwnerStory,
  type OwnerFact,
  type OwnerStoryObservation,
} from '@/features/ownerStory/api';

type IconName = keyof typeof Ionicons.glyphMap;

export default function DogProfileTabScreen() {
  const router = useRouter();
  const { dog } = useDogProfile();
  const { usingMockGate } = useSession();
  const useDemoData = usingMockGate;
  // Sottoscrizione reattiva agli eventi agenda (idratamento incluso).
  useCareEvents(dog.id);
  const { width } = useWindowDimensions();
  const contentWidth = Math.min(width, 560);
  const photoSize = Math.floor(
    (contentWidth - spacing.lg * 2 - spacing.sm * 2) / 3,
  );

  const activePeriod = useDemoData
    ? feedingPeriodsMock.find((period) => period.endedAt === null)
    : undefined;
  const activeFood = activePeriod
    ? foodProductsMock.find((food) => food.id === activePeriod.foodProductId)
    : undefined;
  const albumsQuery = useQuery({
    queryKey: ['gallery-albums', dog.id],
    queryFn: () => fetchAlbums(dog.id),
    enabled: !useDemoData && isPersistedId(dog.id),
  });
  const firstAlbumId = albumsQuery.data?.[0]?.id;
  const photosQuery = useQuery({
    queryKey: ['gallery-photos', firstAlbumId],
    queryFn: () => fetchAlbumPhotos(firstAlbumId!),
    enabled: !useDemoData && isPersistedId(firstAlbumId),
  });
  const digestiveSummaryQuery = useQuery({
    queryKey: ['digestive-summary', dog.id],
    queryFn: () => getDigestiveSummary(dog.id),
    enabled: !useDemoData && isPersistedId(dog.id),
  });
  const previewPhotos = useDemoData
    ? photosForAlbum(albumsMock[0]?.id ?? '').slice(0, 3)
    : (photosQuery.data ?? []).slice(0, 3);
  const nextCare = nextCareEvent(dog.id);
  const lifestyle = useLifestyle(dog.id);
  const [editingStoryId, setEditingStoryId] = useState<string | null>(null);
  const [storyDraft, setStoryDraft] = useState<OwnerFact[]>([]);
  const [savingStory, setSavingStory] = useState(false);
  const [storyError, setStoryError] = useState<string | null>(null);
  const storiesQuery = useQuery({
    queryKey: ['owner-stories', dog.id],
    queryFn: () => fetchOwnerStories(dog.id),
    enabled: !useDemoData && isPersistedId(dog.id),
  });

  const beginStoryEdit = (story: OwnerStoryObservation) => {
    setEditingStoryId(story.id);
    setStoryDraft(story.facts.map((fact) => ({ ...fact })));
    setStoryError(null);
  };
  const saveStory = async () => {
    if (!editingStoryId || storyDraft.some((fact) => fact.statement.trim().length < 2)) {
      return;
    }
    setSavingStory(true);
    setStoryError(null);
    try {
      await updateOwnerStory(dog.id, editingStoryId, storyDraft);
      await storiesQuery.refetch();
      setEditingStoryId(null);
    } catch {
      setStoryError('Non sono riuscito a salvare la nota.');
    } finally {
      setSavingStory(false);
    }
  };
  const confirmStoryDelete = (storyId: string) => {
    Alert.alert(
      'Eliminare questa nota?',
      'Dogly non la userà più per conoscere il tuo cane.',
      [
        { text: 'Annulla', style: 'cancel' },
        {
          text: 'Elimina',
          style: 'destructive',
          onPress: () => {
            void deleteOwnerStory(dog.id, storyId)
              .then(() => storiesQuery.refetch())
              .catch(() => setStoryError('Non sono riuscito a eliminare la nota.'));
          },
        },
      ],
    );
  };

  return (
    <View style={styles.root}>
      <LinearGradient
        colors={[...gradients.header]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.hero}
      >
        <View style={styles.decorLarge} />
        <View style={styles.decorSmall} />
        <SafeAreaView edges={['top']} style={styles.heroSafe}>
          <View style={styles.topBar}>
            <Text style={styles.eyebrow}>IL SUO SPAZIO</Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Impostazioni"
              onPress={() => router.push('/settings')}
              hitSlop={12}
              style={styles.topButton}
            >
              <Ionicons
                name="settings-outline"
                size={22}
                color={colors.textOnPrimary}
              />
            </Pressable>
          </View>

          <View style={styles.identity}>
            <View style={styles.avatarWrap}>
              <View style={styles.avatarHalo}>
                <DogAvatar
                  size={AVATAR_SIZE}
                  photoUri={dog.photoUri}
                  dogName={dog.name}
                />
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Modifica profilo di ${dog.name}`}
                onPress={() => router.push(`/dogs/${dog.id}/edit` as never)}
                style={styles.editBadge}
              >
                <Ionicons name="pencil" size={15} color={colors.primary} />
              </Pressable>
            </View>
            <Text style={styles.name}>{dog.name}</Text>
            <View style={styles.metaRow}>
              <MetaPill
                icon="calendar-outline"
                label={currentAgeLabel(dog.birthDate, dog.ageLabel)}
              />
              <MetaPill icon="resize-outline" label={dog.sizeLabel} />
              {dog.weightKg ? (
                <MetaPill
                  icon="scale-outline"
                  label={`${String(dog.weightKg).replace('.', ',')} kg`}
                />
              ) : null}
              {dog.breedLabel ? (
                <MetaPill icon="paw-outline" label={dog.breedLabel} />
              ) : null}
            </View>
          </View>
        </SafeAreaView>
      </LinearGradient>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <Card style={styles.quickActions}>
          <QuickAction
            icon="chatbubble-ellipses-outline"
            label="Racconta"
            onPress={() => router.push(`/dogs/${dog.id}/tell` as never)}
          />
          <View style={styles.actionDivider} />
          <QuickAction
            icon="images-outline"
            label="Album"
            onPress={() => router.push(`/dogs/${dog.id}/album` as never)}
          />
        </Card>

        {previewPhotos.length > 0 ? (
          <>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>I suoi momenti</Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Vedi tutti gli album"
                onPress={() => router.push(`/dogs/${dog.id}/album` as never)}
                hitSlop={8}
              >
                <Text style={styles.seeAll}>Vedi tutti</Text>
              </Pressable>
            </View>

            <View style={styles.photoRow}>
              {previewPhotos.map((photo) => (
                <PhotoThumbnail
                  key={photo.id}
                  photo={photo}
                  size={photoSize}
                  onPress={() =>
                    router.push(
                      `/dogs/${dog.id}/album/photo/${photo.id}?albumId=${photo.albumId}` as never,
                    )
                  }
                />
              ))}
            </View>
          </>
        ) : null}

        <Text style={[styles.sectionTitle, styles.standaloneTitle]}>
          Benessere
        </Text>
        <View style={styles.wellnessGrid}>
          <WellnessCard
            icon="leaf-outline"
            iconColor={colors.accent}
            iconBackground={colors.accentSoft}
            label="Digestione"
            value={
              useDemoData && digestiveBaselineMock.variability === 'bassa'
                ? 'Stabile'
                : useDemoData
                  ? 'Da osservare'
                  : digestiveSummaryLabel(digestiveSummaryQuery.data)
            }
            onPress={() => router.push('/digestive/capture')}
          />
          <WellnessCard
            icon="nutrition-outline"
            iconColor={colors.primary}
            iconBackground={colors.primarySoft}
            label="Alimentazione"
            value={
              activeFood?.brand ??
              lifestyle.profile?.feedingLabel ??
              'Aggiungi cibo'
            }
            onPress={() => router.push('/nutrition/foods')}
          />
          <WellnessCard
            icon="calendar-outline"
            iconColor={colors.warning}
            iconBackground={colors.warningSoft}
            label="Agenda"
            value={
              nextCare
                ? relativeCareDate(nextCare.scheduledAt)
                : 'Aggiungi promemoria'
            }
            onPress={() => router.push('/care' as never)}
          />
        </View>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Routine e abitudini di ${dog.name}`}
          onPress={() => router.push(`/dogs/${dog.id}/lifestyle` as never)}
          style={[styles.detailsRow, styles.lifestyleRow]}
        >
          <View style={[styles.detailsIcon, styles.lifestyleIcon]}>
            <Ionicons name="sparkles-outline" size={20} color={colors.accent} />
          </View>
          <View style={styles.detailsText}>
            <Text style={styles.detailsTitle}>Routine e abitudini</Text>
            <Text style={styles.detailsSubtitle}>
              {lifestyle.profile
                ? 'Le sue abitudini quotidiane'
                : 'Aiutami a conoscerlo meglio'}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={19} color={colors.textMuted} />
        </Pressable>

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Note personali</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Racconta qualcosa di ${dog.name}`}
            onPress={() => router.push(`/dogs/${dog.id}/tell` as never)}
            hitSlop={8}
          >
            <Text style={styles.seeAll}>Racconta</Text>
          </Pressable>
        </View>
        {!useDemoData && (storiesQuery.data?.length ?? 0) === 0 ? (
          <Text style={styles.notesEmpty}>
            Qui ritroverai solo le cose che hai confermato.
          </Text>
        ) : null}
        {(storiesQuery.data ?? []).map((story) => (
          <Card key={story.id} style={styles.noteCard}>
            {editingStoryId === story.id ? (
              <>
                {storyDraft.map((fact, index) => (
                  <TextInput
                    key={fact.id}
                    value={fact.statement}
                    multiline
                    maxLength={280}
                    onChangeText={(statement) =>
                      setStoryDraft((current) =>
                        current.map((item, itemIndex) =>
                          itemIndex === index ? { ...item, statement } : item,
                        ),
                      )
                    }
                    style={styles.noteInput}
                  />
                ))}
                <View style={styles.noteActions}>
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => setEditingStoryId(null)}
                  >
                    <Text style={styles.noteActionSecondary}>Annulla</Text>
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    disabled={savingStory}
                    onPress={() => void saveStory()}
                  >
                    <Text style={styles.noteActionPrimary}>
                      {savingStory ? 'Salvo…' : 'Salva'}
                    </Text>
                  </Pressable>
                </View>
              </>
            ) : (
              <>
                {story.facts.map((fact) => (
                  <Text key={fact.id} style={styles.noteText}>
                    {fact.statement}
                  </Text>
                ))}
                <View style={styles.noteActions}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Elimina nota"
                    onPress={() => confirmStoryDelete(story.id)}
                  >
                    <Ionicons name="trash-outline" size={18} color={colors.textMuted} />
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Modifica nota"
                    onPress={() => beginStoryEdit(story)}
                  >
                    <Text style={styles.noteActionPrimary}>Modifica</Text>
                  </Pressable>
                </View>
              </>
            )}
          </Card>
        ))}
        {storyError ? <Text style={styles.noteError}>{storyError}</Text> : null}

        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Modifica i dettagli di ${dog.name}`}
          onPress={() => router.push(`/dogs/${dog.id}/edit` as never)}
          style={styles.detailsRow}
        >
          <View style={styles.detailsIcon}>
            <Ionicons name="paw-outline" size={20} color={colors.primary} />
          </View>
          <Text style={styles.detailsTitle}>Modifica profilo</Text>
          <Ionicons name="chevron-forward" size={19} color={colors.textMuted} />
        </Pressable>
      </ScrollView>
    </View>
  );
}

function digestiveSummaryLabel(summary?: DigestiveSummary): string {
  if (!summary || summary.data_sufficiency === 'insufficient') {
    return 'Aggiungi osservazione';
  }
  if (summary.safety_flags.length > 0 || summary.recent_trend === 'worsening') {
    return 'Da osservare';
  }
  if (summary.recent_trend === 'improving') return 'In miglioramento';
  if (summary.recent_trend === 'stable' || (summary.variability ?? 99) <= 1) {
    return 'Stabile';
  }
  return 'Vedi andamento';
}

function MetaPill({ icon, label }: { icon: IconName; label: string }) {
  return (
    <View style={styles.metaPill}>
      <Ionicons name={icon} size={13} color={colors.textOnPrimary} />
      <Text style={styles.metaLabel}>{label}</Text>
    </View>
  );
}

function QuickAction({
  icon,
  label,
  onPress,
}: {
  icon: IconName;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [styles.quickAction, pressed && styles.pressed]}
    >
      <View style={styles.quickIcon}>
        <Ionicons name={icon} size={22} color={colors.primary} />
      </View>
      <Text style={styles.quickLabel}>{label}</Text>
    </Pressable>
  );
}

function WellnessCard({
  icon,
  iconColor,
  iconBackground,
  label,
  value,
  onPress,
}: {
  icon: IconName;
  iconColor: string;
  iconBackground: string;
  label: string;
  value: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${label}: ${value}`}
      onPress={onPress}
      style={({ pressed }) => [
        styles.wellnessCard,
        pressed && styles.pressed,
      ]}
    >
      <View style={[styles.wellnessIcon, { backgroundColor: iconBackground }]}>
        <Ionicons name={icon} size={22} color={iconColor} />
      </View>
      <Text style={styles.wellnessLabel}>{label}</Text>
      <View style={styles.wellnessValueRow}>
        <Text style={styles.wellnessValue} numberOfLines={1}>
          {value}
        </Text>
        <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
      </View>
    </Pressable>
  );
}

const AVATAR_SIZE = 128;

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.background,
  },
  hero: {
    paddingBottom: spacing.xxxl + spacing.xl,
    overflow: 'hidden',
  },
  heroSafe: {
    width: '100%',
    maxWidth: 560,
    alignSelf: 'center',
    paddingHorizontal: spacing.lg,
  },
  decorLarge: {
    position: 'absolute',
    width: 220,
    height: 220,
    borderRadius: 110,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    right: -80,
    top: -70,
  },
  decorSmall: {
    position: 'absolute',
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: 'rgba(255, 255, 255, 0.07)',
    left: -38,
    bottom: 18,
  },
  topBar: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  eyebrow: {
    color: colors.textOnPrimary,
    fontSize: typography.size.xs,
    fontWeight: typography.weight.bold,
    letterSpacing: 1.5,
    opacity: 0.8,
  },
  topButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255, 255, 255, 0.14)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  identity: {
    alignItems: 'center',
    marginTop: spacing.sm,
  },
  avatarWrap: {
    position: 'relative',
  },
  avatarHalo: {
    padding: 4,
    borderRadius: radius.full,
    backgroundColor: colors.surface,
    ...shadows.raised,
  },
  editBadge: {
    position: 'absolute',
    right: 2,
    bottom: 4,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.surface,
    borderWidth: 2,
    borderColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.card,
  },
  name: {
    marginTop: spacing.md,
    color: colors.textOnPrimary,
    fontSize: typography.size.display,
    fontWeight: typography.weight.bold,
  },
  metaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  metaPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: spacing.xs + 2,
    borderRadius: radius.full,
    backgroundColor: 'rgba(255, 255, 255, 0.14)',
  },
  metaLabel: {
    color: colors.textOnPrimary,
    fontSize: typography.size.xs,
    fontWeight: typography.weight.medium,
  },
  scroll: {
    flex: 1,
    marginTop: -spacing.xxl,
  },
  content: {
    width: '100%',
    maxWidth: 560,
    alignSelf: 'center',
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xxxl,
  },
  quickActions: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.xxl,
  },
  quickAction: {
    flex: 1,
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: 72,
    justifyContent: 'center',
  },
  quickIcon: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickLabel: {
    color: colors.text,
    fontSize: typography.size.sm,
    fontWeight: typography.weight.semibold,
  },
  actionDivider: {
    width: 1,
    height: 50,
    backgroundColor: colors.border,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  sectionTitle: {
    color: colors.text,
    fontSize: typography.size.lg,
    fontWeight: typography.weight.bold,
  },
  seeAll: {
    color: colors.primary,
    fontSize: typography.size.sm,
    fontWeight: typography.weight.semibold,
  },
  standaloneTitle: {
    marginBottom: spacing.md,
  },
  photoRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.xxl,
  },
  wellnessGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
    marginBottom: spacing.xxl,
  },
  wellnessCard: {
    flexGrow: 1,
    flexBasis: '46%',
    minHeight: 150,
    padding: spacing.lg,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    ...shadows.card,
  },
  wellnessIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  wellnessLabel: {
    color: colors.textSecondary,
    fontSize: typography.size.xs,
    marginBottom: spacing.xs,
  },
  wellnessValueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  wellnessValue: {
    flex: 1,
    color: colors.text,
    fontSize: typography.size.md,
    fontWeight: typography.weight.bold,
  },
  detailsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: 72,
    padding: spacing.lg,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    ...shadows.card,
  },
  detailsIcon: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primarySoft,
  },
  detailsTitle: {
    color: colors.text,
    fontSize: typography.size.md,
    fontWeight: typography.weight.semibold,
  },
  detailsText: {
    flex: 1,
  },
  detailsSubtitle: {
    marginTop: spacing.xxs,
    color: colors.textSecondary,
    fontSize: typography.size.xs,
  },
  lifestyleIcon: {
    backgroundColor: colors.accentSoft,
  },
  lifestyleRow: {
    marginBottom: spacing.md,
  },
  notesEmpty: {
    marginBottom: spacing.lg,
    color: colors.textMuted,
    fontSize: typography.size.sm,
  },
  noteCard: {
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  noteText: {
    color: colors.text,
    fontSize: typography.size.sm,
    lineHeight: typography.size.sm * typography.lineHeight.relaxed,
  },
  noteInput: {
    minHeight: 64,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceMuted,
    color: colors.text,
    fontSize: typography.size.sm,
    textAlignVertical: 'top',
  },
  noteActions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: spacing.lg,
    marginTop: spacing.xs,
  },
  noteActionPrimary: {
    color: colors.primary,
    fontSize: typography.size.sm,
    fontWeight: typography.weight.semibold,
  },
  noteActionSecondary: {
    color: colors.textSecondary,
    fontSize: typography.size.sm,
  },
  noteError: {
    marginBottom: spacing.md,
    color: colors.danger,
    fontSize: typography.size.sm,
  },
  pressed: {
    opacity: 0.7,
  },
});
