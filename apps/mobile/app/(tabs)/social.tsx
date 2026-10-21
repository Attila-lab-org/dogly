/**
 * Tab Social: hero connessione con anello storia (gradiente se non vista,
 * "+" per aggiungere), settimana con dati reali (passeggiate + record
 * Bau Match), segment Giochi/Luoghi come filtro vero, sezioni sotto.
 */
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import Svg, {
  Circle,
  Defs,
  Ellipse,
  LinearGradient as SvgLinearGradient,
  Path,
  Stop,
} from 'react-native-svg';
import { WorldBackdrop } from '@/components/WorldBackdrop';
import Animated, { FadeInUp, useReducedMotion } from 'react-native-reanimated';
import { colors, radius, spacing, typography } from '@/theme/tokens';
import { DogAvatar } from '@/features/core/components';
import { SpringPress } from '@/components/pressSpring';
import { useDogProfile } from '@/features/core/useDogProfile';
import { GamesSection } from '@/features/social/GamesSection';
import { NearbyPlacesSection } from '@/features/social/NearbyPlacesSection';
import { WalkHistorySection } from '@/features/walk/WalkHistorySection';
import { useSession } from '@/features/auth/SessionProvider';
import { isApiConfigured } from '@/features/auth/env';
import { fetchStories } from '@/features/photos/api';
import { getLastSeenPhotoId, setLastSeenPhotoId } from '@/features/social/storySeen';
import { useStoryUpload } from '@/features/social/useStoryUpload';
import { fetchWalkHistory } from '@/features/walk/history';
import { loadMatchBest } from '@/features/games/matchLogic';
import { hapticLight } from '@/lib/haptics';
import { PageGuide } from '@/features/guide/PageGuide';

/** Lunedì della settimana corrente a mezzanotte locale. */
function weekStart(now = new Date()): number {
  const monday = new Date(now);
  monday.setHours(0, 0, 0, 0);
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
  return monday.getTime();
}

/** Anello storia sul grande avatar del ConnectionHero. */
function StoryRing({ state }: { state: 'none' | 'seen' | 'unseen' }) {
  if (state === 'none') return null;
  if (state === 'seen') {
    return (
      <View style={styles.ringSeen} pointerEvents="none" />
    );
  }
  return (
    <Svg
      pointerEvents="none"
      width={176}
      height={176}
      viewBox="0 0 176 176"
      style={styles.ringSvg}
    >
      <Defs>
        <SvgLinearGradient id="heroStoryRing" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor="#F58529" />
          <Stop offset="0.45" stopColor="#DD2A7B" />
          <Stop offset="0.75" stopColor="#8134AF" />
          <Stop offset="1" stopColor="#14B8A6" />
        </SvgLinearGradient>
      </Defs>
      <Circle
        cx={88}
        cy={88}
        r={80}
        stroke="url(#heroStoryRing)"
        strokeWidth={6}
        fill="none"
      />
      <Path d="M12 58 a80 80 0 0 1 12 -22" stroke="#DD2A7B" strokeWidth={5} strokeLinecap="round" fill="none" />
      <Path d="M164 118 a80 80 0 0 1 -12 22" stroke="#14B8A6" strokeWidth={5} strokeLinecap="round" fill="none" />
    </Svg>
  );
}

function ConnectionHero({
  dogId,
  dogName,
  photoUri,
  realEnabled,
}: {
  dogId: string;
  dogName: string;
  photoUri?: string | null;
  realEnabled: boolean;
}) {
  const router = useRouter();
  const [refreshTick, setRefreshTick] = useState(0);
  const storiesQuery = useQuery({
    queryKey: ['social-stories', dogId, refreshTick],
    queryFn: () => fetchStories(dogId, 24),
    enabled: realEnabled,
    retry: 1,
  });
  const [lastSeenId, setLastSeenId] = useState<string | null>(null);
  const stories = storiesQuery.data ?? [];
  const newestId = stories[0]?.id ?? null;

  useEffect(() => {
    if (!dogId) return;
    let alive = true;
    void getLastSeenPhotoId(dogId).then((id) => {
      if (alive) setLastSeenId(id);
    });
    return () => {
      alive = false;
    };
  }, [dogId, refreshTick]);

  const { uploading, addStory } = useStoryUpload(dogId, dogName, () =>
    setRefreshTick((tick) => tick + 1),
  );

  const storyState: 'none' | 'seen' | 'unseen' = !newestId
    ? 'none'
    : !lastSeenId || newestId !== lastSeenId
      ? 'unseen'
      : 'seen';

  const openStory = () => {
    if (!newestId) return;
    void hapticLight();
    void setLastSeenPhotoId(dogId, newestId).then(() => setLastSeenId(newestId));
    router.push({
      pathname: '/story/viewer',
      params: { dogId, startIndex: '0' },
    } as never);
  };

  const walksQuery = useQuery({
    queryKey: ['social-week-walks', dogId],
    queryFn: () => fetchWalkHistory(dogId, 60),
    enabled: realEnabled,
    retry: 1,
  });
  const [matchBest, setMatchBest] = useState<number | null>(null);
  useEffect(() => {
    let alive = true;
    void loadMatchBest(dogId).then((value) => {
      if (alive) setMatchBest(value);
    });
    return () => {
      alive = false;
    };
  }, [dogId]);

  // Solo dati veri: passeggiate della settimana (storico reale) + record
  // Bau Match (kv locale). Delta solo se la scorsa settimana è calcolabile.
  const walks = walksQuery.data ?? [];
  const start = weekStart();
  const walksThisWeek = walks.filter((w) => Date.parse(w.started_at) >= start).length;
  const walksPrevWeek = walks.filter((w) => {
    const at = Date.parse(w.started_at);
    return at < start && at >= start - 7 * 24 * 60 * 60 * 1000;
  }).length;
  const showWeekCard = realEnabled && (walks.length > 0 || (matchBest ?? 0) > 0);

  return (
    <>
      <View style={styles.header}>
        <View>
          <Text style={styles.eyebrow}>SOCIAL</Text>
          <Text style={styles.title}>{dogName} & te</Text>
        </View>
        <View style={styles.headerPaw}>
          <Ionicons name="paw" size={24} color="#069A86" />
        </View>
      </View>

      <View style={styles.connectionHero}>
        <Svg pointerEvents="none" style={StyleSheet.absoluteFill} viewBox="0 0 360 270">
          <Ellipse cx={58} cy={55} rx={52} ry={36} fill="#DFF5F0" opacity={0.8} />
          <Ellipse cx={304} cy={204} rx={58} ry={42} fill="#E4F7EF" opacity={0.8} />
        </Svg>
        <View style={styles.storyAvatarWrap}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={
              storyState === 'unseen'
                ? `Apri la storia di ${dogName} (non vista)`
                : storyState === 'seen'
                  ? `Apri la storia di ${dogName}`
                  : `Aggiungi la prima storia di ${dogName}`
            }
            onPress={storyState === 'none' ? addStory : openStory}
            style={styles.storyAvatarPress}
          >
            <StoryRing state={storyState} />
            <View style={styles.connectionAvatar}>
              <DogAvatar photoUri={photoUri} dogName={dogName} size={118} />
            </View>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Aggiungi una storia"
            onPress={addStory}
            disabled={uploading}
            hitSlop={10}
            style={styles.storyAdd}
          >
            {uploading ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <Ionicons name="add" size={18} color="#FFFFFF" />
            )}
          </Pressable>
        </View>
        <Text style={styles.connectionTitle}>State imparando{'\n'}a conoscervi</Text>
        <Ionicons name="heart" size={19} color="#54C9A8" />
      </View>

      {showWeekCard ? (
        <View style={styles.weekCard}>
          <View style={styles.weekHeader}>
            <Text style={styles.weekTitle}>La vostra settimana</Text>
            <Ionicons name="stats-chart" size={20} color="#079B88" />
          </View>
          <View style={styles.weekStats}>
            <View style={styles.weekStat}>
              <Ionicons name="paw" size={23} color="#45C3A1" />
              <Text style={styles.weekValue}>{walksThisWeek}</Text>
              <Text style={styles.weekLabel}>passeggiate</Text>
              {walksPrevWeek > 0 ? (
                <Text style={styles.weekDelta}>
                  {walksThisWeek >= walksPrevWeek ? '+' : ''}
                  {walksThisWeek - walksPrevWeek} rispetto{'\n'}alla scorsa
                </Text>
              ) : null}
            </View>
            <View style={styles.weekDivider} />
            <View style={styles.weekStat}>
              <Ionicons name="tennisball" size={23} color="#079B88" />
              <Text style={styles.weekValue}>{matchBest ?? 0}</Text>
              <Text style={styles.weekLabel}>record Bau Match</Text>
            </View>
          </View>
        </View>
      ) : null}

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Passeggia con ${dogName}`}
        onPress={() => router.push('/walk' as never)}
        style={({ pressed }) => [styles.continueButton, pressed && styles.pressed]}
      >
        <Ionicons name="walk" size={19} color="#FFFFFF" />
        <Text style={styles.continueText}>Passeggia con {dogName}</Text>
        <Ionicons name="chevron-forward" size={19} color="#FFFFFF" />
      </Pressable>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Vedi attività recenti nel diario"
        onPress={() => router.push('/(tabs)/diary' as never)}
        style={styles.recentLink}
      >
        <Text style={styles.recentText}>Vedi attività recenti</Text>
        <Ionicons name="chevron-forward" size={16} color="#0A4D79" />
      </Pressable>
    </>
  );
}

export default function SocialScreen() {
  const { dog } = useDogProfile();
  const { userId, usingMockGate } = useSession();
  const realEnabled = Boolean(userId) && isApiConfigured() && !usingMockGate;
  const reducedMotion = useReducedMotion();
  // Segment = filtro vero: mostra una delle due sezioni alla volta.
  const [showGames, setShowGames] = useState(true);
  const enter = (delay: number) =>
    reducedMotion ? undefined : FadeInUp.duration(320).delay(delay);

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <WorldBackdrop world="social" />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <ConnectionHero
          dogId={dog.id}
          dogName={dog.name}
          photoUri={dog.photoUri}
          realEnabled={realEnabled}
        />
        <Animated.View entering={enter(80)}>
          <WalkHistorySection dogId={dog.id} dogName={dog.name} enabled={realEnabled} variant="activity" />
        </Animated.View>
        <View style={styles.discoverHeader}>
          <Text style={styles.discoverTitle}>Scopri insieme</Text>
          <View style={styles.segment}>
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ selected: showGames }}
              accessibilityLabel="Mostra i giochi"
              onPress={() => {
                void hapticLight();
                setShowGames(true);
              }}
              style={[styles.segmentItem, showGames && styles.segmentActive]}
            >
              <Ionicons name="game-controller" size={17} color={showGames ? colors.tealDeep : colors.textSecondary} />
              <Text style={showGames ? styles.segmentActiveText : styles.segmentText}>Giochi</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ selected: !showGames }}
              accessibilityLabel="Mostra i luoghi utili"
              onPress={() => {
                void hapticLight();
                setShowGames(false);
              }}
              style={[styles.segmentItem, !showGames && styles.segmentActive]}
            >
              <Ionicons name="location-outline" size={17} color={!showGames ? colors.tealDeep : colors.textSecondary} />
              <Text style={!showGames ? styles.segmentActiveText : styles.segmentText}>Luoghi</Text>
            </Pressable>
          </View>
        </View>
        {showGames ? (
          <Animated.View entering={enter(150)}>
            <GamesSection />
          </Animated.View>
        ) : (
          <Animated.View entering={enter(150)}>
            <NearbyPlacesSection />
          </Animated.View>
        )}
      </ScrollView>
      <PageGuide page="social" dogId={dog.id} dogName={dog.name} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  discoverHeader: { paddingHorizontal: spacing.lg, paddingTop: spacing.lg, gap: 10 },
  discoverTitle: { color: colors.text, fontSize: 28, lineHeight: 33, fontWeight: typography.weight.bold, letterSpacing: -0.8 },
  segment: { minHeight: 48, borderRadius: 25, borderWidth: 1, borderColor: colors.border, flexDirection: 'row', padding: 3, backgroundColor: 'rgba(255,255,255,0.72)' },
  segmentActive: { backgroundColor: colors.tealPale },
  segmentItem: { flex: 1, borderRadius: 22, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 },
  segmentActiveText: { color: colors.text, fontSize: 15, fontWeight: typography.weight.bold },
  segmentText: { color: colors.textSecondary, fontSize: 15, fontWeight: typography.weight.semibold },
  content: { paddingBottom: spacing.xxxl, gap: spacing.md },
  header: { paddingHorizontal: spacing.lg, paddingTop: spacing.md, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  eyebrow: { color: colors.tealDeep, fontSize: 11, fontWeight: typography.weight.bold, letterSpacing: 1.6 },
  title: { color: colors.text, fontSize: 32, lineHeight: 37, fontWeight: typography.weight.bold, letterSpacing: -1.1, marginTop: 3 },
  headerPaw: { width: 46, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center' },
  connectionHero: { minHeight: 272, alignItems: 'center', justifyContent: 'center', gap: 7, marginHorizontal: spacing.lg, overflow: 'hidden' },
  storyAvatarWrap: { width: 176, height: 176, alignItems: 'center', justifyContent: 'center' },
  storyAvatarPress: { width: 176, height: 176, alignItems: 'center', justifyContent: 'center' },
  ringSvg: { position: 'absolute' },
  ringSeen: {
    position: 'absolute',
    width: 164,
    height: 164,
    borderRadius: 82,
    borderWidth: 3,
    borderColor: '#CBD8D4',
  },
  connectionAvatar: { width: 150, height: 150, borderRadius: 75, borderWidth: 8, borderColor: '#FFFFFF', backgroundColor: '#EFF8F4', alignItems: 'center', justifyContent: 'center', shadowColor: colors.text, shadowOpacity: 0.12, shadowRadius: 16, shadowOffset: { width: 0, height: 8 }, elevation: 4 },
  storyAdd: {
    position: 'absolute',
    right: 2,
    bottom: 6,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.primary,
    borderWidth: 3,
    borderColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
  },
  connectionTitle: { color: colors.text, fontSize: 20, lineHeight: 23, fontWeight: typography.weight.bold, textAlign: 'center' },
  weekCard: { marginHorizontal: spacing.lg, padding: spacing.lg, borderRadius: 24, backgroundColor: 'rgba(255,255,255,0.88)', borderWidth: 1, borderColor: colors.border, shadowColor: colors.text, shadowOpacity: 0.08, shadowRadius: 12, shadowOffset: { width: 0, height: 5 }, elevation: 2 },
  weekHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.md },
  weekTitle: { color: colors.text, fontSize: 21, fontWeight: typography.weight.bold },
  weekStats: { flexDirection: 'row', alignItems: 'stretch' },
  weekStat: { flex: 1, alignItems: 'center', gap: 3 },
  weekDivider: { width: 1, backgroundColor: colors.border, marginVertical: 3 },
  weekValue: { color: colors.text, fontSize: 26, lineHeight: 29, fontWeight: typography.weight.bold },
  weekLabel: { color: colors.textSecondary, fontSize: 12, textAlign: 'center' },
  weekDelta: { color: colors.textMuted, fontSize: 10, lineHeight: 14, textAlign: 'center', marginTop: 5 },
  continueButton: { marginHorizontal: spacing.lg, minHeight: 58, borderRadius: 29, paddingHorizontal: spacing.lg, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, backgroundColor: colors.text, shadowColor: colors.text, shadowOpacity: 0.18, shadowRadius: 12, shadowOffset: { width: 0, height: 7 }, elevation: 3 },
  continueText: { flex: 1, color: '#FFFFFF', fontSize: 16, fontWeight: typography.weight.bold },
  recentLink: { alignSelf: 'center', flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: spacing.sm },
  recentText: { color: colors.primary, fontSize: 14, fontWeight: typography.weight.semibold, textDecorationLine: 'underline' },
  pressed: { opacity: 0.82, transform: [{ scale: 0.985 }] },
});
