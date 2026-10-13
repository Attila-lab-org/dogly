import * as ImagePicker from 'expo-image-picker';
import { Alert, Platform } from 'react-native';
import { rememberWebClipBlob } from '../../lib/webClipBlob';
import { pickWebVideo } from './webVideoPicker';
import { videoContentTypeFromUri, type VideoContentType } from './videoContentType';

export type PickedConversationVideo = {
  uri: string;
  durationMs: number;
  hasAudio: boolean;
  contentType: VideoContentType;
};

const MIN_VIDEO_MS = 5_000;
const MAX_VIDEO_MS = 20_000;

function validateDuration(durationMs: number): PickedConversationVideo | null {
  if (durationMs < MIN_VIDEO_MS) {
    Alert.alert('Video troppo breve', 'Scegli un video di almeno 5 secondi.');
    return null;
  }
  if (durationMs > MAX_VIDEO_MS) {
    Alert.alert('Video troppo lungo', 'Scegli un video di massimo 20 secondi.');
    return null;
  }
  return null;
}

export async function pickConversationVideo(): Promise<PickedConversationVideo | null> {
  if (Platform.OS === 'web') {
    const picked = await pickWebVideo();
    if (!picked) return null;
    if (picked.durationMs < MIN_VIDEO_MS || picked.durationMs > MAX_VIDEO_MS) {
      validateDuration(picked.durationMs);
      return null;
    }
    rememberWebClipBlob(picked.uri, picked.blob);
    return {
      uri: picked.uri,
      durationMs: picked.durationMs,
      hasAudio: true,
      contentType: videoContentTypeFromUri(picked.uri, picked.mimeType),
    };
  }

  try {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Permesso richiesto', 'Per scegliere un video serve l’accesso alla galleria.');
      return null;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['videos'],
      allowsEditing: false,
      quality: 1,
    });
    const asset = result.canceled ? null : result.assets[0];
    if (!asset?.uri) return null;
    const durationMs = typeof asset.duration === 'number' ? asset.duration : 0;
    if (durationMs < MIN_VIDEO_MS || durationMs > MAX_VIDEO_MS) {
      validateDuration(durationMs || MAX_VIDEO_MS + 1);
      return null;
    }
    return {
      uri: asset.uri,
      durationMs,
      hasAudio: true,
      contentType: videoContentTypeFromUri(asset.uri, asset.mimeType),
    };
  } catch {
    Alert.alert('Video non disponibile', 'Non sono riuscito ad aprire la galleria. Riprova.');
    return null;
  }
}
