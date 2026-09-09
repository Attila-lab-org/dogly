/**
 * Notifica locale "risultato pronto" per il flusso behavior.
 * Non usa più un timer da 30s: il risultato arriva dal worker via push
 * (behavior_result_notification). Le funzioni restano per cancellare
 * eventuali notifiche residue e per i test.
 */

const CHANNEL_ID = 'analysis-results';

const scheduledByEvent = new Map<string, string>();

export type ResultReadyContent = {
  title: string;
  body: string;
  data: { href: string };
};

/** Payload della card notifica (sanitizzato: solo testo + deep link). */
export function buildResultReadyContent(
  eventId: string,
  dogName: string,
): ResultReadyContent {
  return {
    title: `Il risultato di ${dogName} è pronto`,
    body: `Ho finito di osservare ${dogName}: apri per scoprire cosa ti sta comunicando.`,
    data: { href: `/behavior/result/${eventId}` },
  };
}

function notificationsSupported(): boolean {
  try {
    if (typeof __DEV__ !== 'undefined' && __DEV__) return false;
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { Platform } = require('react-native') as typeof import('react-native');
    if (Platform.OS === 'web') return false;
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Constants = require('expo-constants') as typeof import('expo-constants');
    return (
      Constants.default.appOwnership !== 'expo' &&
      Constants.default.executionEnvironment !==
        Constants.ExecutionEnvironment.StoreClient
    );
  } catch {
    return false;
  }
}

async function loadNotifications() {
  try {
    return await import('expo-notifications');
  } catch {
    return null;
  }
}

/**
 * Non schedula più un timer locale: il worker notifica a completamento.
 * Mantenuta per compatibilità con la processing screen.
 */
export async function scheduleResultReadyNotification(
  _eventId: string,
  _dogName: string,
): Promise<string | null> {
  void CHANNEL_ID;
  return null;
}

/** Cancella la notifica pendente per l'evento (completamento o rientro). */
export async function cancelResultReadyNotification(
  eventId: string,
): Promise<void> {
  const id = scheduledByEvent.get(eventId);
  scheduledByEvent.delete(eventId);
  if (!id || !notificationsSupported()) return;
  const Notifications = await loadNotifications();
  if (!Notifications) return;
  try {
    await Notifications.cancelScheduledNotificationAsync(id);
  } catch {
    // già consegnata o cancellata
  }
}
