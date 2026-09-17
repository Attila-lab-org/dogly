import React, { useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button, EmptyState, ErrorState, ScreenContainer } from '@/components';
import { colors, spacing } from '@/theme/tokens';
import { StackScreenHeader } from '@/features/secondary/components';
import {
  PhotoGrid,
  PrivacyNoticeBanner,
} from '@/features/photos/components';
import { PHOTO_COPY } from '@/features/photos/copy';
import { pickAlbumPhoto } from '@/features/photos/share';
import {
  fetchAlbum,
  fetchAlbumPhotos,
  uploadAlbumPhoto,
} from '@/features/photos/api';

export default function AlbumDetailScreen() {
  const { dogId, albumId } = useLocalSearchParams<{
    dogId: string;
    albumId: string;
  }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [uploading, setUploading] = useState(false);
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
    <ScreenContainer>
      <PhotoGrid
        photos={photos}
        header={
          <>
            <StackScreenHeader title={album.title} />
            <PrivacyNoticeBanner text={PHOTO_COPY.privateDefault} />
          </>
        }
        empty={
          photosQuery.isLoading ? (
            <ActivityIndicator color={colors.primary} />
          ) : (
            <EmptyState
              title="Qui iniziano i suoi momenti"
              message="Aggiungi una foto che vuoi conservare di questo album."
            />
          )
        }
        onPressPhoto={(photo) =>
          router.push(
            `/dogs/${dogId}/album/photo/${photo.id}?albumId=${albumId}` as never,
          )
        }
        footer={
          <Button
            title="Aggiungi foto"
            loading={uploading}
            style={styles.cta}
            onPress={async () => {
              const uri = await pickAlbumPhoto();
              if (!uri) return;
              setUploading(true);
              try {
                await uploadAlbumPhoto(albumId, uri);
                await Promise.all([
                  queryClient.invalidateQueries({
                    queryKey: ['gallery-photos', albumId],
                  }),
                  queryClient.invalidateQueries({
                    queryKey: ['gallery-albums', dogId],
                  }),
                  queryClient.invalidateQueries({
                    queryKey: ['gallery-dog-photos', dogId],
                  }),
                ]);
                Alert.alert(
                  'Foto aggiunta',
                  'Salvata in modo privato nel tuo album.',
                );
              } catch {
                Alert.alert(
                  'Foto non salvata',
                  'Il caricamento non è riuscito. Riprova tra poco.',
                );
              } finally {
                setUploading(false);
              }
            }}
          />
        }
      />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  cta: {
    marginTop: spacing.xl,
    marginBottom: spacing.xxxl,
  },
});
