/**
 * Nome del proprietario — PATCH /v1/me.display_name.
 */
import React, { useEffect, useState } from 'react';
import { Alert, StyleSheet, Text, TextInput } from 'react-native';
import { useRouter } from 'expo-router';
import { Button, ScreenContainer } from '@/components';
import { colors, radius, spacing, typography } from '@/theme/tokens';
import { StackScreenHeader } from '@/features/secondary/components';
import { useMeProfile, useUpdateMeProfile } from '@/features/me/api';

export default function AccountNameScreen() {
  const router = useRouter();
  const profileQuery = useMeProfile();
  const updateMutation = useUpdateMeProfile();
  const [name, setName] = useState(profileQuery.data?.display_name ?? '');

  useEffect(() => {
    if (profileQuery.data?.display_name != null) {
      setName(profileQuery.data.display_name);
    }
  }, [profileQuery.data?.display_name]);

  const save = async () => {
    try {
      await updateMutation.mutateAsync({
        display_name: name.trim() || null,
      });
      router.back();
    } catch {
      Alert.alert(
        'Salvataggio non riuscito',
        'Controlla la connessione e riprova.',
      );
    }
  };

  return (
    <ScreenContainer scroll>
      <StackScreenHeader title="Il tuo nome" />
      <Text style={styles.hint}>
        DOGly userà questo nome quando ti parla. Non è un dato anagrafico.
      </Text>
      <Text style={styles.label}>Come ti chiami</Text>
      <TextInput
        value={name}
        onChangeText={setName}
        placeholder="Es. Attila"
        placeholderTextColor={colors.textMuted}
        autoCapitalize="words"
        style={styles.input}
        testID="owner-display-name"
      />
      <Button
        title="Salva"
        loading={updateMutation.isPending || profileQuery.isLoading}
        onPress={() => void save()}
      />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  hint: {
    fontSize: typography.size.sm,
    color: colors.textSecondary,
    marginBottom: spacing.lg,
  },
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
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    marginBottom: spacing.lg,
    fontSize: typography.size.md,
    color: colors.text,
    backgroundColor: colors.surface,
  },
});
