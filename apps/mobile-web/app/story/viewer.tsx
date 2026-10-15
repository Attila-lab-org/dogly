/**
 * Story viewer Instagram-style: progress, tap L/R, hold pause, auto-advance.
 * Route: /story/viewer (fuori da /social per evitare conflitto con tab Social).
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  Alert,
  Image,
  Pressable,
  StatusBar,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { DogAvatar } from '@/features/core/components';
import { useDogProfile } from '@/features/core/useDogProfile';
import {
  fetchStories,
  getOrCreateMomentsAlbum,
  uploadAlbumPhoto,
} from '@/features/photos/api';
import { setLastSeenPhotoId } from '@/features/social/storySeen';
import { typography } from '@/theme/tokens';

const STORY_MS = 5000;

export default function StoryViewerScreen() {
  const PAGE_SIZE = 24;
  const router = useRouter();
  const queryClient = useQueryClient();
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const pagingRef = useRef(false);
  const [savedIds, setSavedIds] = useState<string[]>([]);
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { dog } = useDogProfile();
  const params = useLocalSearchParams<{
    dogId?: string;
    startIndex?: string;
  }>();
  const dogId = typeof params.dogId === 'string' ? params.dogId : dog.id;
  const startIndex = Math.max(
    0,
    Number.parseInt(
      typeof params.startIndex === 'string' ? params.startIndex : '0',
      10,
    ) || 0,
  );

  const momentsQuery = useInfiniteQuery({
    queryKey: ['social-stories', dogId, PAGE_SIZE],
    queryFn: ({ pageParam }) => fetchStories(dogId, PAGE_SIZE, pageParam),
    initialPageParam: 0,
    getNextPageParam: (lastPage, pages) =>
      lastPage.length === PAGE_SIZE ? pages.length * PAGE_SIZE : undefined,
    enabled: Boolean(dogId),
    retry: 1,
    refetchInterval: 60_000,
  });

  const photos = useMemo(
    () => (momentsQuery.data?.pages ?? []).flat(),
    [momentsQuery.data],
  );
  const [index, setIndex] = useState(startIndex);
  const [paused, setPaused] = useState(false);
  const [progressPct, setProgressPct] = useState(0);
  const [reduceMotion, setReduceMotion] = useState(false);
  const elapsedRef = useRef(0);
  const indexRef = useRef(index);
  const holdStartedAt = useRef<number | null>(null);
  indexRef.current = index;

  useEffect(() => {
    let alive = true;
    void AccessibilityInfo.isReduceMotionEnabled().then((enabled) => {
      if (alive) setReduceMotion(Boolean(enabled));
    });
    const sub = AccessibilityInfo.addEventListener?.(
      'reduceMotionChanged',
      (enabled: boolean) => setReduceMotion(Boolean(enabled)),
    );
    return () => {
      alive = false;
      sub?.remove?.();
    };
  }, []);

  useEffect(() => {
    if (photos.length === 0) return;
    setIndex((current) => Math.min(Math.max(current, 0), photos.length - 1));
  }, [photos.length]);

  const close = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace('/social' as never);
  }, [router]);

  const goNext = useCallback(() => {
    if (pagingRef.current || savingRef.current) return;
    const current = indexRef.current;
    elapsedRef.current = 0;
    setProgressPct(0);
    if (current >= photos.length - 1) {
      if (momentsQuery.hasNextPage) {
        pagingRef.current = true;
        setPaused(true);
        void momentsQuery.fetchNextPage().then((result) => {
          if (result.isError) {
            Alert.alert('Storia non caricata', 'Tocca per riprovare.');
            return;
          }
          const count = result.data?.pages.reduce((sum, page) => sum + page.length, 0) ?? 0;
          if (count > current + 1) setIndex(current + 1);
          else close();
        }).finally(() => { pagingRef.current = false; setPaused(false); });
      } else close();
      return;
    }
    setIndex(current + 1);
  }, [close, photos.length, momentsQuery.hasNextPage, momentsQuery.fetchNextPage]);

  const goPrev = useCallback(() => {
    const current = indexRef.current;
    elapsedRef.current = 0;
    setProgressPct(0);
    if (current <= 0) return;
    setIndex(current - 1);
  }, []);

  useEffect(() => {
    const photo = photos[index];
    if (!photo || !dogId) return;
    void setLastSeenPhotoId(dogId, photo.id);
  }, [dogId, index, photos]);

  useEffect(() => {
    elapsedRef.current = 0;
    setProgressPct(0);
  }, [index]);

  useEffect(() => {
    if (photos.length === 0 || paused) return;
    const tickMs = reduceMotion ? 250 : 50;
    const startedAt = Date.now() - elapsedRef.current;
    const timer = setInterval(() => {
      const elapsed = Date.now() - startedAt;
      elapsedRef.current = elapsed;
      const pct = Math.min(1, elapsed / STORY_MS);
      setProgressPct(pct);
      if (pct >= 1) {
        clearInterval(timer);
        goNext();
      }
    }, tickMs);
    return () => clearInterval(timer);
  }, [goNext, index, paused, photos.length, reduceMotion]);

  const saveMoment = async () => {
    const selected = photos[indexRef.current];
    if (!selected || savingRef.current || savedIds.includes(selected.id)) return;
    savingRef.current = true;
    setSaving(true);
    setPaused(true);
    try {
      const album = await getOrCreateMomentsAlbum(dogId);
      await uploadAlbumPhoto(album.id, selected.localUri || selected.thumbnailUri, {
        caption: selected.caption,
        visibility: 'PRIVATE',
        idempotencyKey: `keep-story-${selected.id}`,
      });
      setSavedIds((ids) => [...ids, selected.id]);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['gallery-dog-photos', dogId] }),
        queryClient.invalidateQueries({ queryKey: ['gallery-photos', album.id] }),
        queryClient.invalidateQueries({ queryKey: ['gallery-albums', dogId] }),
      ]);
    } catch {
      Alert.alert('Momento non salvato', 'La storia è ancora disponibile. Riprova.');
    } finally {
      savingRef.current = false;
      setSaving(false);
      setPaused(false);
    }
  };

  const onHoldIn = () => {
    holdStartedAt.current = Date.now();
    setPaused(true);
  };

  const onHoldOut = (x: number) => {
    const started = holdStartedAt.current;
    holdStartedAt.current = null;
    setPaused(false);
    if (started != null && Date.now() - started < 220) {
      if (x < width * 0.35) goPrev();
      else goNext();
    }
  };

  if (momentsQuery.isLoading) {
    return (
      <View style={[styles.root, styles.centered]}>
        <StatusBar barStyle="light-content" />
        <Text style={styles.loadingText}>Carico le storieâ€¦</Text>
      </View>
    );
  }

  if (photos.length === 0) {
    return (
      <View style={[styles.root, styles.centered]}>
        <StatusBar barStyle="light-content" />
        <Text style={styles.loadingText}>Nessuna storia ancora.</Text>
        <Pressable accessibilityRole="button" onPress={close} style={styles.closeFab}>
          <Ionicons name="close" size={22} color="#FFFFFF" />
        </Pressable>
      </View>
    );
  }

  const photo = photos[Math.min(index, photos.length - 1)];
  const uri = photo.localUri || photo.thumbnailUri;

  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" />
      <Image source={{ uri }} style={StyleSheet.absoluteFill} resizeMode="cover" />
      <View style={[styles.scrimTop, { height: insets.top + 72 }]} pointerEvents="none" />
      <View style={[styles.scrimBottom, { height: insets.bottom + 40 }]} pointerEvents="none" />

      <Pressable
        style={[StyleSheet.absoluteFill, styles.gestureLayer]}
        onPressIn={onHoldIn}
        onPressOut={(e) => onHoldOut(e.nativeEvent.locationX)}
      />

      <Pressable
        accessibilityRole="button"
        disabled={saving || savedIds.includes(photo.id)}
        onPress={() => void saveMoment()}
        style={{ position: 'absolute', bottom: insets.bottom + 24, alignSelf: 'center', zIndex: 3, backgroundColor: 'rgba(0,0,0,0.7)', padding: 14, borderRadius: 24 }}
      >
        <Text style={styles.loadingText}>{saving ? 'Salvataggio…' : savedIds.includes(photo.id) ? 'Conservata nei Momenti' : 'Conserva nei Momenti'}</Text>
      </Pressable>
      <View style={[styles.chrome, { paddingTop: insets.top + 8 }]} pointerEvents="box-none">
        <View style={styles.progressRow} pointerEvents="none">
          {photos.map((item, i) => {
            const widthPct =
              i < index ? 100 : i > index ? 0 : Math.round(progressPct * 100);
            return (
              <View key={item.id} style={styles.progressTrack}>
                <View style={[styles.progressFill, { width: `${widthPct}%` }]} />
              </View>
            );
          })}
        </View>

        <View style={styles.header} pointerEvents="box-none">
          <View style={styles.headerLeft} pointerEvents="none">
            <DogAvatar
              photoUri={dog.photoUri}
              dogName={dog.name}
              size={32}
            />
            <Text style={styles.headerName} numberOfLines={1}>
              {dog.name}
            </Text>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Chiudi storia"
            onPress={close}
            hitSlop={12}
            style={styles.closeBtn}
          >
            <Ionicons name="close" size={24} color="#FFFFFF" />
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#000000',
  },
  centered: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    color: '#FFFFFF',
    fontSize: typography.size.md,
  },
  scrimTop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  scrimBottom: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(0,0,0,0.25)',
  },
  gestureLayer: {
    zIndex: 1,
  },
  chrome: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 2,
    paddingHorizontal: 12,
    gap: 10,
  },
  progressRow: {
    flexDirection: 'row',
    gap: 4,
  },
  progressTrack: {
    flex: 1,
    height: 2.5,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.35)',
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#FFFFFF',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
    minWidth: 0,
  },
  headerName: {
    color: '#FFFFFF',
    fontSize: typography.size.md,
    fontWeight: typography.weight.bold,
    flexShrink: 1,
  },
  closeBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeFab: {
    marginTop: 20,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
