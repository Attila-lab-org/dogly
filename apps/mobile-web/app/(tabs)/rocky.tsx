/**
 * Profilo cane (Screen 3 mockup): spazio personale, visivo e orientato alle azioni.
 * Nessuna sezione "Quanto conosco {nome}".
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
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { DogAvatar } from '@/features/core/components';
import { useDogProfile } from '@/features/core/useDogProfile';
import { PhotoThumbnail } from '@/features/photos/components';
import { fetchDogPhotos } from '@/features/photos/api';
import { currentAgeLabel } from '@/features/dogs/profileDates';
import { sexLabel } from '@/features/dogs/map';
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
  digestiveBaselineMock,
  feedingPeriodsMock,
  foodProductsMock,
} from '@/mocks/secondary';
import {
  fetchOwnerStories,
} from '@/features/ownerStory/api';
import { usePersonalPatterns } from '@/features/patterns/api';
import {
  listFeedingPeriods,
  listFoods,
} from '@/features/nutrition/api';

type IconName = keyof typeof Ionicons.glyphMap;

const AVATAR_SIZE = 104;

const PATTERN_ICONS: Record<string, IconName> = {
  'pattern-porta': 'exit-outline',
  'pattern-sera': 'moon-outline',
};

export default function DogProfileTabScreen() {
  const router = useRouter();
  const { dog } = useDogProfile();
  const { userId, usingMockGate } = useSession();
  const useDemoData = usingMockGate;
  useCareEvents(dog.id, dog.name);
  const { width } = useWindowDimensions();
  const contentWidth = Math.min(width, 560);
  const photoSize = Math.floor((contentWidth - 40 - 16) / 3);

  const ageLabel = currentAgeLabel(dog.birthDate, dog.ageLabel);
  const sizeLabel = dog.sizeLabel;
  const breedLabel = dog.breedLabel;
  const genderLabel = sexLabel(dog.sex);

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
  const activeFoodLabel = formatFoodLabel(
    useDemoData ? activeFood : activeRealFood,
  );
  const previewPhotos = (photosQuery.data ?? []).slice(0, 3);
  const nextCare = nextCareEvent(dog.id);
  const lifestyle = useLifestyle(dog.id);
  const patternsQuery = usePersonalPatterns(dog.id);
  const learnedPatterns = patternsQuery.patterns
    .filter((pattern) => pattern.state !== 'ARCHIVED')
    .slice(0, 2);

  const storiesQuery = useQuery({
    queryKey: queryKeys.ownerStories(userId ?? 'anon', dog.id),
    queryFn: () => fetchOwnerStories(dog.id),
    enabled: !useDemoData && isPersistedId(dog.id),
  });
  const storyFacts = (storiesQuery.data ?? []).flatMap((story) => story.facts);

  return (
    <View style={styles.root}>
      <View style={styles.curve} pointerEvents="none" />

      <SafeAreaView edges={['top']} style={styles.safe}>
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.topBar}>
            <View style={styles.topBarSpacer} />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Impostazioni"
              onPress={() => router.push('/settings')}
              hitSlop={12}
              style={styles.settingsButton}
            >
              <Ionicons name="settings-outline" size={24} color="#1A2B48" />
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
                <Ionicons name="pencil" size={14} color="#FFFFFF" />
              </Pressable>
            </View>

            <Text style={styles.name}>{dog.name || 'Il tuo cane'}</Text>

            <View style={styles.metaRow}>
              {genderLabel ? <MetaItem icon="male-female-outline" label={genderLabel} /> : null}
              {ageLabel ? <MetaItem icon="calendar-outline" label={ageLabel} /> : null}
              {sizeLabel ? <MetaItem icon="resize-outline" label={sizeLabel} /> : null}
              {dog.weightKg ? (
                <MetaItem
                  icon="scale-outline"
                  label={`${String(dog.weightKg).replace('.', ',')} kg`}
                />
              ) : null}
              {breedLabel ? <MetaItem icon="paw" label={breedLabel} /> : null}
            </View>
          </View>

          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>
              Cosa sto imparando su {dog.name}
            </Text>
            {learnedPatterns.length > 0 ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Vedi tutte le abitudini di ${dog.name}`}
                onPress={() => router.push('/patterns')}
                hitSlop={8}
                style={styles.pillButton}
              >
                <Text style={styles.pillButtonText}>Vedi tutto</Text>
              </Pressable>
            ) : null}
          </View>
          <View style={styles.card}>
            {patternsQuery.live && patternsQuery.isLoading ? (
              <Text style={styles.patternEmptyText}>
                Sto iniziando a conoscere {dog.name}…
              </Text>
            ) : patternsQuery.live && patternsQuery.isError ? (
              <View style={styles.inlineMessage}>
                <Text style={styles.patternEmptyText}>
                  Non riesco a caricare ciò che sto imparando.
                </Text>
                <Pressable onPress={() => void patternsQuery.refetch()}>
                  <Text style={styles.noteActionPrimary}>Riprova</Text>
                </Pressable>
              </View>
            ) : learnedPatterns.length === 0 ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Mostra a DOGly un momento di ${dog.name}`}
                onPress={() => router.push('/behavior/capture')}
                style={styles.patternEmpty}
              >
                <View style={styles.patternEmptyCopy}>
                  <Text style={styles.patternEmptyText}>
                    Con ogni momento condiviso posso capire meglio le sue
                    abitudini.
                  </Text>
                  <Text style={styles.noteActionPrimary}>
                    Fammi vedere un momento
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color="#94A3B8" />
              </Pressable>
            ) : (
              learnedPatterns.map((pattern, index) => (
                <React.Fragment key={pattern.id}>
                  {index > 0 ? <View style={styles.divider} /> : null}
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={pattern.title}
                    onPress={() => router.push(`/patterns/${pattern.id}`)}
                    style={({ pressed }) => [
                      styles.patternRow,
                      pressed && styles.pressed,
                    ]}
                  >
                    <View style={styles.patternIcon}>
                      <Ionicons
                        name={PATTERN_ICONS[pattern.id] ?? 'sparkles-outline'}
                        size={18}
                        color="#0284C7"
                      />
                    </View>
                    <Text style={styles.patternText} numberOfLines={2}>
                      {pattern.title}
                    </Text>
                    <Ionicons
                      name="chevron-forward"
                      size={18}
                      color="#94A3B8"
                    />
                  </Pressable>
                </React.Fragment>
              ))
            )}
          </View>

          {/* Album preview */}
          <View style={[styles.sectionHeader, styles.sectionHeaderSpaced]}>
            <Text style={styles.secondaryTitle}>I suoi momenti</Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Vedi tutti i momenti di ${dog.name}`}
              onPress={() => router.push(`/dogs/${dog.id}/album` as never)}
              hitSlop={8}
              style={styles.pillButton}
            >
              <Text style={styles.pillButtonText}>Vedi tutti</Text>
            </Pressable>
          </View>
          {photosQuery.isLoading ? (
            <View style={[styles.card, styles.inlineMessage]}>
              <Text style={styles.patternEmptyText}>Carico i suoi momenti…</Text>
            </View>
          ) : photosQuery.isError ? (
            <View style={[styles.card, styles.inlineMessage]}>
              <Text style={styles.patternEmptyText}>
                Non riesco a caricare i suoi momenti.
              </Text>
              <Pressable onPress={() => void photosQuery.refetch()}>
                <Text style={styles.noteActionPrimary}>Riprova</Text>
              </Pressable>
            </View>
          ) : previewPhotos.length > 0 ? (
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
              accessibilityLabel="Apri album"
              onPress={() => router.push(`/dogs/${dog.id}/album` as never)}
              style={({ pressed }) => [styles.card, pressed && styles.pressed]}
            >
              <View style={styles.linkRow}>
                <View style={[styles.linkIcon, { backgroundColor: '#E0F2FE' }]}>
                  <Ionicons name="images-outline" size={20} color="#0284C7" />
                </View>
                <View style={styles.linkBody}>
                  <Text style={styles.linkTitle}>Aggiungi una foto</Text>
                  <Text style={styles.linkSubtitle}>
                    Aggiungi i suoi momenti preferiti
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color="#94A3B8" />
              </View>
            </Pressable>
          )}

          {/* Nutrizione / digestione */}
          <Text style={[styles.secondaryTitle, styles.sectionTitleSpaced]}>
            Benessere
          </Text>
          <View style={styles.card}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Digestione"
              onPress={() => router.push('/digestive/capture')}
              style={({ pressed }) => [
                styles.patternRow,
                pressed && styles.pressed,
              ]}
            >
              <View style={[styles.patternIcon, { backgroundColor: '#D1FAE5' }]}>
                <Ionicons name="leaf-outline" size={18} color="#059669" />
              </View>
              <View style={styles.linkBody}>
                <Text style={styles.linkTitle}>Digestione</Text>
                <Text style={styles.linkSubtitle}>
                  {useDemoData && digestiveBaselineMock.variability === 'bassa'
                    ? 'Stabile'
                    : useDemoData
                      ? 'Da osservare'
                      : digestiveSummaryLabel(
                          digestiveSummaryQuery.data,
                          digestiveSummaryQuery.isLoading,
                          digestiveSummaryQuery.isError,
                        )}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color="#94A3B8" />
            </Pressable>
            <View style={styles.divider} />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Alimentazione"
              onPress={() => router.push('/nutrition/foods')}
              style={({ pressed }) => [
                styles.patternRow,
                pressed && styles.pressed,
              ]}
            >
              <View style={[styles.patternIcon, { backgroundColor: '#E0F2FE' }]}>
                <Ionicons name="nutrition-outline" size={18} color="#0284C7" />
              </View>
              <View style={styles.linkBody}>
                <Text style={styles.linkTitle}>Alimentazione</Text>
                <Text style={styles.linkSubtitle} numberOfLines={1}>
                  {activeFoodLabel ||
                    lifestyle.profile?.feedingLabel ||
                    'Aggiungi cibo'}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color="#94A3B8" />
            </Pressable>
            <View style={styles.divider} />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Agenda"
              onPress={() => router.push('/care' as never)}
              style={({ pressed }) => [
                styles.patternRow,
                pressed && styles.pressed,
              ]}
            >
              <View style={[styles.patternIcon, { backgroundColor: '#FEF3C7' }]}>
                <Ionicons name="calendar-outline" size={18} color="#D97706" />
              </View>
              <View style={styles.linkBody}>
                <Text style={styles.linkTitle}>Agenda</Text>
                <Text style={styles.linkSubtitle}>
                  {nextCare
                    ? relativeCareDate(nextCare.scheduledAt)
                    : 'Aggiungi promemoria'}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color="#94A3B8" />
            </Pressable>
          </View>

          {/* Lifestyle */}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Routine e abitudini di ${dog.name}`}
            onPress={() => router.push(`/dogs/${dog.id}/lifestyle` as never)}
            style={({ pressed }) => [
              styles.card,
              styles.sectionTitleSpaced,
              pressed && styles.pressed,
            ]}
          >
            <View style={styles.linkRow}>
              <View style={[styles.linkIcon, { backgroundColor: '#ECFDF5' }]}>
                <Ionicons name="sparkles-outline" size={20} color="#0D9488" />
              </View>
              <View style={styles.linkBody}>
                <Text style={styles.linkTitle}>Routine e abitudini</Text>
                <Text style={styles.linkSubtitle}>
                  {lifestyle.error
                    ? 'Non disponibile'
                    : lifestyle.profile
                      ? 'Le sue abitudini quotidiane'
                      : 'Ancora da raccontare'}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color="#94A3B8" />
            </View>
          </Pressable>

          {/* Anteprima compatta: la raccolta completa vive in una pagina dedicata. */}
          <View style={[styles.sectionHeader, styles.sectionHeaderSpaced]}>
            <Text style={styles.secondaryTitle}>Quello che ricordo</Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Racconta qualcosa di ${dog.name}`}
              onPress={() => router.push(`/dogs/${dog.id}/tell` as never)}
              hitSlop={8}
              style={styles.pillButton}
            >
              <Text style={styles.pillButtonText}>Aggiungi</Text>
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
              style={({ pressed }) => [styles.card, pressed && styles.pressed]}
            >
              <View style={styles.linkRow}>
                <View style={[styles.linkIcon, { backgroundColor: '#ECFDF5' }]}>
                  <Ionicons name="heart-outline" size={20} color="#0D9488" />
                </View>
                <View style={styles.linkBody}>
                  <Text style={styles.linkTitle}>Raccontami qualcosa di lui</Text>
                  <Text style={styles.linkSubtitle}>
                    Conserverò soltanto ciò che scegli
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color="#94A3B8" />
              </View>
            </Pressable>
          ) : null}
          {storyFacts.length > 0 ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Apri tutti i ricordi di ${dog.name}`}
              onPress={() =>
                router.push(`/dogs/${dog.id}/memories` as never)
              }
              style={({ pressed }) => [
                styles.card,
                styles.noteCard,
                pressed && styles.pressed,
              ]}
            >
              {storyFacts.slice(0, 2).map((fact) => (
                <View key={fact.id} style={styles.memoryPreviewRow}>
                  <Ionicons name="heart-outline" size={17} color="#0D9488" />
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
                    color="#0284C7"
                  />
                </View>
              </View>
            </Pressable>
          ) : null}

        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

function formatFoodLabel(
  food?: { brand?: string | null; name?: string | null } | null,
): string {
  const brand = food?.brand?.trim() ?? '';
  const name = food?.name?.trim() ?? '';
  if (!brand) return name;
  if (!name) return brand;
  if (name.toLocaleLowerCase().startsWith(brand.toLocaleLowerCase())) {
    return name;
  }
  return `${brand} ${name}`;
}

function digestiveSummaryLabel(
  summary: DigestiveSummary | undefined,
  loading = false,
  error = false,
): string {
  if (loading) return 'Sto verificando…';
  if (error) return 'Non disponibile';
  if (!summary || summary.data_sufficiency === 'insufficient') {
    return 'Ancora da osservare';
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

function MetaItem({ icon, label }: { icon: IconName; label: string }) {
  return (
    <View style={styles.metaItem}>
      <Ionicons name={icon} size={15} color="#06B6D4" />
      <Text style={styles.metaLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#F8FAFC',
    overflow: 'hidden',
  },
  curve: {
    position: 'absolute',
    top: -40,
    left: '-18%',
    width: '136%',
    height: 220,
    backgroundColor: '#DDF2F8',
    borderBottomLeftRadius: 220,
    borderBottomRightRadius: 220,
  },
  safe: {
    flex: 1,
  },
  scroll: {
    flex: 1,
  },
  content: {
    width: '100%',
    maxWidth: 560,
    alignSelf: 'center',
    paddingHorizontal: 20,
    paddingBottom: 40,
  },
  topBar: {
    minHeight: 40,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    marginBottom: 4,
  },
  topBarSpacer: {
    flex: 1,
  },
  settingsButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  identity: {
    alignItems: 'center',
    marginBottom: 28,
  },
  avatarWrap: {
    position: 'relative',
    marginBottom: 14,
  },
  avatarHalo: {
    width: AVATAR_SIZE + 8,
    height: AVATAR_SIZE + 8,
    borderRadius: (AVATAR_SIZE + 8) / 2,
    borderWidth: 4,
    borderColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    shadowColor: '#0E2A47',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.12,
    shadowRadius: 14,
    elevation: 4,
    overflow: 'hidden',
  },
  editBadge: {
    position: 'absolute',
    right: 2,
    bottom: 2,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#0284C7',
    borderWidth: 2,
    borderColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#0E2A47',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 6,
    elevation: 2,
  },
  name: {
    fontSize: 26,
    fontWeight: '700',
    color: '#1A2B48',
  },
  metaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 14,
    marginTop: 10,
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  metaLabel: {
    fontSize: 13,
    fontWeight: '500',
    color: '#64748B',
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  sectionHeaderSpaced: {
    marginTop: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1A2B48',
  },
  secondaryTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#1A2B48',
  },
  sectionTitleSpaced: {
    marginTop: 24,
    marginBottom: 12,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#EDF2F7',
    padding: 18,
    shadowColor: '#0E2A47',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 2,
  },
  patternRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 44,
  },
  patternIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: '#E0F2FE',
    alignItems: 'center',
    justifyContent: 'center',
  },
  patternText: {
    flex: 1,
    fontSize: 15,
    fontWeight: '500',
    color: '#1A2B48',
  },
  patternEmpty: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  patternEmptyCopy: {
    flex: 1,
    gap: 6,
  },
  patternEmptyText: {
    flex: 1,
    fontSize: 14,
    color: '#64748B',
    lineHeight: 20,
  },
  divider: {
    height: 1,
    backgroundColor: '#F1F5F9',
    marginVertical: 12,
  },
  inlineMessage: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  pillRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  statePill: {
    paddingVertical: 8,
    paddingHorizontal: 18,
    borderRadius: 9999,
  },
  statePillText: {
    fontSize: 14,
    fontWeight: '600',
  },
  linkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  linkIcon: {
    width: 42,
    height: 42,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  linkBody: {
    flex: 1,
  },
  linkTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1A2B48',
  },
  linkSubtitle: {
    marginTop: 2,
    fontSize: 13,
    fontWeight: '400',
    color: '#64748B',
  },
  pillButton: {
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderRadius: 9999,
    backgroundColor: '#E0F2FE',
  },
  pillButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#0284C7',
  },
  photoRow: {
    flexDirection: 'row',
    gap: 8,
  },
  notesEmpty: {
    marginBottom: 12,
    color: '#94A3B8',
    fontSize: 14,
  },
  noteCard: {
    gap: 8,
    marginBottom: 12,
  },
  memoryPreviewRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  memoryPreviewFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#E2E8F0',
    paddingTop: 12,
    marginTop: 4,
  },
  memoryPreviewLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  noteText: {
    color: '#1A2B48',
    fontSize: 14,
    lineHeight: 20,
  },
  noteMeta: {
    color: '#0D9488',
    fontSize: 12,
    fontWeight: '600',
  },
  noteActionPrimary: {
    color: '#0284C7',
    fontSize: 14,
    fontWeight: '600',
  },
  noteError: {
    marginBottom: 12,
    color: '#DC2626',
    fontSize: 14,
  },
  notesErrorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 12,
  },
  editProfileCard: {
    marginTop: 24,
  },
  pressed: {
    opacity: 0.72,
  },
});
