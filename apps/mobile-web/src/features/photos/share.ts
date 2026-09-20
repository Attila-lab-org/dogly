import * as ImagePicker from 'expo-image-picker';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import * as Sharing from 'expo-sharing';
import { Share, Alert, Image, Platform } from 'react-native';
import type { AlbumPhoto, SharePhotoPayload } from './types';
import { pickWebImage } from './webPickImage';

const MAX_IMAGE_DIMENSION = 2000;
const IMAGE_COMPRESSION = 0.82;

async function prepareNativeImage(uri: string): Promise<string> {
  const { width, height } = await new Promise<{ width: number; height: number }>((resolve, reject) =>
    Image.getSize(uri, (nextWidth, nextHeight) => resolve({ width: nextWidth, height: nextHeight }), reject),
  );
  const scale = Math.min(1, MAX_IMAGE_DIMENSION / Math.max(width, height));
  if (scale === 1) return uri;
  const result = await manipulateAsync(
    uri,
    [{ resize: { width: Math.round(width * scale), height: Math.round(height * scale) } }],
    { compress: IMAGE_COMPRESSION, format: SaveFormat.JPEG },
  );
  return result.uri;
}

export async function pickAlbumPhoto(): Promise<string | null> {
  if (Platform.OS === 'web') {
    const picked = await pickWebImage();
    return picked?.uri ?? null;
  }
  // Android usa il Photo Picker di sistema e non richiede accesso generale
  // alla libreria. Chiedere prima il permesso può bloccare definitivamente la
  // selezione dopo un rifiuto, senza neppure aprire il picker.
  if (Platform.OS !== 'android') {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert(
        'Permesso richiesto',
        'Per aggiungere foto serve l’accesso alla galleria.',
      );
      return null;
    }
  }
  try {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: IMAGE_COMPRESSION,
      allowsEditing: false,
    });
    if (result.canceled || !result.assets[0]) {
      return null;
    }
    return prepareNativeImage(result.assets[0].uri);
  } catch {
    Alert.alert(
      'Galleria non disponibile',
      'Non sono riuscito ad aprire le foto del telefono.',
    );
    return null;
  }
}

/** Scatto fotocamera per storie. */
export async function takeStoryPhoto(): Promise<string | null> {
  if (Platform.OS === 'web') {
    const picked = await pickWebImage({ capture: true });
    return picked?.uri ?? null;
  }
  const permission = await ImagePicker.requestCameraPermissionsAsync();
  if (!permission.granted) {
    Alert.alert(
      'Serve la fotocamera',
      'Per pubblicare una storia abilita la fotocamera.',
    );
    return null;
  }
  const result = await ImagePicker.launchCameraAsync({
    mediaTypes: ['images'],
    quality: IMAGE_COMPRESSION,
    allowsEditing: true,
    aspect: [1, 1],
  });
  if (result.canceled || !result.assets[0]) {
    return null;
  }
  return prepareNativeImage(result.assets[0].uri);
}

export async function pickAvatarPhoto(): Promise<string | null> {
  return pickAlbumPhoto();
}

export async function sharePhoto(
  photo: AlbumPhoto,
  dogName: string,
): Promise<void> {
  const payload: SharePhotoPayload = {
    title: `${dogName} su Dogly`,
    message: photo.caption
      ? `${photo.caption} — ${dogName} su Dogly`
      : `Un momento di ${dogName} su Dogly`,
  };
  try {
    if (Platform.OS === 'web') {
      const webNavigator = globalThis.navigator as Navigator & {
        canShare?: (data: ShareData) => boolean;
        share?: (data: ShareData) => Promise<void>;
      };
      if (webNavigator.share) {
        const response = await fetch(photo.localUri);
        const blob = await response.blob();
        const file = new File([blob], `${dogName}-dogly.jpg`, {
          type: blob.type || 'image/jpeg',
        });
        const data: ShareData = {
          title: payload.title,
          text: payload.message,
          files: [file],
        };
        if (!webNavigator.canShare || webNavigator.canShare(data)) {
          await webNavigator.share(data);
          return;
        }
        await webNavigator.share({
          title: payload.title,
          text: payload.message,
          url: photo.localUri,
        });
        return;
      }
      await webNavigator.clipboard.writeText(
        `${payload.message}\n${photo.localUri}`,
      );
      Alert.alert('Link copiato', 'Ora puoi incollarlo dove preferisci.');
      return;
    }
    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(photo.localUri, {
        dialogTitle: payload.title,
        mimeType: 'image/jpeg',
      });
      return;
    }
    await Share.share({
      title: payload.title,
      message: payload.message,
      url: photo.localUri,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') return;
    Alert.alert('Condivisione non riuscita', 'Riprova tra poco.');
  }
}

export async function shareTextCard(payload: SharePhotoPayload): Promise<void> {
  await Share.share({
    title: payload.title,
    message: payload.url
      ? `${payload.message}\n${payload.url}`
      : payload.message,
  });
}
