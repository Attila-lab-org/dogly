import React, { useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';

import { CuteIcon, ScreenContainer } from '@/components';
import { DogAvatar } from '@/features/core/components';
import { useDogProfile } from '@/features/core/useDogProfile';
import { SpringPress } from '@/components/pressSpring';
import { colors, radius, shadows, spacing, typography } from '@/theme/tokens';

const SIZE_OPTIONS = [
  { label: 'Piccola', iconSize: 19 },
  { label: 'Media', iconSize: 23 },
  { label: 'Grande', iconSize: 27 },
] as const;

export default function MotionLabScreen() {
  const router = useRouter();
  const { dog } = useDogProfile();
  const [selectedSize, setSelectedSize] = useState('Media');
  const [loading, setLoading] = useState(false);
  const [saved, setSaved] = useState(false);
  const [feedback, setFeedback] = useState('Tocca il tasto per vedere il gesto completo');

  const simulateSave = () => {
    setLoading(true);
    setSaved(false);
    setFeedback('Salvataggio in corso…');
    setTimeout(() => {
      setLoading(false);
      setSaved(true);
      setFeedback('Salvato automaticamente');
    }, 850);
  };

  return (
    <ScreenContainer scroll world="social" contentStyle={styles.content}>
      <View style={styles.header}>
        <SpringPress
          accessibilityRole="button"
          accessibilityLabel="Indietro"
          onPress={() => router.back()}
          pressableStyle={styles.backButton}
        >
          <Ionicons name="chevron-back" size={30} color={colors.text} />
        </SpringPress>
        <View style={styles.headerCopy}>
          <Text style={styles.eyebrow}>DOGly · INTERACTION PREVIEW</Text>
          <Text style={styles.title}>Gesti che sembrano naturali</Text>
          <Text style={styles.subtitle}>Il riferimento visivo è Social: foto vera, card leggere, azioni immediate.</Text>
        </View>
      </View>

      <View style={styles.heroCard}>
        <LinearGradient
          colors={['#123E86', '#2869DB']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
        <View style={styles.heroBody}>
          <View style={styles.heroCopy}>
            <Text style={styles.heroEyebrow}>OGGI CON {dog.name.toUpperCase()}</Text>
            <Text style={styles.heroTitle}>Un gesto chiaro, una risposta immediata.</Text>
            <Text style={styles.heroBodyText}>Press spring, haptic e feedback senza riquadri anonimi.</Text>
          </View>
          <View style={styles.heroPhoto}>
            <DogAvatar size={82} photoUri={dog.photoUri} dogName={dog.name} />
          </View>
        </View>
        <View style={styles.statsBar}>
          <View style={styles.statItem}>
            <MaterialCommunityIcons name="gesture-tap" size={17} color="#BFE8FF" />
            <Text style={styles.statValue}>Spring</Text>
            <Text style={styles.statLabel}>Pressione</Text>
          </View>
          <View style={styles.statItem}>
            <CuteIcon name="voice" size={18} color="#BFE8FF" secondary="#BFE8FF" />
            <Text style={styles.statValue}>Haptic</Text>
            <Text style={styles.statLabel}>Feedback</Text>
          </View>
          <View style={styles.statItem}>
            <Ionicons name="checkmark-circle-outline" size={18} color="#BFE8FF" />
            <Text style={styles.statValue}>Chiaro</Text>
            <Text style={styles.statLabel}>Stato</Text>
          </View>
        </View>
        <SpringPress
          accessibilityRole="button"
          accessibilityLabel="Prova il salvataggio"
          disabled={loading}
          onPress={simulateSave}
          pressableStyle={styles.heroAction}
          scaleTo={0.975}
        >
          {loading ? <ActivityIndicator size="small" color={colors.primary} /> : null}
          {!loading && saved ? <Ionicons name="checkmark-circle" size={21} color={colors.accent} /> : null}
          {!loading && !saved ? <MaterialCommunityIcons name="camera-outline" size={20} color={colors.primary} /> : null}
          <Text style={styles.heroActionText}>{loading ? 'Salvataggio…' : saved ? 'Salvato' : 'Racconta un momento'}</Text>
          {!loading ? <Ionicons name="arrow-forward" size={19} color={colors.primary} /> : null}
        </SpringPress>
      </View>

      <View style={styles.statusRow}>
        <View style={[styles.statusDot, saved && styles.statusDotSaved]} />
        <Text style={styles.statusText}>{feedback}</Text>
      </View>

      <Text style={styles.sectionTitle}>Azioni del mondo DOGly</Text>
      <View style={styles.actionGrid}>
        {([
          ['bowl', 'Alimenti', 'Aggiungi'],
          ['clock', 'Agenda', 'Apri'],
          ['heart', 'Momenti', 'Salva'],
          ['voice', 'Voce', 'Parla'],
        ] as const).map(([icon, label, verb]) => (
          <SpringPress
            key={label}
            accessibilityRole="button"
            accessibilityLabel={`${verb} ${label}`}
            onPress={() => setFeedback(`${label}: gesto ricevuto`)}
            pressableStyle={styles.actionTile}
            scaleTo={0.97}
          >
            <View style={styles.actionIcon}>
              <CuteIcon name={icon} size={25} color={colors.accent} secondary={colors.text} />
            </View>
            <Text style={styles.actionLabel}>{label}</Text>
            <Text style={styles.actionVerb}>{verb}</Text>
          </SpringPress>
        ))}
      </View>

      <Text style={styles.sectionTitle}>Selezione con scala visiva</Text>
      <View style={styles.sizeRow}>
        {SIZE_OPTIONS.map((option) => {
          const selected = selectedSize === option.label;
          return (
            <SpringPress
              key={option.label}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              onPress={() => { setSelectedSize(option.label); setFeedback(`Taglia ${option.label.toLowerCase()} selezionata`); }}
              pressableStyle={[styles.sizeTile, selected && styles.sizeTileSelected]}
              scaleTo={0.97}
            >
              <MaterialCommunityIcons name="dog-side" size={option.iconSize} color={selected ? '#FFFFFF' : colors.primary} />
              <Text style={[styles.sizeLabel, selected && styles.sizeLabelSelected]}>{option.label}</Text>
              {selected ? <Ionicons name="checkmark-circle" size={18} color="#FFFFFF" /> : null}
            </SpringPress>
          );
        })}
      </View>

      <View style={styles.principleCard}>
        <View style={styles.principleIcon}>
          <CuteIcon name="pattern" size={23} color={colors.primary} secondary={colors.text} />
        </View>
        <View style={styles.principleCopy}>
          <Text style={styles.principleTitle}>Una grammatica, tutta l’app</Text>
          <Text style={styles.principleBody}>Stessa risposta al tap, stesso feedback di salvataggio, stessa chiarezza in ogni mondo.</Text>
        </View>
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  content: { paddingBottom: spacing.xxxl },
  header: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm, marginBottom: spacing.xl },
  backButton: { width: 42, height: 42, alignItems: 'flex-start', justifyContent: 'center' },
  headerCopy: { flex: 1 },
  eyebrow: { color: colors.primary, fontSize: 10, fontWeight: typography.weight.bold, letterSpacing: 1.05 },
  title: { color: colors.text, fontSize: 27, lineHeight: 33, fontWeight: typography.weight.bold, letterSpacing: -0.6 },
  subtitle: { color: colors.textSecondary, fontSize: 13, lineHeight: 19, marginTop: spacing.xs },
  heroCard: { minHeight: 275, borderRadius: 26, padding: spacing.lg, overflow: 'hidden', ...shadows.raised },
  heroBody: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  heroCopy: { flex: 1, minWidth: 0 },
  heroEyebrow: { color: '#BFE8FF', fontSize: 10, fontWeight: typography.weight.bold, letterSpacing: 0.9 },
  heroTitle: { color: '#FFFFFF', fontSize: 22, lineHeight: 27, fontWeight: typography.weight.bold, marginTop: spacing.xs },
  heroBodyText: { color: '#D9ECFF', fontSize: 12, lineHeight: 17, marginTop: spacing.sm },
  heroPhoto: { width: 94, height: 94, borderRadius: 28, padding: 5, backgroundColor: '#FFFFFF', borderWidth: 2, borderColor: '#FFB3D4', ...shadows.card },
  statsBar: { flexDirection: 'row', justifyContent: 'space-between', marginTop: spacing.lg, paddingVertical: spacing.sm, paddingHorizontal: spacing.sm, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.16)' },
  statItem: { flex: 1, alignItems: 'center', gap: 2 },
  statValue: { color: '#FFFFFF', fontSize: 12, fontWeight: typography.weight.bold },
  statLabel: { color: '#D9ECFF', fontSize: 10 },
  heroAction: { minHeight: 47, marginTop: spacing.md, borderRadius: radius.full, paddingHorizontal: spacing.lg, backgroundColor: '#FFFFFF', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm, ...shadows.card },
  heroActionText: { flex: 1, color: colors.primary, fontSize: 14, fontWeight: typography.weight.bold },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.sm, paddingHorizontal: spacing.xs },
  statusDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.warning },
  statusDotSaved: { backgroundColor: colors.success },
  statusText: { color: colors.textSecondary, fontSize: 12, fontWeight: typography.weight.medium },
  sectionTitle: { color: colors.text, fontSize: 19, fontWeight: typography.weight.bold, marginTop: spacing.xl, marginBottom: spacing.md },
  actionGrid: { flexDirection: 'row', gap: spacing.sm },
  actionTile: { flex: 1, minWidth: 0, minHeight: 105, alignItems: 'center', justifyContent: 'center', gap: 3, borderRadius: 18, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, ...shadows.card },
  actionIcon: { width: 45, height: 45, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.accentSoft, marginBottom: 2 },
  actionLabel: { color: colors.text, fontSize: 12, fontWeight: typography.weight.bold },
  actionVerb: { color: colors.textSecondary, fontSize: 10 },
  sizeRow: { flexDirection: 'row', gap: spacing.sm },
  sizeTile: { flex: 1, minWidth: 0, minHeight: 65, borderRadius: 17, borderWidth: 1.5, borderColor: colors.border, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center', gap: 3 },
  sizeTileSelected: { backgroundColor: colors.accent, borderColor: colors.accent },
  sizeLabel: { color: colors.textSecondary, fontSize: 12, fontWeight: typography.weight.semibold },
  sizeLabelSelected: { color: '#FFFFFF' },
  principleCard: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.md, marginTop: spacing.xl, borderRadius: 18, backgroundColor: '#F0F5FF', borderWidth: 1, borderColor: '#DCE7FF' },
  principleIcon: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFFFFF' },
  principleCopy: { flex: 1, minWidth: 0 },
  principleTitle: { color: colors.text, fontSize: 14, fontWeight: typography.weight.bold },
  principleBody: { color: colors.textSecondary, fontSize: 12, lineHeight: 17, marginTop: 3 },
});
