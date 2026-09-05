import React, { useState } from 'react';
import { StyleSheet, Text, TextInput } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Button, ScreenContainer } from '@/components';
import { colors, radius, spacing, typography } from '@/theme/tokens';
import { StackScreenHeader } from '@/features/secondary/components';
import { albumsMock } from '@/mocks/photos';
import { DOG_ID } from '@/mocks/core';

export default function CreateAlbumScreen() {
  const { dogId } = useLocalSearchParams<{ dogId: string }>();
  const router = useRouter();
  const [title, setTitle] = useState('');

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
        disabled={!title.trim()}
        onPress={() => {
          const id = `album-${Date.now()}`;
          albumsMock.unshift({
            id,
            dogId: dogId ?? DOG_ID,
            title: title.trim(),
            coverPhotoId: null,
            photoCount: 0,
            defaultVisibility: 'private',
            createdAt: new Date().toISOString(),
          });
          router.replace(`/dogs/${dogId}/album/${id}` as never);
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
