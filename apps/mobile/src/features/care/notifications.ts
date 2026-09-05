import { Platform } from 'react-native';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import type { CareEvent } from './types';

const CHANNEL_ID = 'care-reminders';
const isExpoGo =
  Constants.appOwnership === 'expo' ||
  Constants.executionEnvironment === ExecutionEnvironment.StoreClient;
const notificationsAvailable =
  !__DEV__ && Platform.OS !== 'web' && !isExpoGo;

export function careNotificationsSupported(): boolean {
  return notificationsAvailable;
}

export async function configureCareNotifications() {
  if (!notificationsAvailable) return;
  const Notifications = await loadNotifications();
  if (!Notifications) return;
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
}

async function ensurePermission(): Promise<boolean> {
  if (!notificationsAvailable) return false;
  const Notifications = await loadNotifications();
  if (!Notifications) return false;

  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return true;

  const requested = await Notifications.requestPermissionsAsync();
  return requested.granted;
}

async function ensureAndroidChannel() {
  if (!notificationsAvailable || Platform.OS !== 'android') return;
  const Notifications = await loadNotifications();
  if (!Notifications) return;
  await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
    name: 'Agenda di salute',
    importance: Notifications.AndroidImportance.HIGH,
  });
}

export async function scheduleCareReminder(
  event: CareEvent,
  dogName: string,
): Promise<string | null> {
  if (!event.reminderEnabled || !notificationsAvailable) return null;
  const Notifications = await loadNotifications();
  if (!Notifications) return null;
  const reminderAt = new Date(
    Date.parse(event.scheduledAt) - event.reminderMinutesBefore * 60_000,
  );
  if (reminderAt.getTime() <= Date.now()) return null;
  if (!(await ensurePermission())) return null;

  await ensureAndroidChannel();
  const time = event.allDay
    ? ''
    : ` alle ${new Date(event.scheduledAt).toLocaleTimeString('it-IT', {
        hour: '2-digit',
        minute: '2-digit',
      })}`;

  return Notifications.scheduleNotificationAsync({
    content: {
      title: `Agenda di ${dogName}`,
      body: `Domani${time}: ${event.title.toLocaleLowerCase('it')} per ${dogName}.`,
      data: { href: `/care/${event.id}` },
      sound: 'default',
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date: reminderAt,
      channelId: Platform.OS === 'android' ? CHANNEL_ID : undefined,
    },
  });
}

export async function cancelCareReminder(notificationId: string | null) {
  if (!notificationId || !notificationsAvailable) return;
  const Notifications = await loadNotifications();
  if (!Notifications) return;
  await Notifications.cancelScheduledNotificationAsync(notificationId);
}

export async function subscribeToCareNotificationResponses(
  onOpen: (href: string) => void,
): Promise<() => void> {
  if (!notificationsAvailable) return () => {};
  const Notifications = await loadNotifications();
  if (!Notifications) return () => {};

  const subscription =
    Notifications.addNotificationResponseReceivedListener((response) => {
      const href = response.notification.request.content.data?.href;
      if (typeof href === 'string' && href.startsWith('/care/')) onOpen(href);
    });
  return () => subscription.remove();
}

async function loadNotifications() {
  try {
    return await import('expo-notifications');
  } catch {
    return null;
  }
}
