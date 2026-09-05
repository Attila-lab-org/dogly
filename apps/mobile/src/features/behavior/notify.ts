/**
 * Notifica locale "risultato pronto" per il flusso behavior.
 * Schedulata quando l'utente lascia la processing screen prima dello stato
 * terminale, cancellata quando l'analisi raggiunge il terminale (o quando
 * l'utente torna a guardare la schermata).
 *
 * Contratto di navigazione: `data.href` viene aperto dal listener generico
 * in app/_layout.tsx (router.push). Nessun import statico di moduli nativi:
 * il file resta caricabile in Jest/node.
 */

const CHANNEL_ID = 'analysis-results';
const RESULT_READY_DELAY_SECONDS = 30;

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

async function ensurePermission(): Promise<boolean> {
  const Notifications = await loadNotifications();
  if (!Notifications) return false;
  try {
    const current = await Notifications.getPermissionsAsync();
    if (current.granted) return true;
    const requested = await Notifications.requestPermissionsAsync();
    return requested.granted;
  } catch {
    return false;
  }
}

/**
 * Schedula la notifica "risultato pronto". Ritorna l'id notifica, oppure
 * null se notifiche non disponibili / permesso negato: il flusso non si
 * interrompe mai per colpa della notifica.
 */
export async function scheduleResultReadyNotification(
  eventId: string,
  dogName: string,
): Promise<string | null> {
  if (!notificationsSupported()) return null;
  const Notifications = await loadNotifications();
  if (!Notifications) return null;
  if (!(await ensurePermission())) return null;

  await cancelResultReadyNotification(eventId);

  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { Platform } = require('react-native') as typeof import('react-native');
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
        name: 'Risultati analisi',
        importance: Notifications.AndroidImportance.HIGH,
      });
    }
    const id = await Notifications.scheduleNotificationAsync({
      content: {
        ...buildResultReadyContent(eventId, dogName),
        sound: 'default',
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
        seconds: RESULT_READY_DELAY_SECONDS,
        repeats: false,
        channelId: Platform.OS === 'android' ? CHANNEL_ID : undefined,
      },
    });
    scheduledByEvent.set(eventId, id);
    return id;
  } catch {
    return null;
  }
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
