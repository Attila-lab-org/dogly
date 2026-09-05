/**
 * Deep link dalle notifiche locali/push: ogni notifica dell'app porta
 * `data.href` (contratto condiviso, es. '/care/<id>' per i reminder agenda
 * e '/behavior/result/<id>' per "risultato pronto"). Qui registriamo UN
 * listener generico che valida l'href e lo consegna al router.
 *
 * Stessa guardia di features/care/notifications: in __DEV__ / Expo Go / web
 * le notifiche non sono disponibili, quindi il listener è un no-op
 * (mock gate invariato, niente scheduling in dev).
 */
import { Platform } from 'react-native';
import Constants, { ExecutionEnvironment } from 'expo-constants';

const isExpoGo =
  Constants.appOwnership === 'expo' ||
  Constants.executionEnvironment === ExecutionEnvironment.StoreClient;
const notificationsAvailable =
  !__DEV__ && Platform.OS !== 'web' && !isExpoGo;

export function registerNotificationResponseHandler(
  onHref: (href: string) => void,
): () => void {
  if (!notificationsAvailable) return () => {};

  let subscription: { remove: () => void } | null = null;
  let cancelled = false;

  void import('expo-notifications')
    .then((Notifications) => {
      if (cancelled) return;
      subscription = Notifications.addNotificationResponseReceivedListener(
        (response) => {
          const href = response.notification.request.content.data?.href;
          if (typeof href === 'string' && href.startsWith('/')) onHref(href);
        },
      );
    })
    .catch(() => {});

  return () => {
    cancelled = true;
    subscription?.remove();
  };
}
