/**
 * Momenti — griglia stile Instagram (profilo): foto a filo, + in header, meno click.
 */
import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { EmptyState, ErrorState, ScreenContainer } from '@/components';
import { CuteIcon } from '@/components/CuteIcon';
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

const PAGE_SIZE = 24;

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
      const uploaded = await uploadAlbumPhoto(album.id, uri);
      queryClient.setQueryData(
        ['gallery-dog-photos', dogId, PAGE_SIZE],
        (current: { pages: AlbumPhoto[][]; pageParams: number[] } | undefined) => {
          if (!current) return current;
          const [firstPage = [], ...restPages] = current.pages;
          return { ...current, pages: [[uploaded, ...firstPage], ...restPages] };
        },
      );
      void Promise.all([
        queryClient.invalidateQueries({ queryKey: ['gallery-albums', dogId] }),
        queryClient.invalidateQueries({
          queryKey: ['gallery-dog-photos', dogId],
          refetchType: 'none',
        }),
        queryClient.invalidateQueries({ queryKey: ['social-moments', dogId] }),
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
      'Eliminare questo momento?',
      `Verrà rimosso dai Momenti di ${dog.name}.`,
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
              queryClient.invalidateQueries({
                queryKey: ['social-moments', dogId],
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
          title="Momenti non caricati"
          message="Non riesco a mostrarli. Controlla la connessione e riprova."
          retryLabel="Riprova"
          onRetry={() => void photosQuery.refetch()}
        />
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer padded={false} style={styles.screen}>
      <PhotoGrid
        photos={photos}
        manageMode={managing}
        header={
          <View style={styles.headerPad}>
            <StackScreenHeader
              title={managing ? 'Seleziona' : 'Momenti'}
              right={
                <View style={styles.headerActions}>
                  {photos.length > 0 ? (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={
                        managing ? 'Esci dalla selezione' : 'Gestisci momenti'
                      }
                      onPress={() => setManaging((value) => !value)}
                      hitSlop={8}
                      style={styles.iconBtn}
                    >
                      <Ionicons
                        name={managing ? 'checkmark' : 'trash-outline'}
                        size={22}
                        color={managing ? colors.primary : colors.text}
                      />
                    </Pressable>
                  ) : null}
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Aggiungi momento"
                    disabled={adding || Boolean(deletingId)}
                    onPress={() => void addMoment()}
                    hitSlop={8}
                    style={styles.iconBtn}
                  >
                    {adding ? (
                      <ActivityIndicator size="small" color={colors.primary} />
                    ) : (
                      <Ionicons name="add" size={28} color={colors.text} />
                    )}
                  </Pressable>
                </View>
              }
            />
            {managing ? (
              <Text style={styles.manageHint}>Tocca un momento per eliminarlo.</Text>
            ) : null}
          </View>
        }
        empty={
          photosQuery.isLoading ? (
            <View style={styles.emptyWrap}>
              <ActivityIndicator color={colors.primary} />
            </View>
          ) : (
            <View style={styles.emptyWrap}>
              <View style={styles.emptyIcon}>
                <CuteIcon
                  name="play"
                  size={36}
                  color={colors.accent}
                  secondary={colors.accentSoft}
                />
              </View>
              <EmptyState
                title={`Il primo momento di ${dog.name}`}
                message="Tocca + in alto per aggiungere una foto."
              />
              <Pressable
                accessibilityRole="button"
                onPress={() => void addMoment()}
                style={styles.emptyAdd}
              >
                <Ionicons name="add" size={20} color="#FFFFFF" />
                <Text style={styles.emptyAddText}>Aggiungi</Text>
              </Pressable>
            </View>
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
        onLongPressPhoto={(photo) => {
          if (!managing) setManaging(true);
          else deletePhoto(photo);
        }}
        onEndReached={() => {
          if (photosQuery.hasNextPage && !photosQuery.isFetchingNextPage) {
            void photosQuery.fetchNextPage();
          }
        }}
        footer={
          photosQuery.isFetchingNextPage ? (
            <ActivityIndicator
              color={colors.primary}
              style={styles.pageSpinner}
            />
          ) : (
            <View style={styles.footerSpacer} />
          )
        }
      />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  screen: { paddingHorizontal: 0 },
  headerPad: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
  },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  iconBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  manageHint: {
    color: colors.textSecondary,
    fontSize: typography.size.xs,
    marginBottom: spacing.sm,
    textAlign: 'center',
  },
  emptyWrap: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xxl,
    alignItems: 'center',
    gap: spacing.md,
  },
  emptyIcon: {
    width: 72,
    height: 72,
    borderRadius: 24,
    backgroundColor: colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyAdd: {
    marginTop: spacing.sm,
    minHeight: 44,
    paddingHorizontal: spacing.xl,
    borderRadius: 999,
    backgroundColor: colors.primary,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  emptyAddText: {
    color: '#FFFFFF',
    fontWeight: typography.weight.bold,
    fontSize: typography.size.sm,
  },
  pageSpinner: { marginVertical: spacing.lg },
  footerSpacer: { height: spacing.xxxl },
});
