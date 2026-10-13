import React, { useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useSession } from '../auth/SessionProvider';
import { prepareHomeMessage } from '../realtime/homeMessage';
import { colors, radius, spacing, typography } from '../../theme/tokens';

export function HomeConversation({ dogId, dogName, offline, onShowMoment }: {
  dogId: string; dogName: string; offline: boolean; onShowMoment: () => void;
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
      <TextInput
        accessibilityLabel={'Scrivi a DOGly di ' + dogName}
        placeholder={`Come sta ${dogName} oggi?`}
        placeholderTextColor={colors.textMuted}
        value={draft}
        onChangeText={setDraft}
        maxLength={4000}
        multiline
        style={styles.input}
      />
      <View style={styles.footer}>
        <View style={styles.tools}>
          <Pressable accessibilityRole="button" accessibilityLabel="Mostra un video" onPress={onShowMoment} disabled={disabled} style={styles.tool}>
            <Ionicons name="images-outline" size={23} color={colors.text} />
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel="Apri la conversazione vocale con DOGly" onPress={() => router.push('/ask' as never)} disabled={disabled} style={styles.tool}>
            <Ionicons name="mic-outline" size={23} color={colors.text} />
          </Pressable>
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel="Invia messaggio a DOGly"
          accessibilityState={{ disabled: disabled || !draft.trim() }}
          onPress={send} disabled={disabled || !draft.trim()}
          style={({ pressed }) => [styles.send, (disabled || !draft.trim()) && styles.disabled, pressed && styles.pressed]}>
          <Ionicons name="arrow-forward" size={21} color={colors.textOnPrimary} />
        </Pressable>
      </View>
    </View>
  );
}
const styles = StyleSheet.create({
  card: { padding: spacing.md, gap: spacing.xs, borderRadius: 22, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  input: { minHeight: 58, maxHeight: 160, textAlignVertical: 'top', color: colors.text, fontSize: typography.size.sm, padding: spacing.xs },
  footer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  tools: { flexDirection: 'row', gap: 6 },
  tool: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  send: { width: 44, height: 44, borderRadius: radius.full, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
  disabled: { opacity: 0.45 }, pressed: { opacity: 0.8 },
});
