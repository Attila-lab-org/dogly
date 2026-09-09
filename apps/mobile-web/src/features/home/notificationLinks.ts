/**
 * Deep link dalle notifiche locali/push: ogni notifica dell'app porta
 * `data.href` (contratto condiviso, es. '/care/<id>' per i reminder agenda
 * e '/behavior/result/<id>' per "risultato pronto"). Qui registriamo UN
 * listener generico che valida l'href e lo consegna al router.
 *
 * Cold-start (app aperta da notifica): su Android il tap può essere consumato
 * prima della registrazione del listener, quindi integriamo anche
 * getLastNotificationResponseAsync(). L'href di cold-start viene accodato
 * in `pendingNotificationHref` e consumato dal gate auth (app/index.tsx)
 * dopo il settle della sessione, per evitare il race col Redirect di entry.
 *
 * Stessa guardia di features/care/notifications: in __DEV__ / Expo Go / web
 * le notifiche non sono disponibili, quindi il listener è un no-op.
 */
import { Platform } from 'react-native';
import { useSyncExternalStore } from 'react';
import Constants, { ExecutionEnvironment } from 'expo-constants';

const isExpoGo =
  Constants.appOwnership === 'expo' ||
  Constants.executionEnvironment === ExecutionEnvironment.StoreClient;
const notificationsAvailable =
  !__DEV__ && Platform.OS !== 'web' && !isExpoGo;

// --- Store reattivo per l'href di cold-start (consumato dal gate auth) ---
let pendingHref: string | null = null;
const hrefListeners = new Set<() => void>();

function subscribeHref(listener: () => void): () => void {
  hrefListeners.add(listener);
  return () => hrefListeners.delete(listener);
}

function notifyHref(): void {
  hrefListeners.forEach((l) => l());
}

function getHrefSnapshot(): string | null {
  return pendingHref;
}

/** Accoda un href da navigare dopo il settle dell'auth gate (cold-start). */
export function setPendingNotificationHref(href: string | null): void {
  if (pendingHref === href) return;
  pendingHref = href;
  notifyHref();
}

/** Legge e consuma l'href pending (cold-start). */
export function consumePendingNotificationHref(): string | null {
  const href = pendingHref;
  if (href !== null) {
    pendingHref = null;
    notifyHref();
  }
  return href;
}

/** Hook reattivo: restituisce l'href pending senza consumarlo. */
export function usePendingNotificationHref(): string | null {
  return useSyncExternalStore(subscribeHref, getHrefSnapshot, getHrefSnapshot);
}

// Traccia l'ultimo response gestito per evitare doppi handling
// (listener + getLastNotificationResponseAsync possono consegnare lo stesso).
let lastHandledIdentifier: string | undefined;

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
          const id = response.notification.request.identifier;
          if (id && id === lastHandledIdentifier) return;
          lastHandledIdentifier = id;
          const href = response.notification.request.content.data?.href;
          if (typeof href === 'string' && href.startsWith('/')) onHref(href);
        },
      );
      // Cold-start: il tap che ha lanciato l'app può non essere consegnato
      // al listener (soprattutto Android). Lo recuperiamo qui.
      void Notifications.getLastNotificationResponseAsync().then((response) => {
        if (cancelled || !response) return;
        const id = response.notification.request.identifier;
        if (id && id === lastHandledIdentifier) return;
        lastHandledIdentifier = id;
        const href = response.notification.request.content.data?.href;
        if (typeof href === 'string' && href.startsWith('/')) onHref(href);
      });
    })
    .catch(() => {});

  return () => {
    cancelled = true;
    subscription?.remove();
  };
}
