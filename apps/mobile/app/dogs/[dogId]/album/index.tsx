import React from 'react';
import { ActivityIndicator, StyleSheet, Text } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { EmptyState, ScreenContainer } from '@/components';
import { colors, spacing, typography } from '@/theme/tokens';
import { StackScreenHeader } from '@/features/secondary/components';
import {
  AlbumCard,
  PrivacyNoticeBanner,
} from '@/features/photos/components';
import { PHOTO_COPY } from '@/features/photos/copy';
import { fetchAlbums } from '@/features/photos/api';
import { useDogProfile } from '@/features/core/useDogProfile';
import { Button } from '@/components';

export default function AlbumIndexScreen() {
  const { dogId } = useLocalSearchParams<{ dogId: string }>();
  const router = useRouter();
  const { dog } = useDogProfile();
  const albumsQuery = useQuery({
    queryKey: ['gallery-albums', dogId],
    queryFn: () => fetchAlbums(dogId!),
    enabled: Boolean(dogId),
  });
  const albums = albumsQuery.data ?? [];

  return (
    <ScreenContainer scroll>
      <StackScreenHeader title="Album foto" />
      <PrivacyNoticeBanner text={PHOTO_COPY.privateDefault} />

      {albumsQuery.isLoading ? (
        <ActivityIndicator color={colors.primary} />
      ) : albums.length === 0 ? (
        <EmptyState
          title="Nessun album"
          message={PHOTO_COPY.emptyAlbum.replace('{dogName}', dog.name)}
        />
      ) : (
        albums.map((album) => (
          <AlbumCard
            key={album.id}
            album={album}
            onPress={() =>
              router.push(`/dogs/${dogId}/album/${album.id}` as never)
            }
          />
        ))
      )}

      <Button
        title="Nuovo album"
        variant="secondary"
        onPress={() => router.push(`/dogs/${dogId}/album/create` as never)}
        style={styles.cta}
      />
      <Text style={styles.footer}>
        I video delle analisi non vengono aggiunti automaticamente qui.
      </Text>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  cta: {
    marginTop: spacing.lg,
  },
  footer: {
    marginTop: spacing.md,
    fontSize: typography.size.xs,
    color: colors.textMuted,
    textAlign: 'center',
  },
});
