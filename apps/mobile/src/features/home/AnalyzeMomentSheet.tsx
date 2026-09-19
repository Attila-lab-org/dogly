/**
 * Scelta rapida Video / Audio dopo “Analizza un momento”.
 * Le foto restano solo sul flusso digestivo.
 */
import React from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius, shadows, spacing, typography } from '../../theme/tokens';

export function AnalyzeMomentSheet({
  visible,
  dogName,
  onClose,
  onVideo,
  onAudio,
}: {
  visible: boolean;
  dogName: string;
  onClose: () => void;
  onVideo: () => void;
  onAudio: () => void;
}) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Chiudi"
          onPress={onClose}
          style={StyleSheet.absoluteFill}
        />
        <View style={styles.sheet} accessibilityViewIsModal>
          <View style={styles.handle} />
          <Text style={styles.title}>Come vuoi mostrarmi {dogName}?</Text>
          <Text style={styles.subtitle}>Un tap e partiamo.</Text>
          <View style={styles.row}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Registra un video"
              onPress={onVideo}
              style={({ pressed }) => [styles.choice, pressed && styles.pressed]}
            >
              <View style={styles.choiceIcon}>
                <Ionicons name="videocam" size={26} color={colors.primary} />
              </View>
              <Text style={styles.choiceTitle}>Video</Text>
              <Text style={styles.choiceHint}>Guardo il momento</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Parla con DOGly"
              onPress={onAudio}
              style={({ pressed }) => [styles.choice, pressed && styles.pressed]}
            >
              <View style={styles.choiceIcon}>
                <Ionicons name="mic" size={26} color={colors.accent} />
              </View>
              <Text style={styles.choiceTitle}>Audio</Text>
              <Text style={styles.choiceHint}>Mi racconti cosa succede</Text>
            </Pressable>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Annulla"
            onPress={onClose}
            hitSlop={8}
            style={styles.cancel}
          >
            <Text style={styles.cancelText}>Annulla</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(14, 42, 71, 0.35)',
  },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xxl,
    ...shadows.raised,
  },
  handle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
    marginBottom: spacing.md,
  },
  title: {
    fontSize: typography.size.lg,
    fontWeight: typography.weight.bold,
    color: colors.text,
    textAlign: 'center',
  },
  subtitle: {
    marginTop: spacing.xs,
    marginBottom: spacing.lg,
    fontSize: typography.size.sm,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  row: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  choice: {
    flex: 1,
    alignItems: 'center',
    backgroundColor: colors.background,
    borderRadius: radius.md,
    paddingVertical: spacing.xl,
    paddingHorizontal: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  pressed: {
    opacity: 0.88,
    transform: [{ scale: 0.98 }],
  },
  choiceIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
    ...shadows.card,
  },
  choiceTitle: {
    fontSize: typography.size.md,
    fontWeight: typography.weight.bold,
    color: colors.text,
  },
  choiceHint: {
    marginTop: 4,
    fontSize: typography.size.xs,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  cancel: {
    marginTop: spacing.md,
    alignItems: 'center',
    paddingVertical: spacing.sm,
  },
  cancelText: {
    fontSize: typography.size.sm,
    fontWeight: typography.weight.semibold,
    color: colors.textMuted,
  },
});
