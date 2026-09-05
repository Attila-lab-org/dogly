import React from 'react';
import { StyleSheet, Text } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { EmptyState, ScreenContainer } from '@/components';
import { colors, spacing, typography } from '@/theme/tokens';
import { StackScreenHeader } from '@/features/secondary/components';
import {
  AlbumCard,
  PrivacyNoticeBanner,
} from '@/features/photos/components';
import { PHOTO_COPY } from '@/features/photos/copy';
import { albumsMock, photoById } from '@/mocks/photos';
import { useDogProfile } from '@/features/core/useDogProfile';
import { Button } from '@/components';

export default function AlbumIndexScreen() {
  const { dogId } = useLocalSearchParams<{ dogId: string }>();
  const router = useRouter();
  const { dog } = useDogProfile();

  return (
    <ScreenContainer scroll>
      <StackScreenHeader title="Album foto" />
      <PrivacyNoticeBanner text={PHOTO_COPY.privateDefault} />

      {albumsMock.length === 0 ? (
        <EmptyState
          title="Nessun album"
          message={PHOTO_COPY.emptyAlbum.replace('{dogName}', dog.name)}
        />
      ) : (
        albumsMock.map((album) => {
          const cover = album.coverPhotoId
            ? photoById(album.coverPhotoId)?.thumbnailUri
            : null;
          return (
            <AlbumCard
              key={album.id}
              album={album}
              coverUri={cover}
              onPress={() =>
                router.push(`/dogs/${dogId}/album/${album.id}` as never)
              }
            />
          );
        })
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
