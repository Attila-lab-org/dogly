/**
 * Tab Social: storie Instagram (Momenti) + luoghi utili sotto.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useInfiniteQuery } from '@tanstack/react-query';
import { colors, spacing, typography } from '@/theme/tokens';
import { useDogProfile } from '@/features/core/useDogProfile';
import {
  fetchStories,
} from '@/features/photos/api';
import { StoryHeader } from '@/features/social/StoryHeader';
import Animated, { FadeInUp, useReducedMotion } from 'react-native-reanimated';
import Svg, { Circle, Ellipse } from 'react-native-svg';
import { GamesSection } from '@/features/social/GamesSection';
import { NearbyPlacesSection } from '@/features/social/NearbyPlacesSection';
import { getLastSeenPhotoId } from '@/features/social/storySeen';

export default function SocialScreen() {
  const PAGE_SIZE = 24;
  const router = useRouter();
  const { dog } = useDogProfile();
  const reducedMotion = useReducedMotion();
  const [lastSeenId, setLastSeenId] = useState<string | null>(null);

  const momentsQuery = useInfiniteQuery({
    queryKey: ['social-stories', dog.id, PAGE_SIZE],
    queryFn: ({ pageParam }) => fetchStories(dog.id, PAGE_SIZE, pageParam),
    initialPageParam: 0,
    getNextPageParam: (lastPage, pages) =>
      lastPage.length === PAGE_SIZE ? pages.length * PAGE_SIZE : undefined,
    enabled: Boolean(dog.id),
    retry: 1,
    refetchInterval: 60_000,
  });

  const photos = useMemo(
    () => (momentsQuery.data?.pages ?? []).flat(),
    [momentsQuery.data],
  );

  useEffect(() => {
    if (!dog.id) return;
    let alive = true;
    void getLastSeenPhotoId(dog.id).then((id) => {
      if (alive) setLastSeenId(id);
    });
    return () => {
      alive = false;
    };
  }, [dog.id, photos.length]);

  const hasUnseen = useMemo(() => {
    if (photos.length === 0) return false;
    const newest = photos[0]?.id;
    if (!newest) return false;
    if (!lastSeenId) return true;
    return newest !== lastSeenId;
  }, [lastSeenId, photos]);

  const openStory = useCallback(
    (startIndex: number) => {
      if (!dog.id) return;
      router.push({
        pathname: '/story/viewer',
        params: {
          dogId: dog.id,
          startIndex: String(startIndex),
        },
      } as never);
    },
    [dog.id, router],
  );

  const onUploaded = useCallback(() => {
    void momentsQuery.refetch();
  }, [momentsQuery]);

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <Svg
        pointerEvents="none"
        style={StyleSheet.absoluteFill}
        viewBox="0 0 400 300"
        preserveAspectRatio="xMidYMin slice"
        accessible={false}
      >
        <Circle cx={350} cy={-20} r={110} fill={colors.accentSoft} opacity={0.35} />
        <Ellipse cx={40} cy={30} rx={90} ry={60} fill={colors.primarySoft} opacity={0.3} />
      </Svg>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <Text style={styles.eyebrow}>SOCIAL</Text>
          <Text style={styles.title}>Il mondo di {dog.name}</Text>
        </View>

        <Animated.View entering={reducedMotion ? undefined : FadeInUp.duration(320)}>
          <StoryHeader
            stories={[
              {
                id: 'mine',
                dogId: dog.id,
                dogName: dog.name,
                dogPhotoUri: dog.photoUri,
                unseen: hasUnseen && photos.length > 0,
              },
            ]}
            onOpenStory={openStory}
            onUploaded={onUploaded}
          />
        </Animated.View>

        <Animated.View entering={reducedMotion ? undefined : FadeInUp.duration(320).delay(90)}>
          <GamesSection />
        </Animated.View>

        <Animated.View entering={reducedMotion ? undefined : FadeInUp.duration(320).delay(180)}>
          <NearbyPlacesSection />
        </Animated.View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  content: {
    paddingBottom: spacing.xxxl,
    gap: spacing.lg,
  },
  header: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    gap: 4,
  },
  eyebrow: {
    color: colors.accent,
    fontSize: 11,
    fontWeight: typography.weight.bold,
    letterSpacing: 1.2,
  },
  title: {
    color: colors.text,
    fontSize: typography.size.xl,
    fontWeight: typography.weight.bold,
  },
  divider: {
    height: 1,
    backgroundColor: colors.border,
    marginHorizontal: spacing.lg,
  },
});
