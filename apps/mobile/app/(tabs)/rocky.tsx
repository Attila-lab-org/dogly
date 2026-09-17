/**
 * Profilo cane: spazio personale, visivo e orientato alle azioni.
 * Le spiegazioni tecniche e le policy restano fuori da questa schermata.
 */
import React from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
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
import { fetchDogPhotos } from '@/features/photos/api';
import { currentAgeLabel } from '@/features/dogs/profileDates';
import { relativeCareDate } from '@/features/care/date';
import { nextCareEvent, useCareEvents } from '@/features/care/store';
import { useLifestyle } from '@/features/lifestyle/api';
import { useSession } from '@/features/auth/SessionProvider';
import { isPersistedId } from '@/lib/persistedId';
import { queryKeys } from '@/lib/queryClient';
import {
  getDigestiveSummary,
  type DigestiveSummary,
} from '@/features/digestive/api';
import {
  fetchOwnerStories,
} from '@/features/ownerStory/api';
import {
  listFeedingPeriods,
  listFoods,
} from '@/features/nutrition/api';

type IconName = keyof typeof Ionicons.glyphMap;

export default function DogProfileTabScreen() {
  const router = useRouter();
  const { dog } = useDogProfile();
  const { userId, usingMockGate } = useSession();
  const useDemoData = usingMockGate;
  // Sottoscrizione reattiva agli eventi agenda (idratamento incluso).
  useCareEvents(dog.id, dog.name);
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
  const photosQuery = useQuery({
    queryKey: ['gallery-dog-photos', dog.id, 3],
    queryFn: () => fetchDogPhotos(dog.id, 3),
    enabled: !useDemoData && isPersistedId(dog.id),
  });
  const digestiveSummaryQuery = useQuery({
    queryKey: ['digestive-summary', dog.id],
    queryFn: () => getDigestiveSummary(dog.id),
    enabled: !useDemoData && isPersistedId(dog.id),
  });
  const foodsQuery = useQuery({
    queryKey: queryKeys.foods(userId ?? 'anon', dog.id),
    queryFn: () => listFoods(dog.id),
    enabled: !useDemoData && isPersistedId(dog.id),
  });
  const feedingPeriodsQuery = useQuery({
    queryKey: [...queryKeys.foods(userId ?? 'anon', dog.id), 'periods'],
    queryFn: () => listFeedingPeriods(dog.id),
    enabled: !useDemoData && isPersistedId(dog.id),
  });
  const activeRealPeriod = feedingPeriodsQuery.data?.find(
    (period) => period.end_at == null,
  );
  const activeRealFood = foodsQuery.data?.find(
    (food) => food.id === activeRealPeriod?.food_product_id,
  );
  const activeFoodLabel = (
    useDemoData
      ? [activeFood?.brand, activeFood?.name]
      : [activeRealFood?.brand, activeRealFood?.name]
  )
    .filter(Boolean)
    .join(' ');
  const previewPhotos = (photosQuery.data ?? []).slice(0, 3);
  const nextCare = nextCareEvent(dog.id);
  const lifestyle = useLifestyle(dog.id);
  const storiesQuery = useQuery({
    queryKey: queryKeys.ownerStories(userId ?? 'anon', dog.id),
    queryFn: () => fetchOwnerStories(dog.id),
    enabled: !useDemoData && isPersistedId(dog.id),
  });
  const storyFacts = (storiesQuery.data ?? []).flatMap((story) => story.facts);

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
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>I suoi momenti</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Vedi tutti i momenti di ${dog.name}`}
            onPress={() => router.push(`/dogs/${dog.id}/album` as never)}
            hitSlop={8}
          >
            <Text style={styles.seeAll}>Vedi tutti</Text>
          </Pressable>
        </View>
        {previewPhotos.length > 0 ? (
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
        ) : (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Aggiungi una foto di ${dog.name}`}
            onPress={() => router.push(`/dogs/${dog.id}/album` as never)}
            style={styles.emptyMoments}
          >
            <Ionicons name="images-outline" size={22} color={colors.primary} />
            <View style={styles.emptyMomentsText}>
              <Text style={styles.emptyMomentsTitle}>Aggiungi una foto</Text>
              <Text style={styles.emptyMomentsSubtitle}>
                Conserva qui i suoi momenti più belli
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
          </Pressable>
        )}

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
              activeFoodLabel ||
              lifestyle.profile?.feedingLabel ||
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
          <Text style={styles.sectionTitle}>Quello che ricordo</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Racconta qualcosa di ${dog.name}`}
            onPress={() => router.push(`/dogs/${dog.id}/tell` as never)}
            hitSlop={8}
          >
            <Text style={styles.seeAll}>Aggiungi</Text>
          </Pressable>
        </View>
        {!useDemoData && storiesQuery.isLoading ? (
          <Text style={styles.notesEmpty}>Carico i ricordi…</Text>
        ) : null}
        {!useDemoData && storiesQuery.isError ? (
          <View style={styles.notesErrorRow}>
            <Text style={styles.noteError}>
              Non riesco a caricare i ricordi.
            </Text>
            <Pressable onPress={() => void storiesQuery.refetch()}>
              <Text style={styles.noteActionPrimary}>Riprova</Text>
            </Pressable>
          </View>
        ) : null}
        {!useDemoData &&
        !storiesQuery.isLoading &&
        !storiesQuery.isError &&
        (storiesQuery.data?.length ?? 0) === 0 ? (
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push(`/dogs/${dog.id}/tell` as never)}
            style={({ pressed }) => [
              styles.detailsRow,
              pressed && styles.pressed,
            ]}
          >
            <View style={[styles.detailsIcon, styles.lifestyleIcon]}>
              <Ionicons name="heart-outline" size={20} color={colors.accent} />
            </View>
            <View style={styles.detailsText}>
              <Text style={styles.detailsTitle}>Raccontami qualcosa di lui</Text>
              <Text style={styles.detailsSubtitle}>
                Conserverò soltanto ciò che scegli
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={19} color={colors.textMuted} />
          </Pressable>
        ) : null}
        {storyFacts.length > 0 ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Apri tutti i ricordi di ${dog.name}`}
            onPress={() => router.push(`/dogs/${dog.id}/memories` as never)}
            style={({ pressed }) => [
              styles.noteCard,
              pressed && styles.pressed,
            ]}
          >
            {storyFacts.slice(0, 2).map((fact) => (
              <View key={fact.id} style={styles.memoryPreviewRow}>
                <Ionicons name="heart-outline" size={17} color={colors.accent} />
                <Text style={styles.noteText} numberOfLines={2}>
                  {fact.statement}
                </Text>
              </View>
            ))}
            <View style={styles.memoryPreviewFooter}>
              <Text style={styles.noteMeta}>
                {storyFacts.length}{' '}
                {storyFacts.length === 1 ? 'ricordo' : 'ricordi'}
              </Text>
              <View style={styles.memoryPreviewLink}>
                <Text style={styles.noteActionPrimary}>Vedi tutti</Text>
                <Ionicons
                  name="chevron-forward"
                  size={17}
                  color={colors.primary}
                />
              </View>
            </View>
          </Pressable>
        ) : null}

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
  emptyMoments: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.lg,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    marginBottom: spacing.xxl,
  },
  emptyMomentsText: {
    flex: 1,
  },
  emptyMomentsTitle: {
    color: colors.text,
    fontSize: typography.size.sm,
    fontWeight: typography.weight.semibold,
  },
  emptyMomentsSubtitle: {
    color: colors.textSecondary,
    fontSize: typography.size.xs,
    marginTop: 2,
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
    padding: spacing.lg,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    ...shadows.card,
  },
  memoryPreviewRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  memoryPreviewFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    paddingTop: spacing.md,
    marginTop: spacing.xs,
  },
  memoryPreviewLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xxs,
  },
  noteText: {
    color: colors.text,
    fontSize: typography.size.sm,
    lineHeight: typography.size.sm * typography.lineHeight.relaxed,
  },
  noteMeta: {
    color: colors.accent,
    fontSize: typography.size.xs,
    fontWeight: typography.weight.semibold,
  },
  noteActionPrimary: {
    color: colors.primary,
    fontSize: typography.size.sm,
    fontWeight: typography.weight.semibold,
  },
  noteError: {
    marginBottom: spacing.md,
    color: colors.danger,
    fontSize: typography.size.sm,
  },
  notesErrorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    marginBottom: spacing.lg,
  },
  pressed: {
    opacity: 0.7,
  },
});
