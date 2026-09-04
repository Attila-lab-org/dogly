/**
 * Preferenze notifiche (Spec V1 sez. 23.1 / 13.1): preferenza app SEPARATA
 * dal permesso OS. Il permesso di sistema viene chiesto solo quando c'è un
 * beneficio visibile, mai al primo avvio.
 */
import React, { useState } from 'react';
import { StyleSheet, Switch, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Button, Card, ScreenContainer } from '@/components';
import { colors, spacing, typography } from '@/theme/tokens';
import { StackScreenHeader } from '@/features/secondary/components';

interface Pref {
  key: string;
  title: string;
  description: string;
}

const PREFS: Pref[] = [
  {
    key: 'resultReady',
    title: 'Risultato pronto',
    description: 'Quando un’analisi comportamentale o digestiva è completata.',
  },
  {
    key: 'newPattern',
    title: 'Nuovo pattern scoperto',
    description: 'Quando imparo qualcosa di nuovo su Rocky.',
  },
  {
    key: 'digestiveTrend',
    title: 'Cambiamenti digestivi',
    description: 'Quando noto un cambiamento rispetto alla baseline di Rocky.',
  },
  {
    key: 'weeklySummary',
    title: 'Riepilogo settimanale',
    description: 'Un riepilogo gentile della settimana di Rocky, una volta a settimana.',
  },
];

export default function NotificationsScreen() {
  const [enabled, setEnabled] = useState<Record<string, boolean>>({
    resultReady: true,
    newPattern: true,
    digestiveTrend: true,
    weeklySummary: false,
  });

  return (
    <ScreenContainer scroll>
      <StackScreenHeader title="Notifiche" />
      <Text style={styles.intro}>
        Queste preferenze riguardano l’app. Se il telefono blocca le
        notifiche a livello di sistema, attiva il permesso dalle impostazioni
        del dispositivo: sono due controlli separati.
      </Text>

      <Card style={styles.card}>
        {PREFS.map((pref, index) => (
          <View
            key={pref.key}
            style={[styles.prefRow, index > 0 && styles.prefDivider]}
          >
            <View style={styles.prefText}>
              <Text style={styles.prefTitle}>{pref.title}</Text>
              <Text style={styles.prefDescription}>{pref.description}</Text>
            </View>
            <Switch
              value={enabled[pref.key]}
              onValueChange={(v) =>
                setEnabled((e) => ({ ...e, [pref.key]: v }))
              }
              trackColor={{ false: colors.border, true: colors.accentSoft }}
              thumbColor={enabled[pref.key] ? colors.accent : colors.textMuted}
              accessibilityLabel={pref.title}
            />
          </View>
        ))}
      </Card>

      <View style={styles.osBox}>
        <Ionicons name="phone-portrait-outline" size={18} color={colors.primary} />
        <Text style={styles.osText}>
          Permesso di sistema: non ancora richiesto. Lo chiederemo solo quando
          attivi una notifica che ti interessa.
        </Text>
      </View>

      <Button
        title="Salva preferenze"
        onPress={() => {}}
        style={styles.save}
      />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  intro: {
    fontSize: typography.size.sm,
    color: colors.textSecondary,
    lineHeight: typography.size.sm * typography.lineHeight.relaxed,
    marginBottom: spacing.lg,
  },
  card: {
    marginBottom: spacing.lg,
  },
  prefRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.sm,
  },
  prefDivider: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  prefText: {
    flex: 1,
  },
  prefTitle: {
    fontSize: typography.size.sm,
    fontWeight: typography.weight.semibold,
    color: colors.text,
  },
  prefDescription: {
    fontSize: typography.size.xs,
    color: colors.textSecondary,
    lineHeight: typography.size.xs * typography.lineHeight.normal,
    marginTop: spacing.xxs,
  },
  osBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    backgroundColor: colors.primarySoft,
    borderRadius: 12,
    padding: spacing.md,
    marginBottom: spacing.lg,
  },
  osText: {
    flex: 1,
    fontSize: typography.size.xs,
    color: colors.text,
    lineHeight: typography.size.xs * typography.lineHeight.relaxed,
  },
  save: {
    marginBottom: spacing.xl,
  },
});
