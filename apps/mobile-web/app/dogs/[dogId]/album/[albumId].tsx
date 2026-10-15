/**
 * Dettaglio album — stessa griglia: tap apre, long-press → cestino in alto a dx.
 */
import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { EmptyState, ErrorState, ScreenContainer } from '@/components';
import { colors, spacing, typography } from '@/theme/tokens';
import { StackScreenHeader } from '@/features/secondary/components';
import { PhotoGrid } from '@/features/photos/components';
import { pickAlbumPhoto } from '@/features/photos/share';
import {
  deleteAlbumPhoto,
  fetchAlbum,
  fetchAlbumPhotos,
  uploadAlbumPhoto,
} from '@/features/photos/api';
import { useDogProfile } from '@/features/core/useDogProfile';
import { confirmDestructiveAction } from '@/lib/confirmAction';
import type { AlbumPhoto } from '@/features/photos/types';

export default function AlbumDetailScreen() {
  const { dogId, albumId } = useLocalSearchParams<{
    dogId: string;
    albumId: string;
  }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { dog } = useDogProfile();
  const [uploading, setUploading] = useState(false);
  const [armedPhotoId, setArmedPhotoId] = useState<string | null>(null);
  const albumQuery = useQuery({
    queryKey: ['gallery-album', albumId],
    queryFn: () => fetchAlbum(albumId!),
    enabled: Boolean(albumId),
  });
  const photosQuery = useQuery({
    queryKey: ['gallery-photos', albumId],
    queryFn: () => fetchAlbumPhotos(albumId!),
    enabled: Boolean(albumId),
  });
  const album = albumQuery.data;
  const photos = photosQuery.data ?? [];

  const addPhoto = async () => {
    if (!albumId) return;
    const uri = await pickAlbumPhoto();
    if (!uri) return;
    setUploading(true);
    try {
      await uploadAlbumPhoto(albumId, uri);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['gallery-photos', albumId] }),
        queryClient.invalidateQueries({ queryKey: ['gallery-albums', dogId] }),
        queryClient.invalidateQueries({ queryKey: ['gallery-dog-photos', dogId] }),
      ]);
    } catch {
      Alert.alert('Foto non salvata', 'Il caricamento non è riuscito. Riprova.');
    } finally {
      setUploading(false);
    }
  };

  const deletePhoto = (photo: AlbumPhoto) => {
    confirmDestructiveAction(
      'Eliminare questo momento?',
      `Verrà rimosso dai Momenti di ${dog.name}.`,
      () => {
        void deleteAlbumPhoto(photo.id)
          .then(async () => {
            setArmedPhotoId(null);
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
          })
          .catch(() => {
            Alert.alert('Foto non eliminata', 'Riprova tra poco.');
          });
      },
    );
  };

  if (albumQuery.isLoading) {
    return (
      <ScreenContainer>
        <StackScreenHeader title="Album" />
        <ActivityIndicator color={colors.primary} />
      </ScreenContainer>
    );
  }

  if (!album || !albumId) {
    return (
      <ScreenContainer>
        <StackScreenHeader title="Album" />
        <EmptyState title="Album non trovato" message="Torna al profilo." />
      </ScreenContainer>
    );
  }

  if (photosQuery.isError) {
    return (
      <ScreenContainer>
        <StackScreenHeader title={album.title} />
        <ErrorState
          title="Momenti non caricati"
          message="Non riesco a mostrare le foto. Controlla la connessione e riprova."
          retryLabel="Riprova"
          onRetry={() => void photosQuery.refetch()}
        />
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer padded={false}>
      <PhotoGrid
        photos={photos}
        armedPhotoId={armedPhotoId}
        header={
          <View style={styles.headerPad}>
            <StackScreenHeader
              title={album.title}
              right={
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Aggiungi foto"
                  disabled={uploading}
                  onPress={() => void addPhoto()}
                  hitSlop={8}
                  style={styles.iconBtn}
                >
                  {uploading ? (
                    <ActivityIndicator size="small" color={colors.primary} />
                  ) : (
                    <Ionicons name="add" size={28} color={colors.text} />
                  )}
                </Pressable>
              }
            />
            {armedPhotoId ? (
              <Text style={styles.armHint}>
                Tocca il cestino per eliminare, oppure un altro momento.
              </Text>
            ) : null}
          </View>
        }
        empty={
          photosQuery.isLoading ? (
            <ActivityIndicator color={colors.primary} style={styles.emptyPad} />
          ) : (
            <View style={styles.emptyPad}>
              <EmptyState
                title="Qui iniziano i suoi momenti"
                message="Tocca + in alto per aggiungere una foto."
              />
            </View>
          )
        }
        onPressPhoto={(photo) => {
          if (armedPhotoId) {
            setArmedPhotoId(null);
            return;
          }
          router.push(
            `/dogs/${dogId}/album/photo/${photo.id}?albumId=${albumId}` as never,
          );
        }}
        onLongPressPhoto={(photo) => setArmedPhotoId(photo.id)}
        onPressTrash={deletePhoto}
        footer={<View style={styles.footerSpacer} />}
      />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  headerPad: { paddingHorizontal: spacing.lg, paddingBottom: spacing.sm },
  iconBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  armHint: {
    color: colors.textSecondary,
    fontSize: typography.size.xs,
    marginBottom: spacing.sm,
    textAlign: 'center',
  },
  emptyPad: { paddingHorizontal: spacing.lg, paddingTop: spacing.xl },
  footerSpacer: { height: spacing.xxxl },
});
