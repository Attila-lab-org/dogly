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
import { currentAgeLabel } from '@/features/dogs/profileDates';
import { relativeCareDate } from '@/features/care/date';
import { useCareEvents } from '@/features/care/store';

type IconName = keyof typeof Ionicons.glyphMap;

export default function DogProfileTabScreen() {
  const router = useRouter();
  const { dog } = useDogProfile();
  const careEvents = useCareEvents(dog.id);
  const { width } = useWindowDimensions();
  const photoSize = Math.floor(
    (width - spacing.lg * 2 - spacing.sm * 2) / 3,
  );

  const activePeriod = feedingPeriodsMock.find((period) => period.endedAt === null);
  const activeFood = activePeriod
    ? foodProductsMock.find((food) => food.id === activePeriod.foodProductId)
    : undefined;
  const previewPhotos = photosForAlbum(albumsMock[0]?.id ?? '').slice(0, 3);
  const nextCare = careEvents.find((event) => event.status === 'SCHEDULED');

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
            icon="camera-outline"
            label="Storia"
            onPress={() => router.push('/(tabs)/camera')}
          />
          <View style={styles.actionDivider} />
          <QuickAction
            icon="images-outline"
            label="Album"
            onPress={() => router.push(`/dogs/${dog.id}/album` as never)}
          />
          <View style={styles.actionDivider} />
          <QuickAction
            icon="calendar-outline"
            label="Diario"
            onPress={() => router.push('/(tabs)/diary')}
          />
        </Card>

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
                router.push(`/dogs/${dog.id}/album/photo/${photo.id}` as never)
              }
            />
          ))}
        </View>

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
              digestiveBaselineMock.variability === 'bassa'
                ? 'Stabile'
                : 'Da osservare'
            }
            onPress={() => router.push('/digestive/capture')}
          />
          <WellnessCard
            icon="nutrition-outline"
            iconColor={colors.primary}
            iconBackground={colors.primarySoft}
            label="Alimentazione"
            value={activeFood?.brand ?? 'Aggiungi cibo'}
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
    flex: 1,
    color: colors.text,
    fontSize: typography.size.md,
    fontWeight: typography.weight.semibold,
  },
  pressed: {
    opacity: 0.7,
  },
});
