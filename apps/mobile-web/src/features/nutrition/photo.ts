import * as ImagePicker from 'expo-image-picker';
import { Alert, Platform } from 'react-native';

import { pickWebImage } from '../photos/webPickImage';

export async function takeFoodLabelPhoto(): Promise<string | null> {
  if (Platform.OS === 'web') {
    const picked = await pickWebImage({ capture: true });
    return picked?.uri ?? null;
  }
  const permission = await ImagePicker.requestCameraPermissionsAsync();
  if (!permission.granted) {
    Alert.alert(
      'Serve la fotocamera',
      'Abilita la fotocamera per fotografare l’etichetta.',
    );
    return null;
  }
  const result = await ImagePicker.launchCameraAsync({
    mediaTypes: ['images'],
    quality: 1,
    allowsEditing: false,
  });
  return result.canceled ? null : (result.assets[0]?.uri ?? null);
}
