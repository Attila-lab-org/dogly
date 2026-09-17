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
import { Ionicons } from '@expo/vector-icons';
import { EmptyState, ScreenContainer } from '@/components';
import { colors, radius, spacing, typography } from '@/theme/tokens';
import { StackScreenHeader } from '@/features/secondary/components';
import { sharePhoto } from '@/features/photos/share';
import {
  deleteAlbumPhoto,
  fetchAlbumPhotos,
  updateAlbumPhotoCaption,
} from '@/features/photos/api';
import { useDogProfile } from '@/features/core/useDogProfile';
import { confirmDestructiveAction } from '@/lib/confirmAction';

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
  const [captionSaved, setCaptionSaved] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [imageRatio, setImageRatio] = useState(1);

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

  const captionChanged = caption.trim() !== (base.caption ?? '').trim();

  const saveCaption = async () => {
    if (!captionChanged || savingCaption) return;
    setSavingCaption(true);
    setCaptionSaved(false);
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
      setCaptionSaved(true);
    } catch {
      Alert.alert('Testo non salvato', 'Riprova tra poco.');
    } finally {
      setSavingCaption(false);
    }
  };

  const removePhoto = () => {
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
  };

  return (
    <ScreenContainer scroll>
      <StackScreenHeader title={`Un momento di ${dog.name}`} />
      <View style={[styles.imageFrame, { aspectRatio: imageRatio }]}>
        <Image
          source={{ uri: base.localUri }}
          style={styles.image}
          resizeMode="contain"
          onLoad={(event) => {
            const { width, height } = event.nativeEvent.source;
            if (width && height) {
              setImageRatio(Math.max(0.72, Math.min(1.5, width / height)));
            }
          }}
        />
        <View style={styles.privateBadge}>
          <Ionicons name="lock-closed" size={12} color="#FFFFFF" />
          <Text style={styles.privateText}>Solo tua</Text>
        </View>
      </View>

      <View style={styles.captionSection}>
        <View style={styles.captionHeader}>
          <Text style={styles.fieldLabel}>Una frase per questo momento</Text>
          {captionChanged ? (
            <Pressable
              accessibilityRole="button"
              disabled={savingCaption}
              onPress={() => void saveCaption()}
              hitSlop={10}
            >
              <Text style={styles.saveText}>
                {savingCaption ? 'Salvo…' : 'Salva'}
              </Text>
            </Pressable>
          ) : captionSaved ? (
            <Text style={styles.savedText}>Salvato</Text>
          ) : null}
        </View>
        <TextInput
          value={caption}
          onChangeText={(value) => {
            setCaption(value);
            setCaptionSaved(false);
          }}
          placeholder="Aggiungi un ricordo…"
          placeholderTextColor={colors.textMuted}
          maxLength={280}
          multiline
          style={styles.captionInput}
        />
      </View>

      <View style={styles.actions}>
        <Pressable
          accessibilityRole="button"
          onPress={() =>
            void sharePhoto(
              { ...base, caption: caption.trim() || undefined },
              dog.name,
            )
          }
          style={styles.actionButton}
        >
          <Ionicons name="share-outline" size={20} color={colors.primary} />
          <Text style={styles.actionText}>Condividi</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          disabled={deleting}
          onPress={() =>
            confirmDestructiveAction(
              'Eliminare questa foto?',
              `Verrà rimossa definitivamente dai momenti di ${dog.name}.`,
              removePhoto,
            )
          }
          style={styles.actionButton}
        >
          <Ionicons name="trash-outline" size={20} color={colors.danger} />
          <Text style={styles.deleteText}>
            {deleting ? 'Elimino…' : 'Elimina'}
          </Text>
        </Pressable>
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  imageFrame: {
    position: 'relative',
    width: '100%',
    borderRadius: radius.lg,
    overflow: 'hidden',
    backgroundColor: '#182235',
  },
  image: {
    width: '100%',
    height: '100%',
  },
  privateBadge: {
    position: 'absolute',
    left: spacing.md,
    bottom: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radius.full,
    backgroundColor: 'rgba(15, 23, 42, 0.72)',
  },
  privateText: {
    fontSize: typography.size.xs,
    color: '#FFFFFF',
    fontWeight: typography.weight.semibold,
  },
  captionSection: {
    marginTop: spacing.xl,
  },
  captionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  fieldLabel: {
    color: colors.text,
    fontSize: typography.size.sm,
    fontWeight: typography.weight.semibold,
  },
  saveText: {
    color: colors.primary,
    fontSize: typography.size.sm,
    fontWeight: typography.weight.bold,
  },
  savedText: {
    color: colors.accent,
    fontSize: typography.size.sm,
    fontWeight: typography.weight.semibold,
  },
  captionInput: {
    minHeight: 64,
    borderRadius: radius.md,
    color: colors.text,
    backgroundColor: colors.surfaceMuted,
    padding: spacing.md,
    textAlignVertical: 'top',
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.md,
    marginTop: spacing.xl,
    marginBottom: spacing.xxl,
  },
  actionButton: {
    flex: 1,
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
  },
  actionText: {
    color: colors.primary,
    fontWeight: typography.weight.semibold,
  },
  deleteText: {
    color: colors.danger,
    fontWeight: typography.weight.semibold,
  },
});
