import { Platform } from 'react-native';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import { relativeCareDate } from './date';
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

/**
 * Corpo della notifica: usa la data relativa reale (Oggi/Domani/Tra N giorni)
 * invece di "Domani" hardcodato, così è coerente con qualsiasi
 * reminderMinutesBefore (es. 60 min → "Oggi alle 10:00").
 */
function buildReminderBody(event: CareEvent, dogName: string): string {
  const when = relativeCareDate(event.scheduledAt);
  const time = event.allDay
    ? ''
    : ` alle ${new Date(event.scheduledAt).toLocaleTimeString('it-IT', {
        hour: '2-digit',
        minute: '2-digit',
      })}`;
  const title = event.title.toLocaleLowerCase('it');
  return `${when}${time}: ${title} per ${dogName}.`;
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

  return Notifications.scheduleNotificationAsync({
    content: {
      title: `Agenda di ${dogName}`,
      body: buildReminderBody(event, dogName),
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

/**
 * Cancella TUTTE le notifiche schedulate dall'app. Sicuro perché care è
 * l'unico scheduler locale (behavior/notify.ts è un no-op di compatibilità).
 * Usato al logout e prima del reschedule su idratazione, per eliminare
 * i promemoria "fantasma" di eventi completati/eliminati di cui non abbiamo
 * più il notificationId dopo un riavvio.
 */
export async function cancelAllCareReminders(): Promise<void> {
  if (!notificationsAvailable) return;
  const Notifications = await loadNotifications();
  if (!Notifications) return;
  await Notifications.cancelAllScheduledNotificationsAsync();
}

/**
 * Re-schedula i promemoria per gli eventi SCHEDULEED con reminder attivo.
 * Da chiamare dopo aver (ri)caricato gli eventi dal backend: garantisce che
 * ogni evento abbia esattamente un promemoria, indipendentemente dal
 * notificationId (perso al riavvio). Il chiamante deve aver già fatto
 * cancelAllCareReminders() per evitare duplicati.
 */
export async function rescheduleCareReminders(
  events: CareEvent[],
  dogName: string,
): Promise<void> {
  if (!notificationsAvailable) return;
  for (const event of events) {
    if (event.status !== 'SCHEDULED' || !event.reminderEnabled) continue;
    await scheduleCareReminder(event, dogName);
  }
}

async function loadNotifications() {
  try {
    return await import('expo-notifications');
  } catch {
    return null;
  }
}
