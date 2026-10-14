/**
 * Deep link legacy al dettaglio diario → chat-first: Apri Ask sull'episodio.
 */
import { useEffect } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { colors } from '@/theme/tokens';

export default function DiaryEventScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    eventId?: string | string[];
    domain?: string | string[];
  }>();
  const eventId = Array.isArray(params.eventId) ? params.eventId[0] : params.eventId;
  const domain = Array.isArray(params.domain) ? params.domain[0] : params.domain;

  useEffect(() => {
    if (!eventId) {
      router.replace('/(tabs)/diary' as never);
      return;
    }
    router.replace({
      pathname: '/ask',
      params: {
        eventId,
        source: domain === 'DIGESTIVE' ? 'digestive' : 'behavior',
        intent: 'revisit',
      },
    } as never);
  }, [domain, eventId, router]);

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
