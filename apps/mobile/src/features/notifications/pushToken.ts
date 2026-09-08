/**
 * Registra il token Expo sul backend (POST /v1/devices/push-token).
 * Solo se il consenso notifiche è ON e l'app non è Expo Go / web / mock.
 */
import { Platform } from 'react-native';
import { getConsents } from '../privacy/consents';

export async function registerDevicePushToken(): Promise<void> {
  if (!getConsents().notifications) return;
  try {
    if (typeof __DEV__ !== 'undefined' && __DEV__) return;
    const { Platform: RNPlatform } = require('react-native') as typeof import('react-native');
    if (RNPlatform.OS === 'web') return;
    const Constants = require('expo-constants') as typeof import('expo-constants');
    if (
      Constants.default.appOwnership === 'expo' ||
      Constants.default.executionEnvironment ===
        Constants.ExecutionEnvironment.StoreClient
    ) {
      return;
    }
    const Notifications = await import('expo-notifications');
    const current = await Notifications.getPermissionsAsync();
    const granted =
      current.granted || (await Notifications.requestPermissionsAsync()).granted;
    if (!granted) return;
    const projectId = Constants.default.easConfig?.projectId;
    const token = await Notifications.getExpoPushTokenAsync(
      projectId ? { projectId } : undefined,
    );
    const { api } = await import('../../lib/apiClient');
    const { default: ExpoConstants } = await import('expo-constants');
    await api.post(
      '/v1/devices/push-token',
      {
        platform: Platform.OS === 'ios' ? 'ios' : 'android',
        push_token: token.data,
        app_version: ExpoConstants.expoConfig?.version ?? '0.1.0',
      },
      { headers: { 'X-Idempotency-Key': `push-${token.data.slice(-24)}` } },
    );
  } catch {
    // Push registration must never block auth or capture.
  }
}
