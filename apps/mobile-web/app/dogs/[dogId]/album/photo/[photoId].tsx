/**
 * Viewer Momenti — lightbox immersivo stile Instagram.
 * Foto full-bleed, caption inline, azioni leggere (share / more).
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Dimensions,
  FlatList,
  Image,
  Modal,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Pressable,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { DogAvatar } from '@/features/core/components';
import { useDogProfile } from '@/features/core/useDogProfile';
import { sharePhoto } from '@/features/photos/share';
import {
  deleteAlbumPhoto,
  fetchAlbumPhotos,
  fetchDogPhotos,
  updateAlbumPhotoCaption,
} from '@/features/photos/api';
import type { AlbumPhoto } from '@/features/photos/types';
import { confirmDestructiveAction } from '@/lib/confirmAction';
import { typography } from '@/theme/tokens';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');

export default function PhotoViewerScreen() {
  const { photoId, albumId, dogId: paramDogId } = useLocalSearchParams<{
    photoId: string;
    albumId: string;
    dogId: string;
  }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { dog } = useDogProfile();
  const queryClient = useQueryClient();
  const dogId = paramDogId || dog.id;

  const albumQuery = useQuery({
    queryKey: ['gallery-photos', albumId],
    queryFn: () => fetchAlbumPhotos(albumId!),
    enabled: Boolean(albumId),
  });
  const dogPhotosQuery = useQuery({
    queryKey: ['gallery-dog-photos', dogId, 80],
    queryFn: () => fetchDogPhotos(dogId, 80),
    enabled: Boolean(dogId) && (albumQuery.isError || !albumId),
  });

  const photos = useMemo(() => {
    const fromAlbum = albumQuery.data ?? [];
    if (fromAlbum.length > 0) return fromAlbum;
    return dogPhotosQuery.data ?? [];
  }, [albumQuery.data, dogPhotosQuery.data]);

  const startIndex = useMemo(() => {
    const idx = photos.findIndex((p) => p.id === photoId);
    return idx >= 0 ? idx : 0;
  }, [photos, photoId]);

  const [index, setIndex] = useState(startIndex);
  const [caption, setCaption] = useState('');
  const [savingCaption, setSavingCaption] = useState(false);
  const [editingCaption, setEditingCaption] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const listRef = useRef<FlatList<AlbumPhoto>>(null);
  const captionRef = useRef<TextInput>(null);

  const current = photos[index] ?? photos.find((p) => p.id === photoId);

  useEffect(() => {
    if (photos.length === 0) return;
    const next = Math.min(Math.max(startIndex, 0), photos.length - 1);
    setIndex(next);
    requestAnimationFrame(() => {
      listRef.current?.scrollToIndex({ index: next, animated: false });
    });
  }, [photos.length, startIndex]);

  useEffect(() => {
    if (current) {
      setCaption(current.caption ?? '');
      setEditingCaption(false);
      setActionError(null);
    }
  }, [current?.id]);

  const close = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace(`/dogs/${dogId}/album` as never);
  }, [dogId, router]);

  const onScrollEnd = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const next = Math.round(event.nativeEvent.contentOffset.x / SCREEN_W);
    if (next !== index && next >= 0 && next < photos.length) {
      setIndex(next);
    }
  };

  const persistCaption = async () => {
    if (!current) return;
    const next = caption.trim();
    const prev = (current.caption ?? '').trim();
    if (next === prev) {
      setEditingCaption(false);
      return;
    }
    setSavingCaption(true);
    setActionError(null);
    try {
      const updated = await updateAlbumPhotoCaption(current.id, caption);
      const patch = (list: AlbumPhoto[] | undefined) =>
        (list ?? []).map((photo) => (photo.id === updated.id ? updated : photo));
      queryClient.setQueryData<AlbumPhoto[]>(['gallery-photos', albumId], patch);
      queryClient.setQueryData<{ pages: AlbumPhoto[][]; pageParams: number[] }>(
        ['gallery-dog-photos', dogId, 24],
        (currentData) => {
          if (!currentData) return currentData;
          return {
            ...currentData,
            pages: currentData.pages.map((page) => patch(page)),
          };
        },
      );
      void queryClient.invalidateQueries({
        queryKey: ['gallery-dog-photos', dogId],
        refetchType: 'none',
      });
      setEditingCaption(false);
    } catch {
      setActionError('Non ho salvato la frase. Riprova.');
    } finally {
      setSavingCaption(false);
    }
  };

  const removePhoto = () => {
    if (!current) return;
    setMenuOpen(false);
    setDeleting(true);
    setActionError(null);
    void deleteAlbumPhoto(current.id)
      .then(() => {
        const drop = (list: AlbumPhoto[] | undefined) =>
          (list ?? []).filter((photo) => photo.id !== current.id);
        queryClient.setQueryData<AlbumPhoto[]>(['gallery-photos', albumId], drop);
        void queryClient.invalidateQueries({
          queryKey: ['gallery-dog-photos', dogId],
        });
        void queryClient.invalidateQueries({
          queryKey: ['gallery-albums', dogId],
        });
        void queryClient.invalidateQueries({
          queryKey: ['social-moments', dogId],
        });
        if (photos.length <= 1) {
          close();
          return;
        }
        const nextIndex = Math.min(index, photos.length - 2);
        setIndex(nextIndex);
        listRef.current?.scrollToIndex({ index: nextIndex, animated: true });
        setDeleting(false);
      })
      .catch(() => {
        setDeleting(false);
        setActionError('Non ho eliminato il momento. Riprova.');
      });
  };

  const loading = albumQuery.isLoading || (photos.length === 0 && dogPhotosQuery.isLoading);

  if (loading) {
    return (
      <View style={[styles.root, styles.center]}>
        <StatusBar barStyle="light-content" />
        <ActivityIndicator color="#FFFFFF" />
      </View>
    );
  }

  if (!current || photos.length === 0) {
    return (
      <View style={[styles.root, styles.center, { paddingTop: insets.top }]}>
        <StatusBar barStyle="light-content" />
        <Text style={styles.emptyTitle}>Momento non trovato</Text>
        <Pressable onPress={close} style={styles.emptyBtn}>
          <Text style={styles.emptyBtnText}>Torna indietro</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" />

      <View style={[styles.topBar, { paddingTop: insets.top + 6 }]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Chiudi"
          onPress={close}
          hitSlop={12}
          style={styles.topBtn}
        >
          <Ionicons name="close" size={28} color="#FFFFFF" />
        </Pressable>
        <View style={styles.identity}>
          <DogAvatar photoUri={dog.photoUri} dogName={dog.name} size={32} />
          <View style={styles.identityCopy}>
            <Text style={styles.dogName} numberOfLines={1}>
              {dog.name}
            </Text>
            <Text style={styles.meta} numberOfLines={1}>
              {index + 1} / {photos.length}
            </Text>
          </View>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Altre azioni"
          onPress={() => setMenuOpen(true)}
          hitSlop={12}
          style={styles.topBtn}
        >
          <Ionicons name="ellipsis-horizontal" size={22} color="#FFFFFF" />
        </Pressable>
      </View>

      <View style={styles.stage}>
        <FlatList
          ref={listRef}
          data={photos}
          keyExtractor={(item) => item.id}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          initialScrollIndex={startIndex}
          getItemLayout={(_, i) => ({
            length: SCREEN_W,
            offset: SCREEN_W * i,
            index: i,
          })}
          onMomentumScrollEnd={onScrollEnd}
          onScrollToIndexFailed={({ index: failed }) => {
            setTimeout(() => {
              listRef.current?.scrollToIndex({ index: failed, animated: false });
            }, 50);
          }}
          renderItem={({ item }) => (
            <View style={styles.slide}>
              <Image
                source={{ uri: item.localUri }}
                style={styles.photo}
                resizeMode="contain"
              />
            </View>
          )}
        />
      </View>

      <View style={[styles.bottom, { paddingBottom: Math.max(insets.bottom, 16) }]}>
        {actionError ? <Text style={styles.error}>{actionError}</Text> : null}

        <View style={styles.actionRow}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Condividi"
            onPress={() =>
              void sharePhoto(
                { ...current, caption: caption.trim() || undefined },
                dog.name,
              )
            }
            style={styles.actionHit}
          >
            <Ionicons name="paper-plane-outline" size={26} color="#FFFFFF" />
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={editingCaption ? 'Chiudi modifica' : 'Modifica ricordo'}
            onPress={() => {
              setEditingCaption(true);
              requestAnimationFrame(() => captionRef.current?.focus());
            }}
            style={styles.actionHit}
          >
            <Ionicons name="chatbubble-outline" size={24} color="#FFFFFF" />
          </Pressable>
          <View style={styles.actionSpacer} />
          <View style={styles.lockPill}>
            <Ionicons name="lock-closed" size={12} color="rgba(255,255,255,0.85)" />
            <Text style={styles.lockText}>Solo tua</Text>
          </View>
        </View>

        <View style={styles.captionBlock}>
          {editingCaption ? (
            <View style={styles.captionEdit}>
              <TextInput
                ref={captionRef}
                value={caption}
                onChangeText={setCaption}
                placeholder="Scrivi un ricordo…"
                placeholderTextColor="rgba(255,255,255,0.45)"
                maxLength={280}
                multiline
                style={styles.captionInput}
                onBlur={() => void persistCaption()}
              />
              <Pressable
                accessibilityRole="button"
                disabled={savingCaption}
                onPress={() => void persistCaption()}
                style={styles.captionDone}
              >
                {savingCaption ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text style={styles.captionDoneText}>Fatto</Text>
                )}
              </Pressable>
            </View>
          ) : (
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                setEditingCaption(true);
                requestAnimationFrame(() => captionRef.current?.focus());
              }}
            >
              <Text style={styles.captionRead} numberOfLines={3}>
                <Text style={styles.captionAuthor}>{dog.name} </Text>
                {caption.trim() || 'Aggiungi un ricordo…'}
              </Text>
            </Pressable>
          )}
        </View>
      </View>

      <Modal visible={menuOpen} transparent animationType="fade">
        <Pressable style={styles.menuBackdrop} onPress={() => setMenuOpen(false)}>
          <View style={[styles.menuSheet, { paddingBottom: Math.max(insets.bottom, 16) }]}>
            <Pressable
              accessibilityRole="button"
              disabled={deleting}
              onPress={() =>
                confirmDestructiveAction(
                  'Eliminare questo momento?',
                  `Verrà rimosso dai Momenti di ${dog.name}.`,
                  removePhoto,
                )
              }
              style={styles.menuItem}
            >
              <Ionicons name="trash-outline" size={20} color="#FF6B6B" />
              <Text style={styles.menuDanger}>
                {deleting ? 'Elimino…' : 'Elimina'}
              </Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              onPress={() => setMenuOpen(false)}
              style={[styles.menuItem, styles.menuCancel]}
            >
              <Text style={styles.menuCancelText}>Annulla</Text>
            </Pressable>
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#000000',
  },
  center: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
  },
  emptyTitle: {
    color: '#FFFFFF',
    fontSize: typography.size.lg,
    fontWeight: typography.weight.bold,
  },
  emptyBtn: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.14)',
  },
  emptyBtnText: {
    color: '#FFFFFF',
    fontWeight: typography.weight.bold,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingBottom: 8,
    zIndex: 2,
  },
  topBtn: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  identity: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minWidth: 0,
  },
  identityCopy: { flex: 1, minWidth: 0, gap: 1 },
  dogName: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: typography.weight.bold,
  },
  meta: {
    color: 'rgba(255,255,255,0.55)',
    fontSize: 12,
  },
  stage: {
    flex: 1,
    justifyContent: 'center',
  },
  slide: {
    width: SCREEN_W,
    height: Math.min(SCREEN_H * 0.62, SCREEN_W * 1.25),
    justifyContent: 'center',
    alignItems: 'center',
  },
  photo: {
    width: SCREEN_W,
    height: '100%',
  },
  bottom: {
    paddingHorizontal: 16,
    paddingTop: 10,
    gap: 12,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  actionHit: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionSpacer: { flex: 1 },
  lockPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  lockText: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 12,
    fontWeight: typography.weight.semibold,
  },
  captionBlock: {
    minHeight: 44,
    paddingBottom: 4,
  },
  captionRead: {
    color: 'rgba(255,255,255,0.88)',
    fontSize: 15,
    lineHeight: 21,
  },
  captionAuthor: {
    color: '#FFFFFF',
    fontWeight: typography.weight.bold,
  },
  captionEdit: {
    gap: 8,
  },
  captionInput: {
    color: '#FFFFFF',
    fontSize: 15,
    lineHeight: 21,
    minHeight: 48,
    maxHeight: 100,
    padding: 0,
  },
  captionDone: {
    alignSelf: 'flex-end',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.18)',
  },
  captionDoneText: {
    color: '#FFFFFF',
    fontWeight: typography.weight.bold,
    fontSize: 13,
  },
  error: {
    color: '#FF8B8B',
    fontSize: 13,
  },
  menuBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'flex-end',
  },
  menuSheet: {
    margin: 12,
    borderRadius: 18,
    overflow: 'hidden',
    backgroundColor: '#1C1C1E',
  },
  menuItem: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingHorizontal: 16,
  },
  menuDanger: {
    color: '#FF6B6B',
    fontSize: 16,
    fontWeight: typography.weight.semibold,
  },
  menuCancel: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255,255,255,0.12)',
    backgroundColor: '#2C2C2E',
  },
  menuCancelText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: typography.weight.bold,
  },
});
