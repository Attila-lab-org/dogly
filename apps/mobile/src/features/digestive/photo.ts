import * as ImagePicker from 'expo-image-picker';
import { Alert } from 'react-native';

/** Apre la fotocamera solo dopo un gesto esplicito dell’utente. */
export async function takeDigestivePhoto(): Promise<string | null> {
  const permission = await ImagePicker.requestCameraPermissionsAsync();
  if (!permission.granted) {
    Alert.alert(
      'Serve la fotocamera',
      'Abilita la fotocamera per scattare la foto.',
    );
    return null;
  }

  const result = await ImagePicker.launchCameraAsync({
    mediaTypes: ['images'],
    quality: 0.9,
    allowsEditing: true,
    aspect: [4, 3],
  });

  if (result.canceled || !result.assets[0]) return null;
  return result.assets[0].uri;
}
