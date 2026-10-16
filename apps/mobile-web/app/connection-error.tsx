import React, { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { ErrorState, ScreenContainer } from '@/components';
import { DogIllustration } from '@/components/DogIllustration';
import { useSession } from '@/features/auth/SessionProvider';

const styles = StyleSheet.create({
  illustration: { alignItems: 'center', paddingBottom: 8 },
});

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
      <View style={styles.illustration} pointerEvents="none">
        <DogIllustration size={150} mood="thinking" />
      </View>
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
