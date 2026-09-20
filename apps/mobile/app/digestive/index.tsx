import React from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { Button, Card, ErrorState, ScreenContainer } from '@/components';
import { StackScreenHeader } from '@/features/secondary/components';
import { useDogProfile } from '@/features/core/useDogProfile';
import { useSession } from '@/features/auth/SessionProvider';
import { getDigestiveSummary, type DigestiveSummary } from '@/features/digestive/api';
import { colors, spacing, typography } from '@/theme/tokens';

function summaryCopy(summary: DigestiveSummary | undefined) {
  if (!summary || summary.data_sufficiency === 'insufficient') return ['Sto ancora imparando', 'Aggiungi qualche osservazione per confrontare la digestione con il suo solito.'];
  if (summary.safety_flags.length > 0 || summary.recent_trend === 'worsening' || summary.recent_trend === 'softer') return [summary.recent_trend === 'softer' ? 'Un po’ più morbida del solito' : 'Da osservare', 'Una nuova osservazione può aiutare a capire se è solo un momento o se continua.'];
  if (summary.recent_trend === 'firmer') return ['Più formata del solito', 'Confronta un altro momento se vuoi capire meglio l’andamento.'];
  if (summary.recent_trend === 'improving') return ['In miglioramento', 'La tendenza recente è più tranquilla rispetto ai momenti precedenti.'];
  return ['Sembra stabile', 'La tendenza recente è simile a quella che DOGly ha già osservato.'];
}

export default function DigestiveOverviewScreen() {
  const router = useRouter();
  const { dog } = useDogProfile();
  const { usingMockGate } = useSession();
  const query = useQuery({ queryKey: ['digestive-summary', dog.id], queryFn: () => getDigestiveSummary(dog.id), enabled: !usingMockGate && Boolean(dog.id) });
  const [title, body] = summaryCopy(query.data);
  return (
    <ScreenContainer scroll contentStyle={styles.content}>
      <StackScreenHeader title={`Digestione di ${dog.name}`} />
      {query.isLoading ? <View style={styles.loading}><ActivityIndicator color={colors.primary} /><Text style={styles.muted}>Controllo gli ultimi momenti…</Text></View> : query.isError ? <ErrorState title="Non riesco a leggere l’andamento" message="Le osservazioni non sono state modificate. Riprova tra poco." onRetry={() => void query.refetch()} /> : <>
        <Card style={styles.hero}><View style={styles.icon}><Ionicons name="leaf-outline" size={26} color={colors.accent} /></View><Text style={styles.title}>{title}</Text><Text style={styles.body}>{body}</Text>{query.data?.safety_flags.length ? <Text style={styles.notice}>Ho trovato un segnale da osservare con più attenzione.</Text> : null}</Card>
        <Button title="Osserva un nuovo momento" onPress={() => router.push('/digestive/capture' as never)} />
        <Button title="Torna al profilo" variant="outline" onPress={() => router.back()} />
        <Text style={styles.footnote}>Una foto è un’osservazione, non una diagnosi. Se qualcosa ti preoccupa, chiedi al veterinario.</Text>
      </>}
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({ content: { gap: spacing.lg, paddingBottom: spacing.xxxl }, loading: { alignItems: 'center', gap: spacing.md, paddingVertical: spacing.xxxl }, muted: { color: colors.textSecondary, fontSize: typography.size.sm }, hero: { alignItems: 'center', padding: spacing.lg }, icon: { width: 58, height: 58, borderRadius: 29, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.accentSoft, marginBottom: spacing.md }, title: { color: colors.text, fontSize: typography.size.xl, fontWeight: typography.weight.bold, textAlign: 'center' }, body: { color: colors.textSecondary, fontSize: typography.size.md, lineHeight: typography.size.md * typography.lineHeight.relaxed, textAlign: 'center', marginTop: spacing.sm }, notice: { color: colors.warning, fontSize: typography.size.sm, textAlign: 'center', marginTop: spacing.md }, footnote: { color: colors.textMuted, fontSize: typography.size.xs, lineHeight: typography.size.xs * typography.lineHeight.relaxed, textAlign: 'center' } });
