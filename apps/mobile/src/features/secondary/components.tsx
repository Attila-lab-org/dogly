/**
 * Componenti condivisi delle schermate secondarie (F2).
 * Stile: design language vincolante (UX_REFERENCE) — card bianche, radius
 * grande, palette token, icone outline teal, band di confidenza mai %.
 */
import React from 'react';
import { Pressable, StyleSheet, Text, View, ViewStyle } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius, spacing, typography } from '../../theme/tokens';
import { Chip } from '../../components/Chip';
import type { ChipTone } from '../../components/Chip';
import type { ConfidenceBand, PatternState } from '../../contracts/types';
import type { CandidateLevel } from './types';

/** Top bar stile mockup-result: back chevron a sinistra, titolo centrato. */
export function StackScreenHeader({
  title,
  onBack,
}: {
  title: string;
  onBack?: () => void;
}) {
  const router = useRouter();
  return (
    <View style={headerStyles.row}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Indietro"
        onPress={onBack ?? (() => router.back())}
        hitSlop={12}
        style={headerStyles.back}
      >
        <Ionicons name="chevron-back" size={24} color={colors.text} />
      </Pressable>
      <Text style={headerStyles.title} numberOfLines={1}>
        {title}
      </Text>
      <View style={headerStyles.back} />
    </View>
  );
}

const headerStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  back: {
    width: 32,
    alignItems: 'flex-start',
  },
  title: {
    flex: 1,
    textAlign: 'center',
    fontSize: typography.size.lg,
    fontWeight: typography.weight.bold,
    color: colors.text,
  },
});

const bandLabel: Record<ConfidenceBand, string> = {
  LOW: 'Confidenza bassa',
  MEDIUM: 'Confidenza media',
  HIGH: 'Confidenza alta',
};

const bandTone: Record<ConfidenceBand, ChipTone> = {
  LOW: 'warning',
  MEDIUM: 'accent',
  HIGH: 'accent',
};

/**
 * Pill di confidenza a band (sez. 6.1 / O-07): mai percentuali.
 * Stile pill azzurro chiaro del mockup.
 */
export function ConfidenceBandPill({
  band,
  style,
}: {
  band: ConfidenceBand;
  style?: ViewStyle;
}) {
  return <Chip label={bandLabel[band]} tone={bandTone[band]} style={style} />;
}

/** Titolo di sezione con icona teal opzionale a destra (stile mockup Rocky). */
export function SectionHeader({
  title,
  icon,
}: {
  title: string;
  icon?: React.ReactNode;
}) {
  return (
    <View style={sectionStyles.row}>
      <Text style={sectionStyles.title}>{title}</Text>
      {icon}
    </View>
  );
}

const sectionStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  title: {
    fontSize: typography.size.lg,
    fontWeight: typography.weight.bold,
    color: colors.text,
  },
});

const stateLabel: Record<PatternState, string> = {
  CANDIDATE: 'In osservazione',
  PRELIMINARY: 'Preliminare',
  ESTABLISHED: 'Consolidato',
  STRONG: 'Molto solido',
  CONTESTED: 'Da verificare',
  DORMANT: 'Non visto di recente',
  ARCHIVED: 'Archiviato',
};

const stateTone: Record<PatternState, ChipTone> = {
  CANDIDATE: 'neutral',
  PRELIMINARY: 'primary',
  ESTABLISHED: 'accent',
  STRONG: 'accent',
  CONTESTED: 'warning',
  DORMANT: 'neutral',
  ARCHIVED: 'neutral',
};

/** Chip di stato pattern (sez. 17.2 — CONTESTED mostrato come "Da verificare"). */
export function PatternStateChip({ state }: { state: PatternState }) {
  return <Chip label={stateLabel[state]} tone={stateTone[state]} />;
}

const candidateLabel: Record<CandidateLevel, string> = {
  none_observed: 'Non osservato',
  possible: 'Possibile',
  clear_candidate: 'Candidato',
  unknown: 'Non valutabile',
};

/**
 * Etichetta per i candidati osservabili (sez. 19.1): wording sempre
 * prudente — "possibile/candidato", mai assenze provate ("non osservato"
 * ≠ "assente").
 */
export function candidateText(level: CandidateLevel): string {
  return candidateLabel[level];
}

/** Riga icona + testo riutilizzabile (evidence rows, meta righe). */
export function IconRow({
  icon,
  text,
  textStyle,
}: {
  icon: React.ReactNode;
  text: string;
  textStyle?: object;
}) {
  return (
    <View style={iconRowStyles.row}>
      <View style={iconRowStyles.iconWrap}>{icon}</View>
      <Text style={[iconRowStyles.text, textStyle]}>{text}</Text>
    </View>
  );
}

const iconRowStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: radius.full,
    backgroundColor: colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {
    flex: 1,
    fontSize: typography.size.sm,
    fontWeight: typography.weight.medium,
    color: colors.text,
    lineHeight: typography.size.sm * typography.lineHeight.normal,
  },
});
