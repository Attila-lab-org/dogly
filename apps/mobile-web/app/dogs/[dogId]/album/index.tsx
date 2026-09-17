import React, { useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, Text } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { EmptyState, ErrorState, ScreenContainer } from '@/components';
import { colors, spacing, typography } from '@/theme/tokens';
import { StackScreenHeader } from '@/features/secondary/components';
import {
  AlbumCard,
  PrivacyNoticeBanner,
} from '@/features/photos/components';
import { PHOTO_COPY } from '@/features/photos/copy';
import {
  createAlbum,
  fetchAlbums,
  uploadAlbumPhoto,
} from '@/features/photos/api';
import { pickAlbumPhoto } from '@/features/photos/share';
import type { AlbumPhoto, PhotoAlbum } from '@/features/photos/types';
import { useDogProfile } from '@/features/core/useDogProfile';
import { isPersistedId } from '@/lib/persistedId';
import { Button } from '@/components';

export default function AlbumIndexScreen() {
  const { dogId } = useLocalSearchParams<{ dogId: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { dog } = useDogProfile();
  const [addingFirst, setAddingFirst] = useState(false);
  const albumsQuery = useQuery({
    queryKey: ['gallery-albums', dogId],
    queryFn: () => fetchAlbums(dogId!),
    enabled: isPersistedId(dogId),
  });
  const albums = albumsQuery.data ?? [];

  const addFirstMoment = async () => {
    if (!dogId) return;
    const uri = await pickAlbumPhoto();
    if (!uri) return;
    setAddingFirst(true);
    try {
      const album = await createAlbum(dogId, 'Momenti');
      const photo = await uploadAlbumPhoto(album.id, uri);
      queryClient.setQueryData<AlbumPhoto[]>(
        ['gallery-photos', album.id],
        [photo],
      );
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['gallery-albums', dogId] }),
        queryClient.invalidateQueries({
          queryKey: ['gallery-dog-photos', dogId],
        }),
      ]);
      router.replace(`/dogs/${dogId}/album/${album.id}` as never);
    } catch {
      Alert.alert(
        'Foto non salvata',
        'Non sono riuscito a conservare questo momento. Riprova tra poco.',
      );
    } finally {
      setAddingFirst(false);
    }
  };

  // Copertina firmata restituita dal backend; la cache locale evita un flash
  // quando l'utente ha appena aggiunto la foto.
  const coverUriFor = (album: PhotoAlbum): string | null => {
    if (!album.coverPhotoId) return null;
    const cached = queryClient.getQueryData<AlbumPhoto[]>([
      'gallery-photos',
      album.id,
    ]);
    const photo = cached?.find((p) => p.id === album.coverPhotoId);
    return photo?.thumbnailUri ?? album.coverUri ?? null;
  };

  return (
    <ScreenContainer scroll>
      <StackScreenHeader title="Album foto" />
      <Text style={styles.intro}>
        I momenti di {dog.name}, raccolti da te e sempre privati.
      </Text>
      <PrivacyNoticeBanner text={PHOTO_COPY.privateDefault} />

      {albumsQuery.isLoading ? (
        <ActivityIndicator color={colors.primary} />
      ) : albumsQuery.isError ? (
        <ErrorState
          title="Album non caricati"
          message="Non riesco a leggere gli album. Controlla la connessione e riprova."
          retryLabel="Riprova"
          onRetry={() => void albumsQuery.refetch()}
        />
      ) : albums.length === 0 ? (
        <>
          <EmptyState
            title={`Il primo momento di ${dog.name}`}
            message="Scegli una foto che ami. Creerò io il primo album."
          />
          <Button
            title="Aggiungi il primo momento"
            loading={addingFirst}
            onPress={() => void addFirstMoment()}
            style={styles.firstCta}
          />
        </>
      ) : (
        albums.map((album) => (
          <AlbumCard
            key={album.id}
            album={album}
            coverUri={coverUriFor(album)}
            onPress={() =>
              router.push(`/dogs/${dogId}/album/${album.id}` as never)
            }
          />
        ))
      )}

      <Button
        title={albums.length === 0 ? 'Preferisco creare un album' : 'Nuovo album'}
        variant="outline"
        onPress={() => router.push(`/dogs/${dogId}/album/create` as never)}
        style={styles.cta}
      />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  intro: {
    color: colors.textSecondary,
    fontSize: typography.size.sm,
    lineHeight: typography.size.sm * typography.lineHeight.relaxed,
    marginBottom: spacing.md,
  },
  firstCta: {
    marginTop: spacing.lg,
  },
  cta: {
    marginTop: spacing.md,
  },
});
