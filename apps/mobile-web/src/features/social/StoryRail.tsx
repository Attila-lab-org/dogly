/**
 * Rail storie stile Instagram alimentato dai Momenti del cane.
 */
import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useQueryClient } from '@tanstack/react-query';
import { colors, spacing, typography } from '@/theme/tokens';
import { DogAvatar } from '@/features/core/components';
import {
  getOrCreateMomentsAlbum,
  uploadAlbumPhoto,
} from '@/features/photos/api';
import { pickAlbumPhoto, takeStoryPhoto } from '@/features/photos/share';
import type { AlbumPhoto } from '@/features/photos/types';

const RING = 78;
const AVATAR = 68;

type Props = {
  dogId: string;
  dogName: string;
  dogPhotoUri?: string | null;
  photos: AlbumPhoto[];
  hasUnseen: boolean;
  uploading?: boolean;
  onOpenStory: (startIndex: number) => void;
  onUploaded: () => void;
};

export function StoryRail({
  dogId,
  dogName,
  dogPhotoUri,
  photos,
  hasUnseen,
  uploading = false,
  onOpenStory,
  onUploaded,
}: Props) {
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);
  const hasStories = photos.length > 0;

  const uploadUri = useCallback(
    async (uri: string) => {
      setBusy(true);
      try {
        const album = await getOrCreateMomentsAlbum(dogId);
        await uploadAlbumPhoto(album.id, uri, {
          caption: `Storia di ${dogName}`,
          visibility: 'PRIVATE',
        });
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: ['gallery-dog-photos', dogId] }),
          queryClient.invalidateQueries({ queryKey: ['gallery-photos', album.id] }),
          queryClient.invalidateQueries({ queryKey: ['gallery-albums', dogId] }),
        ]);
        onUploaded();
      } catch {
        Alert.alert(
          'Upload non riuscito',
          'Non sono riuscito a salvare questa storia. Riprova.',
        );
      } finally {
        setBusy(false);
      }
    },
    [dogId, dogName, onUploaded, queryClient],
  );

  const addStory = useCallback(() => {
    if (busy || uploading) return;
    const runCamera = async () => {
      const uri = await takeStoryPhoto();
      if (uri) await uploadUri(uri);
    };
    const runGallery = async () => {
      const uri = await pickAlbumPhoto();
      if (uri) await uploadUri(uri);
    };
    if (Platform.OS === 'web') {
      Alert.alert('Aggiungi alla storia', 'Scegli come aggiungere un momento.', [
        { text: 'Fotocamera', onPress: () => void runCamera() },
        { text: 'Galleria', onPress: () => void runGallery() },
        { text: 'Annulla', style: 'cancel' },
      ]);
      return;
    }
    Alert.alert('Aggiungi alla storia', undefined, [
      { text: 'Fotocamera', onPress: () => void runCamera() },
      { text: 'Galleria', onPress: () => void runGallery() },
      { text: 'Annulla', style: 'cancel' },
    ]);
  }, [busy, uploadUri, uploading]);

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.row}
    >
      <View style={styles.item}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={
            hasStories
              ? `Apri le storie di ${dogName}`
              : `Aggiungi la prima storia di ${dogName}`
          }
          onPress={() => (hasStories ? onOpenStory(0) : addStory())}
          style={({ pressed }) => [styles.ringHit, pressed && styles.pressed]}
        >
          {hasStories && hasUnseen ? (
            <LinearGradient
              colors={['#F58529', '#DD2A7B', '#8134AF', '#515BD4']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.ringGradient}
            >
              <View style={styles.ringInner}>
                <DogAvatar photoUri={dogPhotoUri} dogName={dogName} size={AVATAR} />
              </View>
            </LinearGradient>
          ) : (
            <View style={[styles.ringFlat, hasStories && styles.ringSeen]}>
              <DogAvatar photoUri={dogPhotoUri} dogName={dogName} size={AVATAR} />
            </View>
          )}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Aggiungi una storia"
            onPress={addStory}
            disabled={busy || uploading}
            style={styles.badgePlus}
          >
            {busy || uploading ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <Ionicons name="add" size={16} color="#FFFFFF" />
            )}
          </Pressable>
        </Pressable>
        <Text style={styles.label} numberOfLines={1}>
          La tua storia
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    gap: spacing.md,
    alignItems: 'flex-start',
  },
  item: {
    width: RING + 8,
    alignItems: 'center',
    gap: 6,
  },
  ringHit: {
    width: RING,
    height: RING,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ringGradient: {
    width: RING,
    height: RING,
    borderRadius: RING / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ringInner: {
    width: AVATAR + 6,
    height: AVATAR + 6,
    borderRadius: (AVATAR + 6) / 2,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ringFlat: {
    width: RING,
    height: RING,
    borderRadius: RING / 2,
    borderWidth: 2,
    borderColor: '#D1D5DB',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
  },
  ringSeen: {
    borderColor: '#9CA3AF',
  },
  badgePlus: {
    position: 'absolute',
    right: 0,
    bottom: 0,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.primary,
    borderWidth: 2,
    borderColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    color: colors.text,
    fontSize: 11,
    fontWeight: typography.weight.medium,
    textAlign: 'center',
    maxWidth: RING + 8,
  },
  pressed: { opacity: 0.88 },
});
