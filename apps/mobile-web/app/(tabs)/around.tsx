import React from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius, spacing, typography } from '@/theme/tokens';

function openMap(query: string) {
  const url = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
  void Linking.openURL(url);
}

export default function AroundScreen() {
  return (
    <View style={styles.root}>
      <SafeAreaView edges={['top']} style={styles.safe}>
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <View style={styles.header}>
            <View style={styles.icon}><Ionicons name="location" size={22} color={colors.primary} /></View>
            <Text style={styles.eyebrow}>INTORNO A TE</Text>
            <Text style={styles.title}>Tutto ciò che serve a voi due</Text>
            <Text style={styles.subtitle}>Cerco nella mappa luoghi utili vicino a te, senza complicare il percorso.</Text>
          </View>
          <PlaceCard
            icon="paw-outline"
            title="Aree per correre e giocare"
            text="Trova aree di sgambamento e parchi per cani nelle vicinanze."
            button="Cerca aree vicine"
            onPress={() => openMap('area sgambamento cani vicino a me')}
          />
          <PlaceCard
            icon="medkit-outline"
            tone="warm"
            title="Veterinari vicini"
            text="Trova una struttura da contattare quando hai bisogno di assistenza."
            button="Trova un veterinario"
            onPress={() => openMap('veterinario vicino a me')}
          />
          <View style={styles.note}>
            <Ionicons name="shield-checkmark-outline" size={19} color={colors.accent} />
            <Text style={styles.noteText}>Per un’emergenza vera, chiama subito i servizi locali. La mappa ti aiuta a trovare il posto giusto.</Text>
          </View>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

function PlaceCard({ icon, tone, title, text, button, onPress }: { icon: keyof typeof Ionicons.glyphMap; tone?: 'warm'; title: string; text: string; button: string; onPress: () => void }) {
  return (
    <View style={styles.card}>
      <View style={[styles.cardIcon, tone === 'warm' && styles.cardIconWarm]}><Ionicons name={icon} size={24} color={tone === 'warm' ? '#B45309' : colors.primary} /></View>
      <Text style={styles.cardTitle}>{title}</Text>
      <Text style={styles.cardText}>{text}</Text>
      <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.button, pressed && styles.pressed]}>
        <Text style={styles.buttonText}>{button}</Text><Ionicons name="arrow-forward" size={17} color="#FFFFFF" />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background }, safe: { flex: 1 },
  content: { width: '100%', maxWidth: 620, alignSelf: 'center', padding: spacing.lg, paddingBottom: spacing.xxxl, gap: spacing.md },
  header: { alignItems: 'center', paddingVertical: spacing.xl, gap: spacing.sm },
  icon: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primarySoft },
  eyebrow: { color: colors.primary, fontSize: typography.size.xs, fontWeight: typography.weight.bold, letterSpacing: 1 },
  title: { color: colors.text, fontSize: typography.size.xxl, lineHeight: 31, fontWeight: typography.weight.bold, textAlign: 'center' },
  subtitle: { color: colors.textSecondary, fontSize: typography.size.md, lineHeight: 22, textAlign: 'center' },
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: spacing.lg, gap: spacing.sm },
  cardIcon: { width: 48, height: 48, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primarySoft },
  cardIconWarm: { backgroundColor: '#FEF3C7' }, cardTitle: { color: colors.text, fontSize: typography.size.lg, fontWeight: typography.weight.bold },
  cardText: { color: colors.textSecondary, fontSize: typography.size.sm, lineHeight: 20 },
  button: { marginTop: spacing.sm, minHeight: 46, borderRadius: radius.full, paddingHorizontal: spacing.md, backgroundColor: colors.primary, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm },
  buttonText: { color: '#FFFFFF', fontSize: typography.size.sm, fontWeight: typography.weight.bold }, pressed: { opacity: 0.82 },
  note: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm, padding: spacing.md, borderRadius: radius.md, backgroundColor: colors.accentSoft },
  noteText: { flex: 1, color: colors.textSecondary, fontSize: typography.size.xs, lineHeight: 18 },
});
