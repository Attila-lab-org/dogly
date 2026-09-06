/**
 * Advice Engine V2 — superfici consumer (ADR-012, brief sez. 13).
 *
 * AdviceCard: "Cosa puoi fare adesso" — accento teal, UNA sola azione in
 * linguaggio semplice, "Perché questo consiglio" espandibile (spiegazione
 * semplice, MAI citazioni scientifiche grezze), icona CuteIcon per categoria.
 *
 * AdviceOutcomePrompt: "Ti è sembrato utile?" (Sì / No / Non so).
 * - risultato: subito sotto la card;
 * - Diario: outcome differito (il consiglio ha bisogno di tempo);
 * - già risposto → solo stato ("Utile ✓"), mai ri-chiedere;
 * - errore di salvataggio onesto ("Non salvato — riprova"), mai finto successo.
 */
import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Card, CuteIcon, type CuteIconName } from '../../components';
import { colors, radius, spacing, typography } from '../../theme/tokens';
import { saveAdviceOutcome } from './api';
import { useAdviceOutcome } from './store';
import {
  ADVICE_OUTCOME_LABELS,
  ADVICE_OUTCOME_STATE_LABELS,
  ADVICE_OUTCOME_VALUES,
  type AdviceCategory,
  type AdviceItem,
  type AdviceOutcomeValue,
} from './types';

const CATEGORY_ICONS: Record<AdviceCategory, CuteIconName> = {
  URGENT_SAFETY: 'alert',
  VET_ESCALATION: 'alert',
  LOW_RISK_MANAGEMENT: 'cloud',
  DEVELOPMENT: 'paw',
  ROUTINE: 'clock',
  ENRICHMENT: 'play',
  TRAINING: 'paw',
  MONITOR: 'gaze',
};

export function AdviceCard({
  advice,
  dogName,
}: {
  advice: AdviceItem;
  dogName: string;
}) {
  const [whyOpen, setWhyOpen] = useState(false);
  const actionText = advice.actionText.replace(/Rocky/g, dogName);
  const whyText = advice.whyText.replace(/Rocky/g, dogName);

  return (
    <Card style={styles.card} testID="advice-card">
      <View style={styles.headerRow}>
        <View style={styles.iconWrap}>
          <CuteIcon name={CATEGORY_ICONS[advice.category]} size={22} />
        </View>
        <Text style={styles.title}>Cosa puoi fare adesso</Text>
      </View>

      <Text style={styles.action}>{actionText}</Text>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Perché questo consiglio"
        accessibilityState={{ expanded: whyOpen }}
        onPress={() => setWhyOpen((open) => !open)}
        style={styles.whyToggle}
        hitSlop={8}
      >
        <Text style={styles.whyToggleText}>Perché questo consiglio</Text>
        <Ionicons
          name={whyOpen ? 'chevron-up' : 'chevron-down'}
          size={16}
          color={colors.accent}
        />
      </Pressable>

      {whyOpen ? <Text style={styles.whyText}>{whyText}</Text> : null}
      {whyOpen && advice.followUp ? (
        <Text style={styles.followUp}>
          Poi osserva: {advice.followUp.replace(/Rocky/g, dogName)}
        </Text>
      ) : null}
    </Card>
  );
}

export function AdviceOutcomePrompt({
  eventId,
  adviceCode,
  deferred = false,
  existingOutcome = null,
}: {
  eventId: string;
  adviceCode: string;
  /** true nel Diario: il consiglio ha avuto tempo di essere provato. */
  deferred?: boolean;
  existingOutcome?: AdviceOutcomeValue | null;
}) {
  const saved = useAdviceOutcome(eventId);
  const outcome = saved?.outcome ?? existingOutcome;
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleOutcome = async (value: AdviceOutcomeValue) => {
    if (saving || outcome) return;
    setSaving(true);
    setError(null);
    try {
      await saveAdviceOutcome(eventId, adviceCode, value);
    } catch {
      // Mai finto successo: badge errore onesto, l'utente può riprovare.
      setError('Non salvato — riprova');
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={styles.outcomeCard} testID="advice-outcome">
      <View style={styles.outcomeHeading}>
        <Text style={styles.outcomeTitle}>Ti è sembrato utile?</Text>
        {error ? (
          <View style={styles.stateBadge}>
            <Ionicons name="alert-circle" size={13} color={colors.danger} />
            <Text style={styles.errorLabel}>{error}</Text>
          </View>
        ) : outcome ? (
          <View style={styles.stateBadge}>
            {outcome === 'HELPED' ? (
              <Ionicons name="checkmark" size={13} color={colors.accent} />
            ) : null}
            <Text style={styles.savedLabel}>
              {ADVICE_OUTCOME_STATE_LABELS[outcome]}
            </Text>
          </View>
        ) : null}
      </View>

      {deferred && !outcome ? (
        <Text style={styles.deferredNote}>
          Il consiglio ha bisogno di tempo: com'è andata?
        </Text>
      ) : null}

      {!outcome ? (
        <View style={styles.outcomeOptions}>
          {ADVICE_OUTCOME_VALUES.map((value) => (
            <Pressable
              key={value}
              accessibilityRole="button"
              accessibilityLabel={`Ti è sembrato utile? ${ADVICE_OUTCOME_LABELS[value]}`}
              disabled={saving}
              onPress={() => void handleOutcome(value)}
              style={({ pressed }) => [
                styles.outcomeOption,
                pressed && styles.outcomeOptionPressed,
              ]}
              testID={`advice-outcome-${value.toLowerCase()}`}
            >
              <Text style={styles.outcomeOptionLabel}>
                {ADVICE_OUTCOME_LABELS[value]}
              </Text>
            </Pressable>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginTop: spacing.lg,
    backgroundColor: colors.accentSoft,
    borderWidth: 1,
    borderColor: colors.accent,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: radius.full,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    flex: 1,
    fontSize: typography.size.md,
    fontWeight: typography.weight.bold,
    color: colors.text,
  },
  action: {
    fontSize: typography.size.md,
    fontWeight: typography.weight.semibold,
    color: colors.text,
    lineHeight: typography.size.md * typography.lineHeight.normal,
  },
  whyToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginTop: spacing.md,
    alignSelf: 'flex-start',
  },
  whyToggleText: {
    fontSize: typography.size.sm,
    fontWeight: typography.weight.semibold,
    color: colors.accent,
  },
  whyText: {
    marginTop: spacing.sm,
    fontSize: typography.size.sm,
    color: colors.textSecondary,
    lineHeight: typography.size.sm * typography.lineHeight.relaxed,
  },
  followUp: {
    marginTop: spacing.sm,
    fontSize: typography.size.sm,
    color: colors.text,
    lineHeight: typography.size.sm * typography.lineHeight.relaxed,
  },
  outcomeCard: {
    marginTop: spacing.md,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
  },
  outcomeHeading: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  outcomeTitle: {
    fontSize: typography.size.sm,
    fontWeight: typography.weight.bold,
    color: colors.text,
  },
  stateBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  savedLabel: {
    color: colors.accent,
    fontSize: typography.size.xs,
    fontWeight: typography.weight.semibold,
  },
  errorLabel: {
    color: colors.danger,
    fontSize: typography.size.xs,
    fontWeight: typography.weight.semibold,
  },
  deferredNote: {
    marginTop: spacing.xs,
    fontSize: typography.size.xs,
    color: colors.textSecondary,
  },
  outcomeOptions: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  outcomeOption: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 40,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceMuted,
  },
  outcomeOptionPressed: {
    backgroundColor: colors.accentSoft,
  },
  outcomeOptionLabel: {
    fontSize: typography.size.sm,
    fontWeight: typography.weight.semibold,
    color: colors.text,
  },
});
