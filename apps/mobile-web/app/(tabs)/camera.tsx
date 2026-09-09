/**
 * Tab Fotocamera — scatta o sceglie una foto per la storia.
 * Diario resta raggiungibile dalla Home (non è più tab primaria).
 */
import React, { useState } from 'react';
import { Alert, Image, StyleSheet, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Button, ScreenContainer } from '@/components';
import { colors, radius, spacing, typography } from '@/theme/tokens';
import { takeStoryPhoto, pickAlbumPhoto } from '@/features/photos/share';
import { useDogProfile } from '@/features/core/useDogProfile';
import { publishStory } from '@/features/stories/data';
import { useSession } from '@/features/auth/SessionProvider';
import { isPersistedId } from '@/lib/persistedId';

export default function CameraTabScreen() {
  const router = useRouter();
  const { dog } = useDogProfile();
  const { usingMockGate } = useSession();
  const [previewUri, setPreviewUri] = useState<string | null>(null);
  const [caption, setCaption] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<
    'camera' | 'gallery' | 'publishing' | null
  >(null);

  const saveStory = async (uri: string) => {
    if (!usingMockGate && !isPersistedId(dog.id)) {
      setError('Il profilo del cane non è ancora pronto. Attendi e riprova.');
      return;
    }
    setBusy('publishing');
    setError(null);
    try {
      await publishStory({
        dogId: dog.id,
        dogName: dog.name,
        photoUri: uri,
        caption: caption.trim() || `Storia di ${dog.name}`,
        mockGate: usingMockGate,
      });
      setPreviewUri(null);
      setCaption('');
      router.replace('/(tabs)/home');
      Alert.alert(
        'Storia aggiunta',
        'È stata salvata e resterà nella Home per 24 ore.',
      );
    } catch {
      setError(
        'Non sono riuscito a pubblicare la storia. La foto resta qui: puoi riprovare.',
      );
      Alert.alert(
        'Storia non salvata',
        'Controlla la connessione e riprova. La foto non è stata pubblicata.',
      );
    } finally {
      setBusy(null);
    }
  };

  const fromCamera = async () => {
    setBusy('camera');
    setError(null);
    try {
      const uri = await takeStoryPhoto();
      if (uri) setPreviewUri(uri);
    } catch {
      setError('Non sono riuscito ad aprire la fotocamera. Riprova.');
    } finally {
      setBusy(null);
    }
  };

  const fromGallery = async () => {
    setBusy('gallery');
    setError(null);
    try {
      const uri = await pickAlbumPhoto();
      if (uri) setPreviewUri(uri);
    } catch {
      setError('Non sono riuscito ad aprire la galleria. Riprova.');
    } finally {
      setBusy(null);
    }
  };

  return (
    <ScreenContainer scroll contentStyle={styles.screen}>
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
          <TextInput
            accessibilityLabel="Didascalia della storia"
            value={caption}
            onChangeText={setCaption}
            placeholder={`Scrivi qualcosa su ${dog.name}…`}
            placeholderTextColor={colors.textMuted}
            maxLength={180}
            style={styles.caption}
          />
          <Button
            title={busy === 'publishing' ? 'Pubblicazione…' : 'Pubblica la storia'}
            onPress={() => void saveStory(previewUri)}
            loading={busy === 'publishing'}
            disabled={
              busy !== null || (!usingMockGate && !isPersistedId(dog.id))
            }
            testID="story-publish"
          />
          <Button
            title="Scarta"
            variant="outline"
            disabled={busy === 'publishing'}
            onPress={() => {
              setPreviewUri(null);
              setCaption('');
              setError(null);
            }}
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
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  screen: {
    flexGrow: 1,
    paddingBottom: spacing.xxxl,
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
    aspectRatio: 4 / 3,
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceMuted,
  },
  caption: {
    minHeight: 52,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    color: colors.text,
    fontSize: typography.size.md,
  },
  error: {
    color: colors.danger,
    fontSize: typography.size.sm,
    lineHeight: typography.size.sm * typography.lineHeight.relaxed,
    textAlign: 'center',
  },
});
