/**
 * Ingresso digestione: chat-first. La landing tips non è più prodotto —
 * si parla in Ask e la foto parte dal CTA in conversazione.
 */
import { useEffect } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { colors } from '@/theme/tokens';

export default function DigestiveOverviewScreen() {
  const router = useRouter();

  useEffect(() => {
    router.replace({
      pathname: '/ask',
      params: { intent: 'digest' },
    } as never);
  }, [router]);

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
