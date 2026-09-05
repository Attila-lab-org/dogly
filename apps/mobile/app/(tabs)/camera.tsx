/**
 * Tab Fotocamera — scatta o sceglie una foto per la storia.
 * Diario resta raggiungibile dalla Home (non è più tab primaria).
 */
import React, { useState } from 'react';
import { Alert, Image, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Button, ScreenContainer } from '@/components';
import { colors, radius, spacing, typography } from '@/theme/tokens';
import { takeStoryPhoto, pickAlbumPhoto } from '@/features/photos/share';
import { useDogProfile } from '@/features/core/useDogProfile';
import { addStory } from '@/features/stories/data';

export default function CameraTabScreen() {
  const router = useRouter();
  const { dog } = useDogProfile();
  const [previewUri, setPreviewUri] = useState<string | null>(null);
  const [busy, setBusy] = useState<'camera' | 'gallery' | null>(null);

  const publishStory = (uri: string) => {
    addStory({
      dogId: dog.id,
      dogName: dog.name,
      photoUri: uri,
      caption: `Storia di ${dog.name}`,
    });
    setPreviewUri(null);
    router.replace('/(tabs)/home');
    Alert.alert('Storia aggiunta', 'La trovi nei cerchi in alto nella Home.');
  };

  const fromCamera = async () => {
    setBusy('camera');
    try {
      const uri = await takeStoryPhoto();
      if (uri) setPreviewUri(uri);
    } finally {
      setBusy(null);
    }
  };

  const fromGallery = async () => {
    setBusy('gallery');
    try {
      const uri = await pickAlbumPhoto();
      if (uri) setPreviewUri(uri);
    } finally {
      setBusy(null);
    }
  };

  return (
    <ScreenContainer contentStyle={styles.screen}>
      <View style={styles.header}>
        <Ionicons name="camera" size={28} color={colors.primary} />
        <Text style={styles.title}>Nuova storia</Text>
        <Text style={styles.subtitle}>
          Scatta o scegli una foto di {dog.name}. Sarà visibile nella tua storia
          per 24 ore.
        </Text>
      </View>

      {previewUri ? (
        <View style={styles.previewBlock}>
          <Image source={{ uri: previewUri }} style={styles.preview} />
          <Button
            title="Aggiungi alla storia"
            onPress={() => publishStory(previewUri)}
            testID="story-publish"
          />
          <Button
            title="Scarta"
            variant="outline"
            onPress={() => setPreviewUri(null)}
          />
        </View>
      ) : (
        <View style={styles.actions}>
          <Button
            title="Scatta con la fotocamera"
            loading={busy === 'camera'}
            disabled={busy !== null}
            onPress={fromCamera}
            icon={
              <Ionicons name="camera" size={20} color={colors.textOnPrimary} />
            }
            testID="story-camera"
          />
          <Button
            title="Scegli dalla galleria"
            variant="outline"
            loading={busy === 'gallery'}
            disabled={busy !== null}
            onPress={fromGallery}
            icon={
              <Ionicons name="images-outline" size={18} color={colors.accent} />
            }
            testID="story-gallery"
          />
        </View>
      )}
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    justifyContent: 'center',
  },
  header: {
    alignItems: 'center',
    marginBottom: spacing.xxl,
    gap: spacing.sm,
  },
  title: {
    fontSize: typography.size.xxl,
    fontWeight: typography.weight.bold,
    color: colors.text,
  },
  subtitle: {
    fontSize: typography.size.md,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: typography.size.md * typography.lineHeight.relaxed,
    paddingHorizontal: spacing.md,
  },
  actions: {
    gap: spacing.md,
  },
  previewBlock: {
    gap: spacing.md,
  },
  preview: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceMuted,
  },
});
