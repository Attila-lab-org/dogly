/**
 * Legacy digestive result URL → chat-first: Apri Ask sull'episodio.
 */
import { useEffect } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { colors } from '@/theme/tokens';

export default function DigestiveResultScreen() {
  const router = useRouter();
  const { eventId } = useLocalSearchParams<{ eventId: string }>();

  useEffect(() => {
    if (!eventId) {
      router.replace('/(tabs)/diary' as never);
      return;
    }
    router.replace({
      pathname: '/ask',
      params: {
        eventId,
        source: 'digestive',
        intent: 'revisit',
      },
    } as never);
  }, [eventId, router]);

  return (
    <View style={styles.root}>
      <ActivityIndicator color={colors.primary} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
  },
});
