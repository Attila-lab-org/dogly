/** Home: conversazione, momenti da mostrare e osservazioni da ritrovare. */
import React, { useState } from 'react';
import {
  ActivityIndicator,
  AppState,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeInUp, useReducedMotion } from 'react-native-reanimated';
import { Skeleton } from '@/components/Skeleton';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, radius, spacing, typography } from '@/theme/tokens';
import { CuteIcon, type CuteIconName } from '@/components/CuteIcon';
import { DogHero } from '@/features/home/DogHero';
import { HomeNextAction } from '@/features/home/HomeNextAction';
import { WalkLaunchCard } from '@/features/walk/WalkLaunchCard';
import { DiaryVideoPreview } from '@/features/home/DiaryVideoPreview';
import { useDogProfile } from '@/features/core/useDogProfile';
import { useCareEvents } from '@/features/care/store';
import { useHomeData } from '@/features/home/useHomeData';
import { useNetworkStatus } from '@/features/home/useNetworkStatus';
import { insightToneLabel } from '@/features/home/api';
import type { InsightTone, LastInsight } from '@/features/core/types';
import { useQuery } from '@tanstack/react-query';
import { fetchDogPhotos } from '@/features/photos/api';
import { isPersistedId } from '@/lib/persistedId';
import { useSession } from '@/features/auth/SessionProvider';
import { purchasesEnabled } from '@/mocks/entitlements';
import { SpringPress } from '@/components/pressSpring';
import { usePressSpring } from '@/components/pressSpring';
import {
  hydrateReadNotificationKeys,
  notificationKey,
  useReadNotificationKeys,
} from '@/features/notifications/readState';

const logoMarkSource = require('../../assets/brand/dogly-logo-mark.png');

export default function HomeScreen() {
  const router = useRouter();
  const { dog } = useDogProfile();
  const readKeys = useReadNotificationKeys();
  React.useEffect(() => {
    void hydrateReadNotificationKeys();
  }, []);
  const unreadReminderCount = useCareEvents(dog.id, dog.name).filter(
    (event) =>
      event.status === 'SCHEDULED' &&
      event.reminderEnabled &&
      Date.parse(event.scheduledAt) >= Date.now() &&
      !readKeys.has(notificationKey('care', event.id)),
  ).length;
  const reducedMotion = useReducedMotion();
  // Entrata scenica: le entering animation di Reanimated corrono solo al
  // mount, quindi refresh/focus successivi non rianimano le sezioni.
  const sceneEnter = (delay: number) =>
    reducedMotion ? undefined : FadeInUp.duration(320).delay(delay);
  const { usage, recentInsights, processingEventId, loading, error, refetch } =
    useHomeData(dog.id);
  React.useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') refetch();
    });
    return () => subscription.remove();
  }, [refetch]);
  const unreadResultCount = recentInsights.filter(
    (insight) => !readKeys.has(notificationKey('result', insight.eventId)),
  ).length;
  const unreadNotificationCount = unreadReminderCount + unreadResultCount;
  const network = useNetworkStatus();
  const { usingMockGate } = useSession();
  const photos = useQuery({
    queryKey: ['gallery-dog-photos', dog.id, 8],
    queryFn: () => fetchDogPhotos(dog.id, 8),
    enabled: !usingMockGate && isPersistedId(dog.id),
    staleTime: 30_000,
  });

  const behaviorRemaining = usage
    ? usage.behaviorLimit - usage.behaviorUsed
    : null;
  const quotaExhausted = behaviorRemaining !== null && behaviorRemaining <= 0;

  return (
    <View style={styles.root}>
      <LinearGradient
        pointerEvents="none"
        colors={['#EAF4FF', '#F4F8FC', colors.background]}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 0.62 }}
        style={StyleSheet.absoluteFill}
      />
      <SafeAreaView edges={['top']} style={styles.safe}>
        <ScrollView
          contentInsetAdjustmentBehavior="automatic"
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.headerRow}>
            <View style={styles.brand} accessible accessibilityLabel="Dogly">
              <Image source={logoMarkSource} style={styles.logoMark} resizeMode="contain" />
              <Text style={styles.wordmark}>Dogly</Text>
            </View>
            <View style={styles.headerActions}>
              <SpringPress
                accessibilityRole="button"
                accessibilityLabel="Aiuto rapido: veterinario e numeri utili"
                onPress={() => router.push('/aiuto' as never)}
                hitSlop={12}
                pressableStyle={[styles.headerIcon, styles.careIcon]}
              >
                <CuteIcon name="doctor" size={22} color="#D9796C" secondary="#FFFFFF" />
              </SpringPress>
              <SpringPress
                accessibilityRole="button"
                accessibilityLabel={
                  unreadNotificationCount > 0
                    ? `Notifiche, ${unreadNotificationCount} non lette`
                    : 'Notifiche'
                }
                onPress={() => router.push('/notifications' as never)}
                hitSlop={12}
                pressableStyle={styles.headerIcon}
              >
                <Ionicons name="notifications-outline" size={22} color={colors.text} />
                {unreadNotificationCount > 0 ? <View style={styles.headerDot} /> : null}
              </SpringPress>
              <SpringPress
                accessibilityRole="button"
                accessibilityLabel="Apri il profilo del cane"
                onPress={() => router.push('/(tabs)/rocky')}
                hitSlop={12}
                pressableStyle={styles.headerIcon}
              >
                {dog.photoUri ? <Image source={{ uri: dog.photoUri }} style={styles.headerAvatar} /> : <Ionicons name="paw-outline" size={22} color={colors.text} />}
              </SpringPress>
            </View>
          </View>

          {network.offline ? (
            <View style={styles.statusBanner} accessibilityLiveRegion="polite">
              <Ionicons name="cloud-offline-outline" size={18} color={colors.danger} />
              <Text style={styles.statusText}>
                Sei offline. La conversazione e le nuove letture richiedono connessione.
              </Text>
              <SpringPress
                accessibilityRole="button"
                accessibilityLabel="Riprova connessione"
                onPress={() => void network.refresh()}
                hitSlop={8}
                pressableStyle={styles.inlineRetry}
              >
                <Text style={styles.statusRetry}>Riprova</Text>
              </SpringPress>
            </View>
          ) : null}

          {loading && !network.offline ? (
            <View style={styles.statusBanner} accessibilityLiveRegion="polite">
              <ActivityIndicator size="small" color={colors.primary} />
              <Text style={styles.statusText}>Preparo lo spazio di {dog.name}.</Text>
            </View>
          ) : null}

          {error && !network.offline ? (
            <View style={styles.statusBanner} accessibilityLiveRegion="assertive">
              <Ionicons name="alert-circle-outline" size={18} color={colors.danger} />
              <Text style={styles.statusText}>Non sono riuscito ad aggiornare i momenti.</Text>
              <SpringPress
                accessibilityRole="button"
                accessibilityLabel="Riprova a caricare i momenti"
                onPress={refetch}
                hitSlop={8}
                pressableStyle={styles.inlineRetry}
              >
                <Text style={styles.statusRetry}>Riprova</Text>
              </SpringPress>
            </View>
          ) : null}

          <Animated.View entering={sceneEnter(0)} style={styles.heroStage}>
            <LinearGradient
              pointerEvents="none"
              colors={['#D2E7F8', '#E7F3FC', '#F4F9FF', colors.background]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={StyleSheet.absoluteFill}
            />
            <View pointerEvents="none" style={styles.heroStageOrb} />
            <DogHero dogId={dog.id} dogName={dog.name} photoUri={dog.photoUri} breedLabel={dog.breedLabel} birthDate={dog.birthDate} ageLabel={dog.ageLabel} sizeLabel={dog.sizeLabel} />
          </Animated.View>

           {processingEventId ? (
             <SpringPress
              accessibilityRole="button"
              accessibilityLabel={`Apri la lettura in corso di ${dog.name}`}
              onPress={() => router.push(`/behavior/processing/${processingEventId}`)}
               pressableStyle={styles.processingBanner}
            >
              <View style={styles.processingIcon}>
                <ActivityIndicator size="small" color={colors.primary} />
              </View>
              <View style={styles.processingCopy}>
                <Text style={styles.processingTitle}>Sto leggendo il vostro momento</Text>
                <Text style={styles.processingText}>Puoi aprire lo stato e ritrovare il risultato nel Diario.</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.primary} />
             </SpringPress>
          ) : null}

          <Animated.View entering={sceneEnter(90)}>
            <HomeNextAction dogId={dog.id} dogName={dog.name} />
          </Animated.View>

          <WalkLaunchCard dogName={dog.name} />

          <Animated.View entering={sceneEnter(180)}>
            <View style={styles.sectionHeader}>
              <View>
                <Text style={styles.sectionTitle}>Momenti recenti</Text>
              </View>
              <SpringPress
                accessibilityRole="button"
                accessibilityLabel="Apri album"
                onPress={() => router.push(`/dogs/${dog.id}/album` as never)}
                hitSlop={8}
                pressableStyle={styles.sectionAction}
              >
                <Ionicons name="images-outline" size={15} color={colors.primary} />
                <Text style={styles.sectionActionText}>Album</Text>
                <Ionicons name="chevron-forward" size={14} color={colors.primary} />
              </SpringPress>
            </View>
          </Animated.View>

          {photos.isLoading ? (
            <View style={styles.momentsRow}>
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} style={{ flex: 1, aspectRatio: 1 }} height={100} borderRadius={14} />
              ))}
            </View>
           ) : photos.isError ? (
            <SpringPress onPress={() => void photos.refetch()} accessibilityRole="button" pressableStyle={styles.inlineRetry}><Text style={styles.seeAll}>Non riesco a caricare le foto · Riprova</Text></SpringPress>
          ) : (photos.data ?? []).length > 0 ? (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.hStrip}
              contentContainerStyle={styles.hStripContent}
              decelerationRate="fast"
            >
              {(photos.data ?? []).slice(0, 8).map((photo) => (
                <MomentCard
                  key={photo.id}
                  accessibilityLabel={photo.caption || 'Apri momento'}
                  onPress={() =>
                    router.push(
                      `/dogs/${dog.id}/album/photo/${photo.id}?albumId=${photo.albumId}` as never,
                    )
                  }
                  photoUri={photo.thumbnailUri}
                  caption={photo.caption || formatMomentStamp(photo.takenAt)}
                />
              ))}
            </ScrollView>
           ) : <SpringPress accessibilityRole="button" onPress={() => router.push(`/dogs/${dog.id}/album` as never)} pressableStyle={styles.emptyInsight}>
            <CuteIcon name="play" size={24} color={colors.accent} secondary={colors.accentSoft} />
            <Text style={styles.emptyText}>Aggiungi i primi Momenti di {dog.name}</Text>
           </SpringPress>}

          {recentInsights.length > 0 ? (
            <>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>Le ultime osservazioni</Text>
                <SpringPress
                  onPress={() => router.push('/(tabs)/diary')}
                  accessibilityRole="button"
                  pressableStyle={styles.sectionAction}
                >
                  <Ionicons name="book-outline" size={15} color={colors.primary} />
                  <Text style={styles.sectionActionText}>Diario</Text>
                  <Ionicons name="chevron-forward" size={14} color={colors.primary} />
                </SpringPress>
              </View>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={styles.hStrip}
                contentContainerStyle={styles.hStripContent}
                decelerationRate="fast"
              >
                {recentInsights.map((insight) => (
                  <InsightMomentCard
                    key={insight.eventId}
                    insight={insight}
                    onPress={() => router.push('/(tabs)/diary' as never)}
                  />
                ))}
              </ScrollView>
            </>
          ) : null}

          {behaviorRemaining !== null && behaviorRemaining <= 2 ? (
            <Text style={behaviorRemaining <= 0 ? styles.quotaWarning : styles.quota}>
              {behaviorRemaining <= 0
                ? purchasesEnabled
                  ? 'Hai usato le letture disponibili. Puoi continuare dal tuo piano.'
                  : 'Le letture disponibili torneranno presto.'
                : `${behaviorRemaining} ${behaviorRemaining === 1 ? 'lettura disponibile' : 'letture disponibili'} questo mese.`}
            </Text>
          ) : null}
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

function formatMomentStamp(iso: string): string {
  const date = new Date(iso);
  const dayMs = 24 * 60 * 60 * 1000;
  const startOf = (value: Date) =>
    Date.parse(
      `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`,
    );
  const diff = Math.round((startOf(new Date()) - startOf(date)) / dayMs);
  const time = date.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
  if (diff <= 0) return `Oggi ${time}`;
  if (diff === 1) return `Ieri ${time}`;
  return date.toLocaleDateString('it-IT', { day: 'numeric', month: 'short' });
}

const TONE_COVER: Record<InsightTone, readonly [string, string]> = {
  positive: ['#5EEAD4', '#2563EB'],
  neutral: ['#93C5FD', '#1D4ED8'],
  watch: ['#FDE68A', '#F59E0B'],
};

function insightCoverIcon(label: string, tone: InsightTone): CuteIconName {
  const lower = label.toLowerCase();
  if (/porta|uscire/.test(lower)) return 'door';
  if (/gioc|pupazzo|palla/.test(lower)) return 'play';
  if (/incoll|contatto|affetto|coccol/.test(lower)) return 'heart';
  if (/attenzion/.test(lower)) return 'attention';
  if (tone === 'watch') return 'alert';
  if (tone === 'positive') return 'play';
  return 'paw';
}

function MomentCard({
  photoUri,
  caption,
  onPress,
  accessibilityLabel,
}: {
  photoUri: string;
  caption: string;
  onPress: () => void;
  accessibilityLabel: string;
}) {
  const press = usePressSpring(0.975);
  return (
    <Animated.View style={[styles.momentCard, press.style]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        onPress={onPress}
        onPressIn={press.onPressIn}
        onPressOut={press.onPressOut}
      >
        <Image source={{ uri: photoUri }} style={styles.momentPhoto} />
        <Text style={styles.momentCaption} numberOfLines={1}>{caption}</Text>
      </Pressable>
    </Animated.View>
  );
}

function InsightMomentCard({
  insight,
  onPress,
}: {
  insight: LastInsight;
  onPress: () => void;
}) {
  const [mediaFailed, setMediaFailed] = useState(false);
  const press = usePressSpring(0.975);
  const icon = insightCoverIcon(insight.label, insight.tone);
  // Behavior moments are usually video; never feed a video URL into <Image>
  // (that produced the empty grey tiles).
  const kind =
    insight.mediaKind ?? (insight.mediaUri ? ('VIDEO' as const) : null);
  const showVideo = kind === 'VIDEO' && Boolean(insight.mediaUri) && !mediaFailed;
  const showPhoto = kind === 'PHOTO' && Boolean(insight.mediaUri) && !mediaFailed;
  const hasRealMedia = showVideo || showPhoto;

  return (
    <Animated.View style={[styles.momentCard, press.style]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Apri: ${insight.label}`}
        onPress={onPress}
        onPressIn={press.onPressIn}
        onPressOut={press.onPressOut}
      >
      <View style={styles.insightMedia}>
        <LinearGradient
          colors={[...TONE_COVER[insight.tone]]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
        {showVideo && insight.mediaUri ? (
          <DiaryVideoPreview
            uri={insight.mediaUri}
            fallback={
              <View style={styles.insightIconWrap}>
                <CuteIcon name="play" size={34} color="#FFFFFF" secondary="#FFFFFF" />
              </View>
            }
          />
        ) : null}
        {showPhoto && insight.mediaUri ? (
          <Image
            source={{ uri: insight.mediaUri }}
            style={styles.insightPhoto}
            onError={() => setMediaFailed(true)}
          />
        ) : null}
        {!hasRealMedia ? (
          <View style={styles.insightIconWrap}>
            <CuteIcon name={icon} size={36} color="#FFFFFF" secondary="#FFFFFF" />
          </View>
        ) : null}
        <LinearGradient
          colors={['rgba(14,42,71,0)', 'rgba(14,42,71,0.55)']}
          locations={[0.35, 1]}
          style={styles.insightScrim}
        />
        <View style={styles.tonePill}>
          <View
            style={[
              styles.toneDot,
              insight.tone === 'positive' && styles.toneDotPositive,
              insight.tone === 'watch' && styles.toneDotWatch,
              insight.tone === 'neutral' && styles.toneDotNeutral,
            ]}
          />
          <Text style={styles.toneText}>{insightToneLabel(insight.tone)}</Text>
        </View>
      </View>
      <Text style={styles.insightTitle} numberOfLines={2}>
        {insight.label}
      </Text>
      <Text style={styles.momentCaption} numberOfLines={1}>
        {insight.timestampLabel}
      </Text>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  safe: { flex: 1 },
  content: {
    width: '100%',
    maxWidth: 560,
    alignSelf: 'center',
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xl,
    gap: spacing.md,
  },
  heroStage: {
    position: 'relative',
    marginHorizontal: -20,
    marginVertical: -10,
    paddingHorizontal: 16,
    paddingTop: 26,
    paddingBottom: 42,
    borderRadius: 42,
    overflow: 'hidden',
  },
  heroStageOrb: {
    position: 'absolute',
    width: 280,
    height: 280,
    borderRadius: 140,
    right: -104,
    top: -136,
    backgroundColor: 'rgba(125,211,252,0.16)',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 48,
  },
  brand: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  logoMark: { width: 30, height: 24 },
  wordmark: {
    color: colors.text,
    fontSize: typography.size.lg,
    fontWeight: typography.weight.bold,
    letterSpacing: 0.5,
  },
  headerActions: { flexDirection: 'row', gap: spacing.xs },
  headerIcon: {
    width: 42,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.full,
    backgroundColor: colors.background,
  },
  careIcon: { backgroundColor: '#FFF1EE' },
  headerAvatar: { width: 34, height: 34, borderRadius: 17 },
  headerDot: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 9,
    height: 9,
    borderRadius: 5,
    backgroundColor: colors.danger,
    borderWidth: 1.5,
    borderColor: colors.surface,
  },
  hStrip: { marginHorizontal: -spacing.lg },
  hStripContent: {
    paddingHorizontal: spacing.lg,
    gap: 12,
    paddingBottom: 2,
  },
  momentCard: { width: 132, gap: 6 },
  momentsRow: { flexDirection: 'row', gap: 10 },
  momentPhoto: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: 18,
    backgroundColor: colors.surfaceMuted,
  },
  momentCaption: {
    color: colors.textMuted,
    fontSize: typography.size.xs,
  },
  statusBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  statusText: { flex: 1, color: colors.textSecondary, fontSize: typography.size.xs },
  statusRetry: { color: colors.primary, fontSize: typography.size.xs, fontWeight: typography.weight.bold },
  processingBanner: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.md, borderRadius: radius.lg, backgroundColor: colors.primarySoft },
  processingIcon: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center', borderRadius: radius.full, backgroundColor: colors.surface },
  processingCopy: { flex: 1, gap: 2 },
  processingTitle: { color: colors.text, fontSize: typography.size.sm, fontWeight: typography.weight.bold },
  processingText: { color: colors.textSecondary, fontSize: typography.size.xs },
  sectionHeader: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', marginTop: spacing.lg },
  sectionTitle: { color: colors.text, fontSize: typography.size.lg, fontWeight: typography.weight.bold },
  sectionAction: { minHeight: 34, flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, borderRadius: radius.full, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.primarySoft },
  sectionActionText: { color: colors.primary, fontSize: typography.size.xs, fontWeight: typography.weight.bold },
  inlineRetry: { paddingHorizontal: 6, paddingVertical: 5, borderRadius: radius.full },
  seeAll: { color: colors.primary, fontSize: typography.size.sm, fontWeight: typography.weight.bold },
  insightMedia: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: 18,
    overflow: 'hidden',
    backgroundColor: colors.primarySoft,
  },
  insightPhoto: {
    ...StyleSheet.absoluteFill,
    width: '100%',
    height: '100%',
  },
  insightIconWrap: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  insightScrim: {
    ...StyleSheet.absoluteFill,
  },
  insightTitle: {
    color: colors.text,
    fontSize: typography.size.xs,
    lineHeight: typography.size.xs * 1.35,
    fontWeight: typography.weight.bold,
  },
  tonePill: {
    position: 'absolute',
    left: 8,
    bottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: radius.full,
    backgroundColor: 'rgba(255,255,255,0.94)',
  },
  toneDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.textMuted },
  toneDotPositive: { backgroundColor: colors.success },
  toneDotNeutral: { backgroundColor: colors.primary },
  toneDotWatch: { backgroundColor: colors.warning },
  toneText: {
    color: colors.text,
    fontSize: 10,
    fontWeight: typography.weight.bold,
  },
  emptyInsight: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, width: '100%', padding: spacing.lg, borderRadius: radius.lg, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  emptyText: { color: colors.textSecondary, fontSize: typography.size.xs },
  quota: { color: colors.textMuted, fontSize: typography.size.xs, textAlign: 'center', marginTop: spacing.sm },
  quotaWarning: { color: colors.warning, fontSize: typography.size.xs, textAlign: 'center', marginTop: spacing.sm },
  pressed: { opacity: 0.84 },
});
