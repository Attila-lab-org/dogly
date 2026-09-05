import React, { useMemo, useState } from 'react';
import { Alert, StyleSheet } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Button, EmptyState, ScreenContainer } from '@/components';
import { spacing } from '@/theme/tokens';
import { StackScreenHeader } from '@/features/secondary/components';
import {
  PhotoGrid,
  PrivacyNoticeBanner,
} from '@/features/photos/components';
import { PHOTO_COPY } from '@/features/photos/copy';
import { pickAlbumPhoto } from '@/features/photos/share';
import {
  albumById,
  photosForAlbum,
  photosMock,
} from '@/mocks/photos';
import type { AlbumPhoto } from '@/features/photos/types';
import { DOG_ID } from '@/mocks/core';

export default function AlbumDetailScreen() {
  const { dogId, albumId } = useLocalSearchParams<{
    dogId: string;
    albumId: string;
  }>();
  const router = useRouter();
  const album = albumById(albumId);
  const [extra, setExtra] = useState<AlbumPhoto[]>([]);
  const photos = useMemo(
    () => [...photosForAlbum(albumId), ...extra],
    [albumId, extra],
  );

  if (!album) {
    return (
      <ScreenContainer>
        <StackScreenHeader title="Album" />
        <EmptyState title="Album non trovato" message="Torna al profilo." />
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer scroll>
      <StackScreenHeader title={album.title} />
      <PrivacyNoticeBanner text={PHOTO_COPY.privateDefault} />
      <PhotoGrid
        photos={photos}
        onPressPhoto={(photo) =>
          router.push(`/dogs/${dogId}/album/photo/${photo.id}` as never)
        }
      />
      <Button
        title="Aggiungi foto"
        style={styles.cta}
        onPress={async () => {
          const uri = await pickAlbumPhoto();
          if (!uri) return;
          const id = `photo-local-${Date.now()}`;
          const next: AlbumPhoto = {
            id,
            dogId: dogId ?? DOG_ID,
            albumId,
            localUri: uri,
            thumbnailUri: uri,
            visibility: 'private',
            takenAt: new Date().toISOString(),
            uploadedAt: new Date().toISOString(),
          };
          photosMock.push(next);
          setExtra((list) => [...list, next]);
          Alert.alert('Foto aggiunta', 'Salvata come privata nell’album.');
        }}
      />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  cta: {
    marginTop: spacing.xl,
  },
});
