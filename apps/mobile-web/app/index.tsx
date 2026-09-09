import React from 'react';
import { ActivityIndicator, View } from 'react-native';
import { Redirect } from 'expo-router';
import { useSession } from '@/features/auth/SessionProvider';
import {
  consumePendingNotificationHref,
  usePendingNotificationHref,
} from '@/features/home/notificationLinks';
import { colors } from '@/theme/tokens';

/**
 * Entry point con auth gate (Spec V1 sez. 7.1):
 * sessione Supabase reale + GET /v1/dogs; mock solo se __DEV__ senza env.
 *
 * Deep link da notifica (cold-start): se l'app è stata aperta da una
 * notifica e la sessione è authenticated-with-dog, navighiamo all'href
 * della notifica invece che all'entry route di default.
 */
export default function Index() {
  const { loading, entryRoute, sessionState } = useSession();
  const pendingHref = usePendingNotificationHref();

  if (loading) {
    return (
      <View
        style={{
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: colors.background,
        }}
      >
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  // Cold-start da notifica: consuma l'href pending solo se l'utente è
  // autenticato con un cane (le schermate di dettaglio richiedono il cane).
  if (pendingHref && sessionState === 'authenticated-with-dog') {
    const href = consumePendingNotificationHref();
    if (href) return <Redirect href={href as never} />;
  } else if (pendingHref) {
    // Sessione non idonea (es. onboarding/welcome): scarta l'href pending,
    // l'utente verrà instradato sul flusso auth/onboarding normale.
    consumePendingNotificationHref();
  }

  return <Redirect href={entryRoute} />;
}
