import React, { useRef, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useSession } from '../auth/SessionProvider';
import { prepareHomeMessage } from '../realtime/homeMessage';
import { colors, radius, spacing, typography } from '../../theme/tokens';

export function HomeConversation({
  dogId,
  dogName,
  offline,
}: {
  dogId: string;
  dogName: string;
  offline: boolean;
}) {
  const router = useRouter();
  const { userId } = useSession();
  const [draft, setDraft] = useState('');
  const opening = useRef(false);
  const disabled = offline || !dogId || !userId;

  const openAsk = (entryId?: string, intent?: 'photo' | 'voice') => {
    if (disabled || opening.current) return;
    opening.current = true;
    router.push({
      pathname: '/ask',
      params: {
        ...(entryId ? { entryId } : {}),
        ...(intent ? { intent } : {}),
      },
    } as never);
    opening.current = false;
  };

  const send = () => {
    if (disabled || opening.current) return;
    const entryId = prepareHomeMessage(userId!, dogId, draft);
    if (!entryId) return;
    setDraft('');
    openAsk(entryId);
  };

  return (
    <View style={styles.card}>
      <TextInput
        accessibilityLabel={`Scrivi a DOGly di ${dogName}`}
        placeholder="Scrivi qui…"
        placeholderTextColor={colors.textMuted}
        value={draft}
        onChangeText={setDraft}
        maxLength={4000}
        multiline
        style={styles.input}
      />
      <View style={styles.footer}>
        <View style={styles.tools}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Mostra una foto a DOGly"
            onPress={() => openAsk(undefined, 'photo')}
            disabled={disabled}
            style={({ pressed }) => [styles.tool, disabled && styles.disabled, pressed && styles.pressed]}
          >
            <Ionicons name="images-outline" size={22} color={colors.text} />
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Parla con DOGly"
            onPress={() => openAsk(undefined, 'voice')}
            disabled={disabled}
            style={({ pressed }) => [styles.tool, disabled && styles.disabled, pressed && styles.pressed]}
          >
            <Ionicons name="mic-outline" size={22} color={colors.text} />
          </Pressable>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Invia messaggio a DOGly"
          accessibilityState={{ disabled: disabled || !draft.trim() }}
          onPress={send}
          disabled={disabled || !draft.trim()}
          style={({ pressed }) => [
            styles.send,
            (disabled || !draft.trim()) && styles.disabled,
            pressed && styles.pressed,
          ]}
        >
          <Ionicons name="arrow-forward" size={20} color={colors.textOnPrimary} />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: spacing.md,
    gap: spacing.xs,
    borderRadius: 22,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: '#1A2B48',
    shadowOpacity: 0.04,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  input: {
    minHeight: 52,
    maxHeight: 140,
    textAlignVertical: 'top',
    color: colors.text,
    fontSize: typography.size.md,
    paddingHorizontal: spacing.xs,
    paddingVertical: spacing.sm,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  tools: { flexDirection: 'row', gap: 4 },
  tool: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.full,
  },
  send: {
    width: 48,
    height: 48,
    borderRadius: radius.full,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  disabled: { opacity: 0.4 },
  pressed: { opacity: 0.78 },
});
