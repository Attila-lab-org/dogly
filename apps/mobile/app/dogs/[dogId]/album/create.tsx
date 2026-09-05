import React, { useState } from 'react';
import { Alert, StyleSheet, Text, TextInput } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Button, ScreenContainer } from '@/components';
import { colors, radius, spacing, typography } from '@/theme/tokens';
import { StackScreenHeader } from '@/features/secondary/components';
import { createAlbum } from '@/features/photos/api';

export default function CreateAlbumScreen() {
  const { dogId } = useLocalSearchParams<{ dogId: string }>();
  const router = useRouter();
  const [title, setTitle] = useState('');
  const [saving, setSaving] = useState(false);

  return (
    <ScreenContainer>
      <StackScreenHeader title="Nuovo album" />
      <Text style={styles.label}>Titolo</Text>
      <TextInput
        value={title}
        onChangeText={setTitle}
        placeholder="Es. Momenti, Passeggiate"
        placeholderTextColor={colors.textMuted}
        style={styles.input}
      />
      <Button
        title="Crea"
        disabled={!title.trim() || !dogId}
        loading={saving}
        onPress={async () => {
          if (!dogId) return;
          setSaving(true);
          try {
            const album = await createAlbum(dogId, title);
            router.replace(`/dogs/${dogId}/album/${album.id}` as never);
          } catch {
            Alert.alert('Album non creato', 'Riprova tra poco.');
          } finally {
            setSaving(false);
          }
        }}
      />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  label: {
    fontSize: typography.size.sm,
    fontWeight: typography.weight.semibold,
    color: colors.text,
    marginBottom: spacing.xs,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.xl,
    color: colors.text,
    backgroundColor: colors.surface,
  },
});
