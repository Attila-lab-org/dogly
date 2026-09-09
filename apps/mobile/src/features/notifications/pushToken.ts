/**
 * Registra il token Expo sul backend (POST /v1/devices/push-token).
 * Solo se il consenso notifiche è ON e l'app non è Expo Go / web / mock.
 */
import { Platform } from 'react-native';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import { getConsents } from '../privacy/consents';

export async function registerDevicePushToken(): Promise<void> {
  if (!getConsents().notifications) return;
  if (typeof __DEV__ !== 'undefined' && __DEV__) return;
  if (Platform.OS === 'web') return;
  if (
    Constants.appOwnership === 'expo' ||
    Constants.executionEnvironment === ExecutionEnvironment.StoreClient
  ) {
    return;
  }

  try {
    const Notifications = await import('expo-notifications');
    const current = await Notifications.getPermissionsAsync();
    const granted =
      current.granted || (await Notifications.requestPermissionsAsync()).granted;
    if (!granted) return;
    const projectId = Constants.easConfig?.projectId;
    const token = await Notifications.getExpoPushTokenAsync(
      projectId ? { projectId } : undefined,
    );
    const { api } = await import('../../lib/apiClient');
    await api.post(
      '/v1/devices/push-token',
      {
        platform: Platform.OS === 'ios' ? 'ios' : 'android',
        push_token: token.data,
        app_version: Constants.expoConfig?.version ?? '0.1.0',
      },
      { headers: { 'X-Idempotency-Key': `push-${token.data.slice(-24)}` } },
    );
  } catch {
    // Push registration must never block auth or capture.
  }
}
