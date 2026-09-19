import React, { useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useRouter } from 'expo-router';

import { Button, ScreenContainer } from '@/components';
import { StackScreenHeader } from '@/features/secondary/components';
import { colors, radius, spacing, typography } from '@/theme/tokens';

export default function FoodBarcodeScreen() {
  const router = useRouter();
  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState(false);
  const [manual, setManual] = useState('');

  const continueWith = (raw: string) => {
    const code = raw.replace(/\D/g, '');
    if (code.length < 8 || scanned) return;
    setScanned(true);
    router.replace({
      pathname: '/nutrition/foods/new' as never,
      params: { scannedBarcode: code },
    });
  };

  return (
    <ScreenContainer scroll contentStyle={styles.content}>
      <StackScreenHeader title="Codice a barre" />
      <Text style={styles.title}>Inquadra il codice</Text>
      <Text style={styles.subtitle}>
        Dogly cercherà il prodotto esatto e ti mostrerà anche le possibili
        varianti prima di salvare.
      </Text>

      {!permission?.granted ? (
        <View style={styles.permission}>
          <Text style={styles.permissionText}>
            Serve la fotocamera per leggere il codice.
          </Text>
          <Button title="Apri la fotocamera" onPress={() => void requestPermission()} />
        </View>
      ) : (
        <View style={styles.cameraFrame}>
          <CameraView
            style={styles.camera}
            facing="back"
            barcodeScannerSettings={{
              barcodeTypes: ['ean13', 'ean8', 'upc_a', 'upc_e'],
            }}
            onBarcodeScanned={
              scanned ? undefined : ({ data }) => continueWith(data)
            }
          />
          <View pointerEvents="none" style={styles.guide} />
        </View>
      )}

      <Text style={styles.or}>Oppure scrivilo</Text>
      <View style={styles.row}>
        <TextInput
          accessibilityLabel="Codice a barre"
          value={manual}
          onChangeText={setManual}
          placeholder="Numero sotto le linee"
          placeholderTextColor={colors.textMuted}
          keyboardType="number-pad"
          style={styles.input}
        />
        <Button
          title="Vai"
          disabled={manual.replace(/\D/g, '').length < 8 || scanned}
          onPress={() => continueWith(manual)}
        />
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  content: { gap: spacing.md, paddingBottom: spacing.xxxl },
  title: {
    color: colors.text,
    fontSize: typography.size.xl,
    fontWeight: typography.weight.bold,
  },
  subtitle: {
    color: colors.textSecondary,
    fontSize: typography.size.sm,
    lineHeight: typography.size.sm * typography.lineHeight.relaxed,
  },
  permission: {
    gap: spacing.md,
    padding: spacing.lg,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
  },
  permissionText: { color: colors.text, fontSize: typography.size.sm },
  cameraFrame: {
    height: 280,
    overflow: 'hidden',
    borderRadius: radius.lg,
    backgroundColor: '#0F172A',
  },
  camera: { width: '100%', height: '100%' },
  guide: {
    position: 'absolute',
    left: '10%',
    right: '10%',
    top: '35%',
    height: 84,
    borderWidth: 2,
    borderColor: colors.textOnPrimary,
    borderRadius: radius.sm,
  },
  or: {
    color: colors.textSecondary,
    fontSize: typography.size.xs,
    textAlign: 'center',
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  input: {
    flex: 1,
    minWidth: 0,
    minHeight: 52,
    paddingHorizontal: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    color: colors.text,
    fontSize: typography.size.md,
  },
});
