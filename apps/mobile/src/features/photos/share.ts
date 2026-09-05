import * as ImagePicker from 'expo-image-picker';
import * as Sharing from 'expo-sharing';
import { Share, Alert, Platform } from 'react-native';
import { PHOTO_COPY } from './copy';
import type { AlbumPhoto, SharePhotoPayload } from './types';

export async function pickAlbumPhoto(): Promise<string | null> {
  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) {
    Alert.alert(
      'Permesso richiesto',
      'Per aggiungere foto all’album serve l’accesso alla galleria.',
    );
    return null;
  }
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    quality: 0.85,
    allowsEditing: true,
    aspect: [1, 1],
  });
  if (result.canceled || !result.assets[0]) {
    return null;
  }
  return result.assets[0].uri;
}

/** Scatto fotocamera per storie. */
export async function takeStoryPhoto(): Promise<string | null> {
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
    quality: 0.85,
    allowsEditing: true,
    aspect: [1, 1],
  });
  if (result.canceled || !result.assets[0]) {
    return null;
  }
  return result.assets[0].uri;
}

export async function pickAvatarPhoto(): Promise<string | null> {
  return pickAlbumPhoto();
}

export async function sharePhoto(
  photo: AlbumPhoto,
  dogName: string,
): Promise<void> {
  Alert.alert('Condividi', PHOTO_COPY.shareConfirm, [
    { text: 'Annulla', style: 'cancel' },
    {
      text: 'Continua',
      onPress: async () => {
        const payload: SharePhotoPayload = {
          title: `${dogName} su Dogly`,
          message: photo.caption
            ? `${photo.caption} — ${dogName} su Dogly`
            : `Un momento di ${dogName} su Dogly`,
        };
        try {
          if (Platform.OS !== 'web' && (await Sharing.isAvailableAsync())) {
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
        } catch {
          Alert.alert('Condivisione non riuscita', 'Riprova tra poco.');
        }
      },
    },
  ]);
}

export async function shareTextCard(payload: SharePhotoPayload): Promise<void> {
  await Share.share({
    title: payload.title,
    message: payload.url
      ? `${payload.message}\n${payload.url}`
      : payload.message,
  });
}
