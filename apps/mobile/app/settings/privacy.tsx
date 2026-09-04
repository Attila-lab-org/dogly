/**
 * Privacy e dati (Spec V1 sez. 23):
 * - consensi SEPARATI (sez. 23.1): servizio / ricerca-training (OFF di
 *   default) / notifiche / keep-clip;
 * - "Esporta i miei dati" con stati (sez. 6): richiesta in corso → export
 *   pronto (POST /v1/privacy/export);
 * - "Elimina account" con doppia conferma esplicita
 *   (POST /v1/privacy/delete-account).
 */
import React, { useState } from 'react';
import { Alert, StyleSheet, Switch, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Button, Card, ScreenContainer } from '@/components';
import { colors, radius, spacing, typography } from '@/theme/tokens';
import { StackScreenHeader } from '@/features/secondary/components';
import { consentsMock } from '@/mocks/secondary';
import type { ConsentState } from '@/features/secondary/types';

type ExportState = 'idle' | 'pending' | 'ready';

interface ConsentRow {
  key: keyof ConsentState;
  title: string;
  description: string;
  locked?: boolean;
}

const CONSENT_ROWS: ConsentRow[] = [
  {
    key: 'service',
    title: 'Servizio e termini',
    description:
      "Necessario per usare l'app: trattamento dei dati per fornire le analisi.",
    locked: true,
  },
  {
    key: 'researchTraining',
    title: 'Ricerca e miglioramento dei modelli',
    description:
      'Facoltativo e sempre separato: se attivo, alcuni dati possono essere usati per migliorare il servizio. Spento di default.',
  },
  {
    key: 'notifications',
    title: 'Notifiche',
    description:
      'Preferenza dell’app, indipendente dal permesso del telefono: puoi cambiarla quando vuoi.',
  },
  {
    key: 'keepClip',
    title: 'Conserva i clip originali',
    description:
      'Di default video e foto vengono eliminati dopo l’analisi. Attiva solo se vuoi mantenerli.',
  },
];

export default function PrivacyScreen() {
  const [consents, setConsents] = useState<ConsentState>(consentsMock);
  const [exportState, setExportState] = useState<ExportState>('idle');
  const [deleteArmed, setDeleteArmed] = useState(false);
  const [deleteStarted, setDeleteStarted] = useState(false);

  const toggle = (key: keyof ConsentState) =>
    setConsents((c) => ({ ...c, [key]: !c[key] }));

  const startExport = () => {
    setExportState('pending');
    // Mock job: POST /v1/privacy/export → export pronto
    setTimeout(() => setExportState('ready'), 2000);
  };

  const confirmDelete = () => {
    Alert.alert(
      'Eliminare definitivamente?',
      "Questa azione è irreversibile: account, dati di Rocky, media e cronologia verranno eliminati. L'eliminazione può richiedere alcuni giorni e riceverai una conferma.",
      [
        { text: 'Annulla', style: 'cancel', onPress: () => setDeleteArmed(false) },
        {
          text: 'Sì, elimina tutto',
          style: 'destructive',
          onPress: () => {
            setDeleteArmed(false);
            setDeleteStarted(true);
          },
        },
      ],
    );
  };

  return (
    <ScreenContainer scroll>
      <StackScreenHeader title="Privacy e dati" />

      {/* Consensi separati */}
      <Card style={styles.card}>
        <Text style={styles.sectionTitle}>I tuoi consensi</Text>
        <Text style={styles.note}>
          Ogni consenso è separato: puoi cambiare idea in qualsiasi momento,
          senza perdere l'accesso al servizio di base.
        </Text>
        {CONSENT_ROWS.map((row) => (
          <View key={row.key} style={styles.consentRow}>
            <View style={styles.consentText}>
              <Text style={styles.consentTitle}>{row.title}</Text>
              <Text style={styles.consentDescription}>{row.description}</Text>
            </View>
            <Switch
              value={consents[row.key]}
              onValueChange={() => toggle(row.key)}
              disabled={row.locked}
              trackColor={{ false: colors.border, true: colors.accentSoft }}
              thumbColor={consents[row.key] ? colors.accent : colors.textMuted}
              accessibilityLabel={row.title}
            />
          </View>
        ))}
      </Card>

      {/* Export */}
      <Card style={styles.card}>
        <Text style={styles.sectionTitle}>Esporta i miei dati</Text>
        <Text style={styles.note}>
          Ricevi un file con profilo, dati di Rocky, risultati, feedback,
          pattern, eventi digestivi, cibi e consensi.
        </Text>
        {exportState === 'idle' && (
          <Button
            title="Richiedi l'esportazione"
            variant="outline"
            icon={<Ionicons name="download-outline" size={18} color={colors.accent} />}
            onPress={startExport}
          />
        )}
        {exportState === 'pending' && (
          <View style={styles.statusRow}>
            <Ionicons name="time-outline" size={18} color={colors.primary} />
            <Text style={styles.statusText}>
              Richiesta in corso… ti avvisiamo quando il file è pronto.
            </Text>
          </View>
        )}
        {exportState === 'ready' && (
          <>
            <View style={styles.statusRow}>
              <Ionicons name="checkmark-circle" size={18} color={colors.accent} />
              <Text style={styles.statusText}>
                Il tuo export è pronto. Il link è privato e scade tra 7 giorni.
              </Text>
            </View>
            <Button
              title="Scarica l'export"
              icon={<Ionicons name="download" size={18} color={colors.textOnPrimary} />}
              onPress={() => {}}
              style={styles.exportButton}
            />
          </>
        )}
      </Card>

      {/* Delete — doppia conferma esplicita */}
      <Card style={styles.card}>
        <Text style={styles.sectionTitle}>Elimina account</Text>
        <Text style={styles.note}>
          Elimina account, dati di Rocky, media e cronologia. Azione
          irreversibile.
        </Text>
        {deleteStarted ? (
          <View style={styles.statusRow}>
            <Ionicons name="checkmark-circle" size={18} color={colors.textSecondary} />
            <Text style={styles.statusText}>
              Eliminazione avviata: l'accesso è già revocato e la rimozione dei
              dati procede in background.
            </Text>
          </View>
        ) : deleteArmed ? (
          <View style={styles.deleteConfirm}>
            <View style={styles.statusRow}>
              <Ionicons name="warning-outline" size={18} color={colors.danger} />
              <Text style={styles.statusText}>
                Sei sicuro? Questa è la conferma finale.
              </Text>
            </View>
            <Button
              title="Confermo: elimina il mio account"
              variant="danger"
              onPress={confirmDelete}
              style={styles.exportButton}
            />
            <Button
              title="Annulla"
              variant="outline"
              onPress={() => setDeleteArmed(false)}
              style={styles.cancelButton}
            />
          </View>
        ) : (
          <Button
            title="Elimina account"
            variant="danger"
            icon={<Ionicons name="trash-outline" size={18} color={colors.textOnPrimary} />}
            onPress={() => setDeleteArmed(true)}
          />
        )}
      </Card>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  card: {
    marginBottom: spacing.lg,
  },
  sectionTitle: {
    fontSize: typography.size.md,
    fontWeight: typography.weight.bold,
    color: colors.text,
    marginBottom: spacing.xs,
  },
  note: {
    fontSize: typography.size.xs,
    color: colors.textSecondary,
    lineHeight: typography.size.xs * typography.lineHeight.relaxed,
    marginBottom: spacing.md,
  },
  consentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  consentText: {
    flex: 1,
  },
  consentTitle: {
    fontSize: typography.size.sm,
    fontWeight: typography.weight.semibold,
    color: colors.text,
  },
  consentDescription: {
    fontSize: typography.size.xs,
    color: colors.textSecondary,
    lineHeight: typography.size.xs * typography.lineHeight.normal,
    marginTop: spacing.xxs,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  statusText: {
    flex: 1,
    fontSize: typography.size.xs,
    color: colors.text,
    lineHeight: typography.size.xs * typography.lineHeight.relaxed,
  },
  exportButton: {
    marginTop: spacing.md,
  },
  deleteConfirm: {
    gap: spacing.xs,
  },
  cancelButton: {
    marginTop: spacing.xs,
  },
});
