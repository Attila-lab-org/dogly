/**
 * Rail storie stile Instagram alimentato dai Momenti del cane.
 *
 * Su web il file picker deve partire nello stesso gesto del tap
 * (pickWebImage diretto, niente Alert).
 */
import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useQueryClient } from '@tanstack/react-query';
import { colors, radius, spacing, typography } from '@/theme/tokens';
import { DogAvatar } from '@/features/core/components';
import {
  getOrCreateMomentsAlbum,
  uploadAlbumPhoto,
} from '@/features/photos/api';
import { pickAlbumPhoto, takeStoryPhoto } from '@/features/photos/share';
import { pickWebImage } from '@/features/photos/webPickImage';
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
  const [chooserOpen, setChooserOpen] = useState(false);
  const hasStories = photos.length > 0;
  const isBusy = busy || uploading;

  const uploadUri = useCallback(
    async (uri: string) => {
      setBusy(true);
      setChooserOpen(false);
      try {
        const album = await getOrCreateMomentsAlbum(dogId);
        await uploadAlbumPhoto(album.id, uri, {
          caption: `Storia di ${dogName}`,
          visibility: 'PRIVATE',
        });
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: ['social-moments', dogId] }),
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

  /** Web: pickWebImage nello stesso stack del tap. Native: share helpers. */
  const runCamera = useCallback(() => {
    if (isBusy) return;
    if (Platform.OS === 'web') {
      void pickWebImage({ capture: true }).then((picked) => {
        if (picked?.uri) void uploadUri(picked.uri);
      });
      return;
    }
    void takeStoryPhoto().then((uri) => {
      if (uri) void uploadUri(uri);
    });
  }, [isBusy, uploadUri]);

  const runGallery = useCallback(() => {
    if (isBusy) return;
    if (Platform.OS === 'web') {
      void pickWebImage().then((picked) => {
        if (picked?.uri) void uploadUri(picked.uri);
      });
      return;
    }
    void pickAlbumPhoto().then((uri) => {
      if (uri) void uploadUri(uri);
    });
  }, [isBusy, uploadUri]);

  const openChooser = useCallback(() => {
    if (isBusy) return;
    if (Platform.OS === 'web') {
      setChooserOpen((open) => !open);
      return;
    }
    Alert.alert('Aggiungi alla storia', undefined, [
      { text: 'Fotocamera', onPress: runCamera },
      { text: 'Galleria', onPress: runGallery },
      { text: 'Annulla', style: 'cancel' },
    ]);
  }, [isBusy, runCamera, runGallery]);

  return (
    <View style={styles.wrap}>
      <View style={styles.row}>
        <View style={styles.item}>
          <View style={styles.ringHit}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={
                hasStories
                  ? `Apri le storie di ${dogName}`
                  : `Aggiungi la prima storia di ${dogName}`
              }
              onPress={() => {
                if (hasStories) {
                  setChooserOpen(false);
                  onOpenStory(0);
                  return;
                }
                if (Platform.OS === 'web') {
                  runGallery();
                  return;
                }
                openChooser();
              }}
              style={({ pressed }) => [styles.ringPress, pressed && styles.pressed]}
            >
              {hasStories && hasUnseen ? (
                <LinearGradient
                  colors={['#F58529', '#DD2A7B', '#8134AF', '#515BD4']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.ringGradient}
                  pointerEvents="none"
                >
                  <View style={styles.ringInner} pointerEvents="none">
                    <DogAvatar
                      photoUri={dogPhotoUri}
                      dogName={dogName}
                      size={AVATAR}
                    />
                  </View>
                </LinearGradient>
              ) : (
                <View
                  style={[styles.ringFlat, hasStories && styles.ringSeen]}
                  pointerEvents="none"
                >
                  <DogAvatar
                    photoUri={dogPhotoUri}
                    dogName={dogName}
                    size={AVATAR}
                  />
                </View>
              )}
            </Pressable>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Aggiungi una storia"
              onPress={openChooser}
              disabled={isBusy}
              hitSlop={10}
              style={styles.badgePlus}
            >
              {isBusy ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <Ionicons name="add" size={16} color="#FFFFFF" />
              )}
            </Pressable>
          </View>
          <Text style={styles.label} numberOfLines={1}>
            La tua storia
          </Text>
        </View>
      </View>

      {chooserOpen ? (
        <View style={styles.chooser}>
          <Text style={styles.chooserTitle}>Aggiungi alla storia</Text>
          <View style={styles.chooserRow}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Scatta con la fotocamera"
              onPress={runCamera}
              disabled={isBusy}
              style={({ pressed }) => [
                styles.chooserBtn,
                pressed && styles.pressed,
              ]}
            >
              <Ionicons name="camera-outline" size={18} color={colors.primary} />
              <Text style={styles.chooserBtnText}>Fotocamera</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Scegli dalla galleria"
              onPress={runGallery}
              disabled={isBusy}
              style={({ pressed }) => [
                styles.chooserBtn,
                pressed && styles.pressed,
              ]}
            >
              <Ionicons name="images-outline" size={18} color={colors.primary} />
              <Text style={styles.chooserBtnText}>Galleria</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Annulla"
              onPress={() => setChooserOpen(false)}
              style={({ pressed }) => [
                styles.chooserCancel,
                pressed && styles.pressed,
              ]}
            >
              <Text style={styles.chooserCancelText}>Annulla</Text>
            </Pressable>
          </View>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.sm },
  row: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    flexDirection: 'row',
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
  ringPress: {
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
    zIndex: 2,
    width: 28,
    height: 28,
    borderRadius: 14,
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
  chooser: {
    marginHorizontal: spacing.lg,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.sm,
  },
  chooserTitle: {
    color: colors.text,
    fontSize: typography.size.sm,
    fontWeight: typography.weight.bold,
  },
  chooserRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    alignItems: 'center',
  },
  chooserBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: 44,
    paddingHorizontal: spacing.md,
    borderRadius: radius.full,
    backgroundColor: colors.primarySoft,
  },
  chooserBtnText: {
    color: colors.primary,
    fontSize: typography.size.sm,
    fontWeight: typography.weight.bold,
  },
  chooserCancel: {
    minHeight: 44,
    paddingHorizontal: spacing.md,
    justifyContent: 'center',
  },
  chooserCancelText: {
    color: colors.textSecondary,
    fontSize: typography.size.sm,
  },
  pressed: { opacity: 0.88 },
});
