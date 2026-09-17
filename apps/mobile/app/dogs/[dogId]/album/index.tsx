import React, { useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { Button, EmptyState, ErrorState, ScreenContainer } from '@/components';
import { colors, spacing, typography } from '@/theme/tokens';
import { StackScreenHeader } from '@/features/secondary/components';
import { PhotoGrid } from '@/features/photos/components';
import {
  deleteAlbumPhoto,
  fetchDogPhotos,
  getOrCreateMomentsAlbum,
  uploadAlbumPhoto,
} from '@/features/photos/api';
import { pickAlbumPhoto } from '@/features/photos/share';
import type { AlbumPhoto } from '@/features/photos/types';
import { useDogProfile } from '@/features/core/useDogProfile';
import { isPersistedId } from '@/lib/persistedId';
import { confirmDestructiveAction } from '@/lib/confirmAction';

const PAGE_SIZE = 60;

export default function AlbumIndexScreen() {
  const { dogId } = useLocalSearchParams<{ dogId: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { dog } = useDogProfile();
  const [adding, setAdding] = useState(false);
  const [managing, setManaging] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const photosQuery = useInfiniteQuery({
    queryKey: ['gallery-dog-photos', dogId, PAGE_SIZE],
    queryFn: ({ pageParam }) => fetchDogPhotos(dogId!, PAGE_SIZE, pageParam),
    initialPageParam: 0,
    getNextPageParam: (lastPage, pages) =>
      lastPage.length === PAGE_SIZE ? pages.length * PAGE_SIZE : undefined,
    enabled: isPersistedId(dogId),
  });
  const photos = useMemo(
    () => (photosQuery.data?.pages ?? []).flat(),
    [photosQuery.data],
  );

  const addMoment = async () => {
    if (!dogId) return;
    const uri = await pickAlbumPhoto();
    if (!uri) return;
    setAdding(true);
    try {
      const album = await getOrCreateMomentsAlbum(dogId);
      await uploadAlbumPhoto(album.id, uri);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['gallery-albums', dogId] }),
        queryClient.invalidateQueries({
          queryKey: ['gallery-dog-photos', dogId],
        }),
      ]);
    } catch {
      Alert.alert(
        'Foto non salvata',
        'Non sono riuscito a conservare questo momento. Riprova tra poco.',
      );
    } finally {
      setAdding(false);
    }
  };

  const deletePhoto = (photo: AlbumPhoto) => {
    confirmDestructiveAction(
      'Eliminare questa foto?',
      'Verrà rimossa definitivamente dai momenti di ' + dog.name + '.',
      () => {
        setDeletingId(photo.id);
        void deleteAlbumPhoto(photo.id)
          .then(async () => {
            await Promise.all([
              queryClient.invalidateQueries({
                queryKey: ['gallery-dog-photos', dogId],
              }),
              queryClient.invalidateQueries({
                queryKey: ['gallery-albums', dogId],
              }),
            ]);
            setDeletingId(null);
          })
          .catch(() => {
            setDeletingId(null);
            Alert.alert('Foto non eliminata', 'Riprova tra poco.');
          });
      },
    );
  };

  if (photosQuery.isError) {
    return (
      <ScreenContainer>
        <StackScreenHeader title={`Momenti di ${dog.name}`} />
        <ErrorState
          title="Foto non caricate"
          message="Non riesco a mostrare i suoi momenti. Controlla la connessione e riprova."
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
        manageMode={managing}
        header={
          <>
            <StackScreenHeader title={`Momenti di ${dog.name}`} />
            <View style={styles.heading}>
              <Text style={styles.intro}>
                Tutte le foto che vuoi conservare di {dog.name}.
              </Text>
              {photos.length > 0 ? (
                <Pressable
                  accessibilityRole="button"
                  onPress={() => setManaging((value) => !value)}
                  style={styles.manageButton}
                >
                  <Text style={styles.manageText}>
                    {managing ? 'Fine' : 'Elimina foto'}
                  </Text>
                </Pressable>
              ) : null}
            </View>
            {managing ? (
              <Text style={styles.manageHint}>
                Tocca il cestino sulla foto che vuoi eliminare.
              </Text>
            ) : null}
          </>
        }
        empty={
          photosQuery.isLoading ? (
            <ActivityIndicator color={colors.primary} />
          ) : (
            <EmptyState
              title={`Il primo momento di ${dog.name}`}
              message="Scegli una foto che ami: apparirà subito qui."
            />
          )
        }
        onPressPhoto={(photo) => {
          if (managing) {
            deletePhoto(photo);
            return;
          }
          router.push(
            `/dogs/${dogId}/album/photo/${photo.id}?albumId=${photo.albumId}` as never,
          );
        }}
        onEndReached={() => {
          if (photosQuery.hasNextPage && !photosQuery.isFetchingNextPage) {
            void photosQuery.fetchNextPage();
          }
        }}
        footer={
          <View>
            {photosQuery.isFetchingNextPage ? (
              <ActivityIndicator color={colors.primary} />
            ) : null}
            <Button
              title={photos.length === 0 ? 'Aggiungi la prima foto' : 'Aggiungi foto'}
              loading={adding}
              disabled={Boolean(deletingId)}
              onPress={() => void addMoment()}
              style={styles.cta}
            />
          </View>
        }
      />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  heading: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    marginBottom: spacing.lg,
  },
  intro: {
    flex: 1,
    color: colors.textSecondary,
    fontSize: typography.size.sm,
    lineHeight: typography.size.sm * typography.lineHeight.relaxed,
  },
  manageButton: {
    minHeight: 44,
    justifyContent: 'center',
  },
  manageText: {
    color: colors.danger,
    fontWeight: typography.weight.semibold,
  },
  manageHint: {
    color: colors.textSecondary,
    fontSize: typography.size.xs,
    marginBottom: spacing.md,
  },
  cta: {
    marginTop: spacing.xl,
    marginBottom: spacing.xxxl,
  },
});
