/**
 * Dettaglio momento — stessa lingua delle altre sottopagine (chiaro, non fullscreen).
 * Cestino in header a destra; caption; condivisione secondaria.
 */
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { EmptyState, ErrorState, ScreenContainer } from '@/components';
import { colors, radius, shadows, spacing, typography } from '@/theme/tokens';
import { StackScreenHeader } from '@/features/secondary/components';
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

export default function PhotoDetailScreen() {
  const { photoId, albumId, dogId: paramDogId } = useLocalSearchParams<{
    photoId: string;
    albumId: string;
    dogId: string;
  }>();
  const router = useRouter();
  const { width } = useWindowDimensions();
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

  const photo: AlbumPhoto | undefined =
    (albumQuery.data ?? []).find((item) => item.id === photoId) ??
    (dogPhotosQuery.data ?? []).find((item) => item.id === photoId);

  const [caption, setCaption] = useState('');
  const [savingCaption, setSavingCaption] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    if (photo) {
      setCaption(photo.caption ?? '');
      setActionError(null);
    }
  }, [photo?.id, photo?.caption]);

  const goBack = () => {
    if (router.canGoBack()) router.back();
    else router.replace(`/dogs/${dogId}/album` as never);
  };

  const persistCaption = async () => {
    if (!photo) return;
    const next = caption.trim();
    const prev = (photo.caption ?? '').trim();
    if (next === prev) return;
    setSavingCaption(true);
    setActionError(null);
    try {
      const updated = await updateAlbumPhotoCaption(photo.id, caption);
      const patch = (list: AlbumPhoto[] | undefined) =>
        (list ?? []).map((item) => (item.id === updated.id ? updated : item));
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
    } catch {
      setActionError('Non ho salvato la frase. Riprova.');
    } finally {
      setSavingCaption(false);
    }
  };

  const removePhoto = () => {
    if (!photo) return;
    confirmDestructiveAction(
      'Eliminare questo momento?',
      `Verrà rimosso dai Momenti di ${dog.name}.`,
      () => {
        setDeleting(true);
        setActionError(null);
        void deleteAlbumPhoto(photo.id)
          .then(async () => {
            await Promise.all([
              queryClient.invalidateQueries({
                queryKey: ['gallery-photos', albumId],
              }),
              queryClient.invalidateQueries({
                queryKey: ['gallery-dog-photos', dogId],
              }),
              queryClient.invalidateQueries({
                queryKey: ['gallery-albums', dogId],
              }),
              queryClient.invalidateQueries({
                queryKey: ['social-moments', dogId],
              }),
            ]);
            goBack();
          })
          .catch(() => {
            setDeleting(false);
            setActionError('Non ho eliminato il momento. Riprova.');
          });
      },
    );
  };

  const loading =
    albumQuery.isLoading ||
    (!photo && dogPhotosQuery.isLoading);

  if (loading) {
    return (
      <ScreenContainer>
        <StackScreenHeader title={`Un momento di ${dog.name}`} />
        <ActivityIndicator color={colors.primary} />
      </ScreenContainer>
    );
  }

  if (!photo) {
    return (
      <ScreenContainer>
        <StackScreenHeader title={`Un momento di ${dog.name}`} />
        {albumQuery.isError && dogPhotosQuery.isError ? (
          <ErrorState
            title="Momento non caricato"
            message="Controlla la connessione e riprova."
            retryLabel="Riprova"
            onRetry={() => {
              void albumQuery.refetch();
              void dogPhotosQuery.refetch();
            }}
          />
        ) : (
          <EmptyState
            title="Momento non trovato"
            message="Torna ai Momenti e aprine un altro."
          />
        )}
      </ScreenContainer>
    );
  }

  const photoWidth = width - spacing.lg * 2;
  const photoHeight = Math.min(photoWidth * 1.15, width * 0.92);

  return (
    <ScreenContainer scroll contentStyle={styles.content}>
      <StackScreenHeader
        title={`Un momento di ${dog.name}`}
        right={
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Elimina momento"
            disabled={deleting}
            onPress={removePhoto}
            hitSlop={8}
            style={styles.headerTrash}
          >
            {deleting ? (
              <ActivityIndicator size="small" color={colors.danger} />
            ) : (
              <Ionicons name="trash-outline" size={22} color={colors.danger} />
            )}
          </Pressable>
        }
      />

      <View style={[styles.photoCard, { width: photoWidth }]}>
        <Image
          source={{ uri: photo.localUri }}
          style={{ width: photoWidth, height: photoHeight }}
          resizeMode="cover"
        />
        <View style={styles.privacy}>
          <Ionicons name="lock-closed" size={12} color={colors.textSecondary} />
          <Text style={styles.privacyText}>Solo tua</Text>
        </View>
      </View>

      <Text style={styles.label}>Una frase per questo momento</Text>
      <View style={styles.captionBox}>
        <TextInput
          value={caption}
          onChangeText={setCaption}
          onBlur={() => void persistCaption()}
          placeholder="Aggiungi un ricordo…"
          placeholderTextColor={colors.textMuted}
          maxLength={280}
          multiline
          style={styles.captionInput}
        />
        {savingCaption ? (
          <ActivityIndicator
            size="small"
            color={colors.primary}
            style={styles.captionSpinner}
          />
        ) : null}
      </View>

      {actionError ? <Text style={styles.error}>{actionError}</Text> : null}

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Condividi"
        onPress={() =>
          void sharePhoto(
            { ...photo, caption: caption.trim() || undefined },
            dog.name,
          )
        }
        style={styles.shareRow}
      >
        <Ionicons name="share-outline" size={20} color={colors.primary} />
        <Text style={styles.shareText}>Condividi</Text>
      </Pressable>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingBottom: spacing.xxxl,
    gap: spacing.md,
  },
  headerTrash: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoCard: {
    alignSelf: 'center',
    borderRadius: radius.lg,
    overflow: 'hidden',
    backgroundColor: colors.surfaceMuted,
    ...shadows.card,
  },
  privacy: {
    position: 'absolute',
    left: spacing.md,
    bottom: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radius.full,
    backgroundColor: 'rgba(255,255,255,0.92)',
  },
  privacyText: {
    color: colors.textSecondary,
    fontSize: typography.size.xs,
    fontWeight: typography.weight.semibold,
  },
  label: {
    marginTop: spacing.sm,
    color: colors.text,
    fontSize: typography.size.md,
    fontWeight: typography.weight.semibold,
  },
  captionBox: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    minHeight: 52,
    justifyContent: 'center',
  },
  captionInput: {
    color: colors.text,
    fontSize: typography.size.md,
    lineHeight: typography.size.md * typography.lineHeight.normal,
    minHeight: 40,
    maxHeight: 120,
    padding: 0,
  },
  captionSpinner: {
    position: 'absolute',
    right: spacing.md,
    top: spacing.md,
  },
  error: {
    color: colors.danger,
    fontSize: typography.size.sm,
  },
  shareRow: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minHeight: 44,
    paddingVertical: spacing.sm,
  },
  shareText: {
    color: colors.primary,
    fontSize: typography.size.md,
    fontWeight: typography.weight.semibold,
  },
});
