import React from 'react';
import { ActivityIndicator, View } from 'react-native';
import { Redirect } from 'expo-router';
import { useSession } from '@/features/auth/SessionProvider';
import { colors } from '@/theme/tokens';

/**
 * Entry point con auth gate (Spec V1 sez. 7.1):
 * sessione Supabase reale + GET /v1/dogs; mock solo se __DEV__ senza env.
 */
export default function Index() {
  const { loading, entryRoute } = useSession();

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

  return <Redirect href={entryRoute} />;
}
