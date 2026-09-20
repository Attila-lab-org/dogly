import { Alert, Platform } from 'react-native';

export function confirmDestructiveAction(
  title: string,
  message: string,
  onConfirm: () => void,
): void {
  if (Platform.OS === 'web') {
    if (globalThis.confirm(`${title}\n\n${message}`)) onConfirm();
    return;
  }

  Alert.alert(title, message, [
    { text: 'Annulla', style: 'cancel' },
    { text: 'Elimina', style: 'destructive', onPress: onConfirm },
  ]);
}

export function confirmPublicProfile(onConfirm: () => void): void {
  const title = 'Profilo pubblico';
  const message =
    'Verranno mostrati solo i campi consentiti. Puoi revocare il consenso in qualsiasi momento.';
  if (Platform.OS === 'web') {
    if (globalThis.confirm(`${title}\n\n${message}`)) onConfirm();
    return;
  }
  Alert.alert(title, message, [
    { text: 'Annulla', style: 'cancel' },
    { text: 'Confermo', onPress: onConfirm },
  ]);
}
