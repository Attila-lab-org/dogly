import React, { useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Button, ErrorState, ScreenContainer } from '@/components';
import { formatCareDate } from '@/features/care/date';
import {
  completeCareEvent,
  removeCareEvent,
  useCareEvents,
} from '@/features/care/store';
import { CARE_TYPE_META } from '@/features/care/types';
import { useDogProfile } from '@/features/core/useDogProfile';
import { StackScreenHeader } from '@/features/secondary/components';
import { colors, radius, spacing, typography } from '@/theme/tokens';

export default function CareEventDetailScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ eventId?: string | string[] }>();
  const eventId = Array.isArray(params.eventId)
    ? params.eventId[0] ?? ''
    : params.eventId ?? '';
  const { dog } = useDogProfile();
  const events = useCareEvents(dog.id);
  const event = events.find((item) => item.id === eventId);
  const [working, setWorking] = useState(false);

  if (!event) {
    return (
      <ScreenContainer>
        <StackScreenHeader title="Appuntamento" />
        <ErrorState
          title="Appuntamento non trovato"
          message="Potrebbe essere stato eliminato."
        />
      </ScreenContainer>
    );
  }

  const meta = CARE_TYPE_META[event.eventType];
  const completed = event.status === 'COMPLETED';

  const complete = async () => {
    setWorking(true);
    try {
      await completeCareEvent(event.id);
      router.replace('/care' as never);
    } catch {
      Alert.alert('Non riesco ad aggiornare', 'Riprova tra poco.');
    } finally {
      setWorking(false);
    }
  };

  const remove = () => {
    Alert.alert(
      'Eliminare questo appuntamento?',
      'Verrà cancellato anche il promemoria.',
      [
        { text: 'Annulla', style: 'cancel' },
        {
          text: 'Elimina',
          style: 'destructive',
          onPress: async () => {
            setWorking(true);
            try {
              await removeCareEvent(event.id);
              router.replace('/care' as never);
            } catch {
              Alert.alert('Non riesco a eliminare', 'Riprova tra poco.');
              setWorking(false);
            }
          },
        },
      ],
    );
  };

  return (
    <ScreenContainer scroll>
      <StackScreenHeader title="Appuntamento" />

      <View style={styles.hero}>
        <View style={styles.icon}>
          <Ionicons
            name={completed ? 'checkmark' : meta.icon}
            size={34}
            color={completed ? colors.success : colors.primary}
          />
        </View>
        <Text style={styles.type}>{meta.label.toUpperCase()}</Text>
        <Text style={styles.title}>{event.title}</Text>
        <Text style={styles.date}>
          {formatCareDate(event.scheduledAt, event.allDay)}
        </Text>
        {completed ? (
          <View style={styles.doneBadge}>
            <Text style={styles.doneText}>Completato</Text>
          </View>
        ) : null}
      </View>

      <View style={styles.infoCard}>
        <InfoRow
          icon="notifications-outline"
          label={
            event.reminderEnabled
              ? 'Promemoria il giorno prima'
              : 'Promemoria disattivato'
          }
        />
        {event.location ? (
          <InfoRow icon="location-outline" label={event.location} />
        ) : null}
        {event.notes ? (
          <InfoRow icon="document-text-outline" label={event.notes} />
        ) : null}
      </View>

      {!completed ? (
        <Button
          title="Segna come fatto"
          icon={<Ionicons name="checkmark" size={20} color={colors.textOnPrimary} />}
          onPress={complete}
          loading={working}
          style={styles.primary}
        />
      ) : null}
      <Button
        title="Elimina"
        variant="outline"
        onPress={remove}
        disabled={working}
        style={styles.delete}
      />
    </ScreenContainer>
  );
}

function InfoRow({
  icon,
  label,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
}) {
  return (
    <View style={styles.infoRow}>
      <View style={styles.infoIcon}>
        <Ionicons name={icon} size={18} color={colors.accent} />
      </View>
      <Text style={styles.infoText}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  hero: {
    alignItems: 'center',
    padding: spacing.xl,
    borderRadius: radius.lg,
    backgroundColor: colors.primarySoft,
  },
  icon: {
    width: 68,
    height: 68,
    borderRadius: 34,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
  },
  type: {
    marginTop: spacing.md,
    color: colors.primary,
    fontSize: typography.size.xs,
    fontWeight: typography.weight.bold,
    letterSpacing: 0.7,
  },
  title: {
    marginTop: spacing.xs,
    color: colors.text,
    fontSize: typography.size.xl,
    fontWeight: typography.weight.bold,
    textAlign: 'center',
  },
  date: {
    marginTop: spacing.sm,
    color: colors.textSecondary,
    fontSize: typography.size.sm,
    textAlign: 'center',
  },
  doneBadge: {
    marginTop: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.full,
    backgroundColor: colors.successSoft,
  },
  doneText: {
    color: colors.success,
    fontSize: typography.size.xs,
    fontWeight: typography.weight.bold,
  },
  infoCard: {
    marginTop: spacing.lg,
    padding: spacing.md,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: 52,
  },
  infoIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accentSoft,
  },
  infoText: {
    flex: 1,
    color: colors.text,
    fontSize: typography.size.sm,
    lineHeight: typography.size.sm * typography.lineHeight.normal,
  },
  primary: {
    marginTop: spacing.xl,
  },
  delete: {
    marginTop: spacing.md,
    marginBottom: spacing.xl,
  },
});
