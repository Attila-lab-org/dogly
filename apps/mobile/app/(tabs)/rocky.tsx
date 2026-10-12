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
import { DogAvatar } from '@/features/core/components';
import { useDogProfile } from '@/features/core/useDogProfile';
import { PhotoThumbnail } from '@/features/photos/components';
import { fetchDogPhotos } from '@/features/photos/api';
import { currentAgeLabel } from '@/features/dogs/profileDates';
import { sexLabel } from '@/features/dogs/map';
import { useSession } from '@/features/auth/SessionProvider';
import { isPersistedId } from '@/lib/persistedId';
import { usePersonalPatterns } from '@/features/patterns/api';

import { DogCareOverview } from '@/features/dogs/DogCareOverview';

type IconName = keyof typeof Ionicons.glyphMap;

export default function DogProfileTabScreen() {
  const router = useRouter();
  const { dog } = useDogProfile();
  const { usingMockGate } = useSession();
  const useDemoData = usingMockGate;
  const { width } = useWindowDimensions();
  const contentWidth = Math.min(width, 560);

  const photosQuery = useQuery({
    queryKey: ['gallery-dog-photos', dog.id, 3],
    queryFn: () => fetchDogPhotos(dog.id, 3),
    enabled: !useDemoData && isPersistedId(dog.id),
  });
  const previewPhotos = (photosQuery.data ?? []).slice(0, 3);
  const patternsQuery = usePersonalPatterns(dog.id);
  const learnedPatterns = patternsQuery.patterns
    .filter((pattern) => pattern.state !== 'ARCHIVED')
    .slice(0, 2);

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
              {sexLabel(dog.sex) ? (
                <MetaPill icon="male-female-outline" label={sexLabel(dog.sex)!} />
              ) : null}
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
        <DogCareOverview dogId={dog.id} dogName={dog.name} />

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>
            Cosa sto imparando su {dog.name}
          </Text>
        </View>
        {patternsQuery.live && patternsQuery.isLoading ? (
          <View style={styles.detailsRow}>
            <Text style={styles.detailsSubtitle}>
              Sto iniziando a conoscere {dog.name}…
            </Text>
          </View>
        ) : patternsQuery.live && patternsQuery.isError ? (
          <View style={styles.detailsRow}>
            <Text style={styles.detailsSubtitle}>
              Non riesco a caricare ciò che sto imparando.
            </Text>
            <Pressable onPress={() => void patternsQuery.refetch()}>
              <Text style={styles.seeAll}>Riprova</Text>
            </Pressable>
          </View>
        ) : learnedPatterns.length ? (
          <View>
            {learnedPatterns.map((pattern) => (
              <Pressable key={pattern.id} accessibilityRole="button" accessibilityLabel={pattern.title}
                onPress={() => router.push(`/patterns/${pattern.id}` as never)} style={styles.detailsRow}>
                <View style={styles.detailsIcon}><Ionicons name="sparkles-outline" size={20} color={colors.primary} /></View>
                <View style={styles.detailsText}><Text style={styles.detailsTitle}>{pattern.title}</Text></View>
                <Ionicons name="chevron-forward" size={19} color={colors.textMuted} />
              </Pressable>
            ))}
            <Pressable accessibilityRole="button" onPress={() => router.push('/patterns')} style={styles.memoryLink}><Text style={styles.seeAll}>Vedi tutte le osservazioni</Text></Pressable>
          </View>
        ) : (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Mostra a DOGly un momento di ${dog.name}`}
            onPress={() => router.push('/behavior/capture')}
            style={styles.detailsRow}
          >
            <View style={styles.detailsIcon}>
              <Ionicons name="videocam-outline" size={20} color={colors.primary} />
            </View>
            <View style={styles.detailsText}>
              <Text style={styles.detailsTitle}>Fammi vedere un momento</Text>
              <Text style={styles.detailsSubtitle}>
                Così inizio a conoscerlo meglio
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={19} color={colors.textMuted} />
          </Pressable>
        )}

        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Informazioni che ricordo su ${dog.name}`}
          onPress={() => router.push(`/dogs/${dog.id}/memories` as never)}
          style={styles.memoryLink}
        >
          <Ionicons name="bookmark-outline" size={20} color="#0066FF" />
          <View style={styles.memoryCopy}>
            <Text style={styles.memoryTitle}>Informazioni che ricordo</Text>
            <Text style={styles.memoryHint}>Puoi rivederle, correggerle o eliminarle.</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color="#64748B" />
        </Pressable>

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>I suoi momenti</Text>
          <View style={styles.sectionActions}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Vedi tutti i momenti di ${dog.name}`}
              onPress={() => router.push(`/dogs/${dog.id}/album` as never)}
              hitSlop={8}
            >
              <Text style={styles.seeAll}>Album</Text>
            </Pressable>

          </View>
        </View>
        {photosQuery.isLoading ? (
          <View style={styles.emptyMoments}>
            <Text style={styles.emptyMomentsSubtitle}>Carico i suoi momenti…</Text>
          </View>
        ) : photosQuery.isError ? (
          <View style={styles.emptyMoments}>
            <Text style={styles.emptyMomentsSubtitle}>
              Non riesco a caricare i suoi momenti.
            </Text>
            <Pressable onPress={() => void photosQuery.refetch()}>
              <Text style={styles.seeAll}>Riprova</Text>
            </Pressable>
          </View>
        ) : previewPhotos.length > 0 ? (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.photoRail}
            >
              {previewPhotos.map((photo) => (
                <PhotoThumbnail
                  key={photo.id}
                  photo={photo}
                  size={Math.min(contentWidth * 0.68, 250)}
                  onPress={() =>
                    router.push(
                      `/dogs/${dog.id}/album/photo/${photo.id}?albumId=${photo.albumId}` as never,
                    )
                  }
                />
              ))}
            </ScrollView>
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

        <Pressable accessibilityRole="button" accessibilityLabel="Luoghi utili nelle vicinanze"
          onPress={() => router.push('/(tabs)/around' as never)} style={styles.memoryLink}>
          <Ionicons name="location-outline" size={20} color="#0066FF" />
          <View style={styles.memoryCopy}><Text style={styles.memoryTitle}>Luoghi utili nelle vicinanze</Text><Text style={styles.memoryHint}>Parchi e veterinari sulla mappa</Text></View>
          <Ionicons name="chevron-forward" size={18} color="#64748B" />
        </Pressable>
      </ScrollView>
    </View>
  );
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
  memoryLink: { minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 16, marginVertical: 8 },
  memoryCopy: { flex: 1, gap: 4 },
  memoryTitle: { color: '#1A2B48', fontSize: 15, fontWeight: '600' },
  memoryHint: { color: '#64748B', fontSize: 13, lineHeight: 19 },
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
  sectionActions: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  welcomeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginBottom: spacing.xxl,
    padding: spacing.lg,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.accentSoft,
    ...shadows.card,
  },
  welcomeIcon: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accentSoft,
  },
  welcomeCopy: { flex: 1 },
  welcomeTitle: {
    color: colors.text,
    fontSize: typography.size.md,
    fontWeight: typography.weight.bold,
  },
  welcomeText: {
    marginTop: spacing.xs,
    color: colors.textSecondary,
    fontSize: typography.size.sm,
    lineHeight: typography.size.sm * typography.lineHeight.relaxed,
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
  photoRail: {
    gap: spacing.md,
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
  moreToggle: {
    marginBottom: spacing.xxl,
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
