import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button, Card, EmptyState, ScreenContainer } from '@/components';
import { colors, radius, spacing, typography } from '@/theme/tokens';
import { StackScreenHeader } from '@/features/secondary/components';
import { PHOTO_COPY } from '@/features/photos/copy';
import { sharePhoto } from '@/features/photos/share';
import {
  deleteAlbumPhoto,
  fetchAlbumPhotos,
  updateAlbumPhotoCaption,
} from '@/features/photos/api';
import { useDogProfile } from '@/features/core/useDogProfile';

export default function PhotoViewerScreen() {
  const { photoId, albumId } = useLocalSearchParams<{
    photoId: string;
    albumId: string;
  }>();
  const router = useRouter();
  const { dog } = useDogProfile();
  const queryClient = useQueryClient();
  const photosQuery = useQuery({
    queryKey: ['gallery-photos', albumId],
    queryFn: () => fetchAlbumPhotos(albumId!),
    enabled: Boolean(albumId),
  });
  const base = photosQuery.data?.find((photo) => photo.id === photoId);
  const [caption, setCaption] = useState('');
  const [savingCaption, setSavingCaption] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (base) setCaption(base.caption ?? '');
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
      <StackScreenHeader title="Un suo momento" />
      <Image source={{ uri: base.localUri }} style={styles.image} resizeMode="contain" />
      <View style={styles.privateRow}>
        <Text style={styles.privateText}>Privata nel tuo album</Text>
      </View>

      <Card style={styles.memoryCard}>
        <Text style={styles.fieldLabel}>Cosa vuoi ricordare?</Text>
        <TextInput
          value={caption}
          onChangeText={setCaption}
          placeholder={`Es. La prima passeggiata di ${dog.name}`}
          placeholderTextColor={colors.textMuted}
          maxLength={280}
          multiline
          style={styles.captionInput}
        />
        <Button
          title="Salva il ricordo"
          variant="secondary"
          loading={savingCaption}
          disabled={!caption.trim() || caption.trim() === (base.caption ?? '').trim()}
          onPress={async () => {
            setSavingCaption(true);
            try {
              await updateAlbumPhotoCaption(base.id, caption);
              await Promise.all([
                queryClient.invalidateQueries({
                  queryKey: ['gallery-photos', albumId],
                }),
                queryClient.invalidateQueries({
                  queryKey: ['gallery-dog-photos', base.dogId],
                }),
              ]);
            } catch {
              Alert.alert('Ricordo non salvato', 'Riprova tra poco.');
            } finally {
              setSavingCaption(false);
            }
          }}
        />
      </Card>

      <Button
        title="Condividi"
        onPress={() => sharePhoto({ ...base, caption: caption.trim() || undefined }, dog.name)}
      />
      <Text style={styles.hint}>{PHOTO_COPY.shareConfirm}</Text>
      <Pressable
        accessibilityRole="button"
        disabled={deleting}
        onPress={() =>
          Alert.alert(
            'Eliminare questa foto?',
            'Verrà rimossa definitivamente dall’album.',
            [
              { text: 'Annulla', style: 'cancel' },
              {
                text: 'Elimina',
                style: 'destructive',
                onPress: () => {
                  setDeleting(true);
                  void deleteAlbumPhoto(base.id)
                    .then(async () => {
                      await Promise.all([
                        queryClient.invalidateQueries({
                          queryKey: ['gallery-photos', albumId],
                        }),
                        queryClient.invalidateQueries({
                          queryKey: ['gallery-albums', base.dogId],
                        }),
                        queryClient.invalidateQueries({
                          queryKey: ['gallery-dog-photos', base.dogId],
                        }),
                      ]);
                      router.back();
                    })
                    .catch(() => {
                      setDeleting(false);
                      Alert.alert('Foto non eliminata', 'Riprova tra poco.');
                    });
                },
              },
            ],
          )
        }
        style={styles.deleteButton}
      >
        <Text style={styles.deleteText}>
          {deleting ? 'Eliminazione…' : 'Elimina foto'}
        </Text>
      </Pressable>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  image: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: radius.lg,
    backgroundColor: '#0F172A',
  },
  privateRow: {
    marginTop: spacing.md,
    marginBottom: spacing.lg,
  },
  privateText: {
    fontSize: typography.size.xs,
    color: colors.textSecondary,
  },
  memoryCard: {
    marginBottom: spacing.lg,
  },
  fieldLabel: {
    color: colors.text,
    fontSize: typography.size.sm,
    fontWeight: typography.weight.semibold,
    marginBottom: spacing.sm,
  },
  captionInput: {
    minHeight: 76,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    color: colors.text,
    backgroundColor: colors.surfaceMuted,
    padding: spacing.md,
    marginBottom: spacing.md,
    textAlignVertical: 'top',
  },
  hint: {
    marginTop: spacing.md,
    fontSize: typography.size.xs,
    color: colors.textMuted,
    lineHeight: typography.size.xs * typography.lineHeight.relaxed,
  },
  deleteButton: {
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.lg,
    marginBottom: spacing.xl,
  },
  deleteText: {
    color: colors.danger,
    fontWeight: typography.weight.semibold,
  },
});
