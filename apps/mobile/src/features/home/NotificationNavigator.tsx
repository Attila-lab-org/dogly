/**
 * Collega le notifiche alla navigazione, tenendo conto dello stato sessione.
 * Va montato DENTRO SessionProvider (usa useSession) e dentro il router.
 *
 * - Warm-start (app già attiva, sessione pronta): router.push(href) immediato.
 * - Cold-start (app appena lanciata, sessione ancora loading): accoda l'href
 *   in pendingNotificationHref; sarà consumato dal gate auth (app/index.tsx)
 *   dopo il settle, evitando il race col Redirect di entry route.
 */
import { useEffect } from 'react';
import { useRouter } from 'expo-router';
import { useSession } from '@/features/auth/SessionProvider';
import {
  registerNotificationResponseHandler,
  setPendingNotificationHref,
} from './notificationLinks';

export function NotificationNavigator() {
  const router = useRouter();
  const { loading, sessionState } = useSession();

  useEffect(() => {
    const onHref = (href: string) => {
      if (!loading && sessionState === 'authenticated-with-dog') {
        // App già oltre il gate: naviga subito.
        router.push(href as never);
      } else {
        // Cold-start o sessione non pronta: accoda per il gate auth.
        setPendingNotificationHref(href);
      }
    };
    return registerNotificationResponseHandler(onHref);
  }, [router, loading, sessionState]);

  return null;
}
