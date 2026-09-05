import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Button, EmptyState, ScreenContainer } from '@/components';
import { colors, radius, spacing, typography } from '@/theme/tokens';
import { StackScreenHeader } from '@/features/secondary/components';
import { VisibilityBadge } from '@/features/photos/components';
import { PHOTO_COPY } from '@/features/photos/copy';
import { sharePhoto } from '@/features/photos/share';
import {
  fetchAlbumPhotos,
  updateAlbumPhotoVisibility,
} from '@/features/photos/api';
import { useDogProfile } from '@/features/core/useDogProfile';
import type { PhotoVisibility } from '@/features/photos/types';

export default function PhotoViewerScreen() {
  const { photoId, albumId } = useLocalSearchParams<{
    photoId: string;
    albumId: string;
  }>();
  const { dog } = useDogProfile();
  const photosQuery = useQuery({
    queryKey: ['gallery-photos', albumId],
    queryFn: () => fetchAlbumPhotos(albumId!),
    enabled: Boolean(albumId),
  });
  const base = photosQuery.data?.find((photo) => photo.id === photoId);
  const [visibility, setVisibility] = useState<PhotoVisibility>('private');

  useEffect(() => {
    if (base) setVisibility(base.visibility);
  }, [base]);

  if (photosQuery.isLoading) {
    return (
      <ScreenContainer>
        <StackScreenHeader title="Foto" />
        <ActivityIndicator color={colors.primary} />
      </ScreenContainer>
    );
  }

  if (!base) {
    return (
      <ScreenContainer>
        <StackScreenHeader title="Foto" />
        <EmptyState title="Foto non trovata" message="Torna all’album." />
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer scroll>
      <StackScreenHeader title={base.caption ?? 'Foto'} />
      <Image source={{ uri: base.localUri }} style={styles.image} />
      <View style={styles.meta}>
        <VisibilityBadge visibility={visibility} />
        {base.caption ? (
          <Text style={styles.caption}>{base.caption}</Text>
        ) : null}
      </View>

      <Pressable
        accessibilityRole="switch"
        accessibilityState={{ checked: visibility === 'published' }}
        onPress={async () => {
          const next = visibility === 'private' ? 'published' : 'private';
          try {
            await updateAlbumPhotoVisibility(base.id, next);
            setVisibility(next);
            Alert.alert(
              next === 'published' ? 'Foto visibile' : 'Foto privata',
              PHOTO_COPY.publishedHint,
            );
          } catch {
            Alert.alert('Modifica non salvata', 'Riprova tra poco.');
          }
        }}
        style={styles.toggle}
      >
        <Text style={styles.toggleText}>
          {visibility === 'published'
            ? 'Rendi privata'
            : 'Rendi visibile (opt-in futuro)'}
        </Text>
      </Pressable>

      <Button
        title="Condividi"
        onPress={() => sharePhoto({ ...base, visibility }, dog.name)}
      />
      <Text style={styles.hint}>{PHOTO_COPY.shareConfirm}</Text>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  image: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceMuted,
  },
  meta: {
    marginTop: spacing.md,
    gap: spacing.sm,
  },
  caption: {
    fontSize: typography.size.md,
    color: colors.text,
  },
  toggle: {
    marginVertical: spacing.lg,
    minHeight: 44,
    justifyContent: 'center',
  },
  toggleText: {
    color: colors.accent,
    fontWeight: typography.weight.semibold,
  },
  hint: {
    marginTop: spacing.md,
    fontSize: typography.size.xs,
    color: colors.textMuted,
    lineHeight: typography.size.xs * typography.lineHeight.relaxed,
  },
});
