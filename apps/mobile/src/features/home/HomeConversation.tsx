import React, { useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useSession } from '../auth/SessionProvider';
import { prepareHomeMessage } from '../realtime/homeMessage';
import { colors, radius, spacing, typography } from '../../theme/tokens';

export function HomeConversation({ dogId, dogName, offline }: {
  dogId: string; dogName: string; offline: boolean;
}) {
  const router = useRouter();
  const { userId } = useSession();
  const [draft, setDraft] = useState('');
  const opening = useRef(false);
  const disabled = offline || !dogId || !userId;
  const send = () => {
    if (disabled || opening.current) return;
    const entryId = prepareHomeMessage(userId!, dogId, draft);
    if (!entryId) return;
    opening.current = true;
    router.push({ pathname: '/ask', params: { entryId } } as never);
    setDraft('');
    // Navigation is synchronous; the cleared input prevents a second submission.
    opening.current = false;
  };
  return (
    <View style={styles.card}>
      <View style={styles.heading}>
        <View style={styles.icon}><Ionicons name="chatbubble-ellipses-outline" size={21} color={colors.primary} /></View>
        <View style={styles.headingText}>
          <Text style={styles.title}>Parliamo di {dogName}</Text>
          <Text style={styles.subtitle}>Una domanda, un cambiamento, un momento insieme.</Text>
        </View>
      </View>
      <TextInput
        accessibilityLabel={'Scrivi a DOGly di ' + dogName}
        placeholder="Da cosa vuoi partire?"
        placeholderTextColor={colors.textMuted}
        value={draft}
        onChangeText={setDraft}
        maxLength={4000}
        multiline
        style={styles.input}
      />
      <View style={styles.footer}>
        <Pressable accessibilityRole="button" accessibilityLabel="Apri la conversazione con DOGly"
          onPress={() => router.push('/ask' as never)} disabled={disabled}
          style={({ pressed }) => [styles.open, disabled && styles.disabled, pressed && styles.pressed]}>
          <Text style={styles.openText}>Apri la conversazione</Text>
          <Ionicons name="arrow-forward" size={16} color={colors.primary} />
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="Invia messaggio a DOGly"
          accessibilityState={{ disabled: disabled || !draft.trim() }}
          onPress={send} disabled={disabled || !draft.trim()}
          style={({ pressed }) => [styles.send, (disabled || !draft.trim()) && styles.disabled, pressed && styles.pressed]}>
          <Ionicons name="arrow-up" size={21} color={colors.textOnPrimary} />
        </Pressable>
      </View>
    </View>
  );
}
const styles = StyleSheet.create({
  card: { padding: spacing.lg, gap: spacing.md, borderRadius: radius.lg, backgroundColor: colors.surface, borderWidth: 1, borderColor: '#BED7F2' },
  heading: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  headingText: { flex: 1, gap: 4 },
  icon: { width: 42, height: 42, borderRadius: radius.full, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
  title: { color: colors.text, fontSize: typography.size.lg, fontWeight: typography.weight.bold },
  subtitle: { color: colors.textSecondary, fontSize: typography.size.sm, lineHeight: 20 },
  input: { minHeight: 88, maxHeight: 160, textAlignVertical: 'top', color: colors.text, fontSize: typography.size.md, padding: spacing.md, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, backgroundColor: colors.background },
  footer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  open: { minHeight: 44, flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  openText: { flexShrink: 1, color: colors.primary, fontSize: typography.size.sm, fontWeight: typography.weight.semibold },
  send: { width: 48, height: 48, borderRadius: radius.full, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  disabled: { opacity: 0.45 }, pressed: { opacity: 0.8 },
});
