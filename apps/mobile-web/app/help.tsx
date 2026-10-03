import React from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius, spacing, typography } from '@/theme/tokens';
import { useDogProfile } from '@/features/core/useDogProfile';

export default function HelpScreen() {
  const router = useRouter();
  const { dog } = useDogProfile();
  const openVets = () => {
    const query = encodeURIComponent('veterinario vicino a me');
    void Linking.openURL('https://www.google.com/maps/search/?api=1&query=' + query);
  };
  return <View style={styles.root}><SafeAreaView style={styles.safe}>
    <ScrollView contentContainerStyle={styles.content}>
      <View style={styles.header}><Pressable accessibilityRole="button" accessibilityLabel="Torna indietro" onPress={() => router.back()} style={styles.back}><Ionicons name="chevron-back" size={24} color={colors.text} /></Pressable><View><Text style={styles.eyebrow}>ASSISTENZA</Text><Text style={styles.title}>Ti aiutiamo a fare il passo giusto</Text></View></View>
      <View style={styles.intro}><Ionicons name="heart-outline" size={26} color={colors.primary} /><Text style={styles.introTitle}>DOGly ti aiuta a capire {dog.name}</Text><Text style={styles.introText}>Per sintomi, urgenze o dubbi clinici serve sempre un veterinario reale. Qui trovi il percorso più adatto, senza confusione.</Text></View>
      <Pressable accessibilityRole="button" onPress={() => router.push('/ask' as never)} style={({ pressed }) => [styles.card, pressed && styles.pressed]}><View style={styles.icon}><Ionicons name="chatbubble-ellipses-outline" size={23} color={colors.primary} /></View><View style={styles.copy}><Text style={styles.cardTitle}>Chiedi a DOGly</Text><Text style={styles.cardText}>Per comportamenti, routine e situazioni che vuoi leggere meglio.</Text></View><Ionicons name="chevron-forward" size={18} color={colors.textMuted} /></Pressable>
      <Pressable accessibilityRole="button" onPress={openVets} style={({ pressed }) => [styles.card, pressed && styles.pressed]}><View style={[styles.icon, styles.iconWarm]}><Ionicons name="location-outline" size={23} color="#B45309" /></View><View style={styles.copy}><Text style={styles.cardTitle}>Trova un veterinario</Text><Text style={styles.cardText}>Apri una ricerca vicino a te e scegli una struttura che puoi contattare.</Text></View><Ionicons name="open-outline" size={18} color={colors.textMuted} /></Pressable>
      <View style={styles.emergency}><View style={styles.emergencyHeader}><Ionicons name="warning-outline" size={22} color={colors.danger} /><Text style={styles.emergencyTitle}>Se è un’emergenza</Text></View><Text style={styles.emergencyText}>Difficoltà a respirare, collasso, convulsioni, sanguinamento importante o dolore intenso richiedono assistenza veterinaria immediata.</Text><Pressable accessibilityRole="button" onPress={openVets} style={styles.emergencyButton}><Text style={styles.emergencyButtonText}>Cerca assistenza adesso</Text><Ionicons name="arrow-forward" size={17} color="#FFFFFF" /></Pressable></View>
      <Text style={styles.note}>DOGly non fa diagnosi e non sostituisce una visita. Se sei in dubbio, chiama la clinica e descrivi cosa sta succedendo.</Text>
    </ScrollView>
  </SafeAreaView></View>;
}
const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background }, safe: { flex: 1 }, content: { width: '100%', maxWidth: 560, alignSelf: 'center', padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxxl },
  header: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm, marginBottom: spacing.sm }, back: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', marginLeft: -spacing.sm }, eyebrow: { color: colors.primary, fontSize: typography.size.xs, fontWeight: typography.weight.bold, letterSpacing: 0.9, marginTop: spacing.xs }, title: { color: colors.text, fontSize: typography.size.xxl, lineHeight: 34, fontWeight: typography.weight.bold, maxWidth: 370 },
  intro: { backgroundColor: '#EAF4FF', borderRadius: radius.lg, padding: spacing.lg, gap: spacing.xs }, introTitle: { color: colors.text, fontSize: typography.size.lg, fontWeight: typography.weight.bold }, introText: { color: colors.textSecondary, fontSize: typography.size.sm, lineHeight: 20 },
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.md, flexDirection: 'row', alignItems: 'center', gap: spacing.md, borderWidth: 1, borderColor: '#E0EAF4' }, icon: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: '#E5F0FF' }, iconWarm: { backgroundColor: '#FFF3D6' }, copy: { flex: 1 }, cardTitle: { color: colors.text, fontSize: typography.size.md, fontWeight: typography.weight.bold }, cardText: { color: colors.textSecondary, fontSize: typography.size.sm, lineHeight: 19, marginTop: 3 }, pressed: { opacity: 0.82 },
  emergency: { backgroundColor: '#FFF3F0', borderRadius: radius.lg, padding: spacing.lg, borderWidth: 1, borderColor: '#FFD7D0', gap: spacing.sm }, emergencyHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm }, emergencyTitle: { color: colors.danger, fontSize: typography.size.lg, fontWeight: typography.weight.bold }, emergencyText: { color: '#7F1D1D', fontSize: typography.size.sm, lineHeight: 20 }, emergencyButton: { backgroundColor: colors.danger, borderRadius: radius.full, paddingVertical: spacing.sm, paddingHorizontal: spacing.md, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.xs, marginTop: spacing.xs }, emergencyButtonText: { color: '#FFFFFF', fontWeight: typography.weight.bold, fontSize: typography.size.sm }, note: { color: colors.textMuted, fontSize: 12, lineHeight: 18, textAlign: 'center', paddingHorizontal: spacing.sm },
});
