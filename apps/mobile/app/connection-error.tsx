import React, { useEffect, useState } from 'react';
import { useRouter } from 'expo-router';
import { ErrorState, ScreenContainer } from '@/components';
import { useSession } from '@/features/auth/SessionProvider';

export default function ConnectionErrorScreen() {
  const router = useRouter();
  const { refreshDogs, sessionState } = useSession();
  const [retrying, setRetrying] = useState(false);

  useEffect(() => {
    if (sessionState === 'authenticated-with-dog') {
      router.replace('/(tabs)/home');
    } else if (sessionState === 'authenticated-no-dog') {
      router.replace('/onboarding/dog');
    } else if (sessionState === 'unauthenticated') {
      router.replace('/(auth)/welcome');
    }
  }, [router, sessionState]);

  const retry = async () => {
    if (retrying) return;
    setRetrying(true);
    try {
      await refreshDogs();
    } finally {
      setRetrying(false);
    }
  };

  return (
    <ScreenContainer>
      <ErrorState
        title="Dogly non riesce a collegarsi"
        message={
          retrying
            ? 'Sto riprovando…'
            : 'Il profilo del tuo cane non è stato modificato. Controlla la connessione e riprova.'
        }
        onRetry={() => void retry()}
      />
    </ScreenContainer>
  );
}
