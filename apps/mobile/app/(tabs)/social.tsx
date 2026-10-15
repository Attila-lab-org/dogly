/**
 * Tab Social: storie Instagram (Momenti) + luoghi utili sotto.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { colors, spacing, typography } from '@/theme/tokens';
import { useDogProfile } from '@/features/core/useDogProfile';
import {
  fetchAlbumPhotos,
  fetchDogPhotos,
  getOrCreateMomentsAlbum,
} from '@/features/photos/api';
import { StoryRail } from '@/features/social/StoryRail';
import { GamesSection } from '@/features/social/GamesSection';
import { NearbyPlacesSection } from '@/features/social/NearbyPlacesSection';
import { getLastSeenPhotoId } from '@/features/social/storySeen';

export default function SocialScreen() {
  const router = useRouter();
  const { dog } = useDogProfile();
  const [lastSeenId, setLastSeenId] = useState<string | null>(null);

  const momentsQuery = useQuery({
    queryKey: ['social-moments', dog.id],
    queryFn: async () => {
      try {
        const album = await getOrCreateMomentsAlbum(dog.id);
        const items = await fetchAlbumPhotos(album.id);
        if (items.length > 0) return items;
      } catch {
        /* fallback sotto */
      }
      // Se Momenti è vuoto/non raggiungibile, usa le foto cane già in album.
      return fetchDogPhotos(dog.id, 40);
    },
    enabled: Boolean(dog.id),
    retry: 1,
  });

  const photos = useMemo(() => momentsQuery.data ?? [], [momentsQuery.data]);

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
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <Text style={styles.eyebrow}>SOCIAL</Text>
          <Text style={styles.title}>Il mondo di {dog.name}</Text>
        </View>

        <StoryRail
          dogId={dog.id}
          dogName={dog.name}
          dogPhotoUri={dog.photoUri}
          photos={photos}
          hasUnseen={hasUnseen}
          onOpenStory={openStory}
          onUploaded={onUploaded}
        />

        <GamesSection />

        <View style={styles.divider} />

        <NearbyPlacesSection />
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
