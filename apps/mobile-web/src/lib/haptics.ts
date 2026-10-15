/**
 * Haptics leggere (expo-haptics), solo nativa: su web l'import dinamico
 * non parte mai. Ogni chiamata è best-effort e silenziosa.
 */
import { Platform } from 'react-native';

async function haptics() {
  if (Platform.OS === 'web') return null;
  try {
    return await import('expo-haptics');
  } catch {
    return null;
  }
}

/** Tap su tab, chip, selezioni piccole. */
export async function hapticLight(): Promise<void> {
  const mod = await haptics();
  if (!mod) return;
  try {
    await mod.impactAsync(mod.ImpactFeedbackStyle.Light);
  } catch {
    // best-effort
  }
}

/** Completamento azioni: segna fatto, invio messaggio, record nei giochi. */
export async function hapticSuccess(): Promise<void> {
  const mod = await haptics();
  if (!mod) return;
  try {
    await mod.notificationAsync(mod.NotificationFeedbackType.Success);
  } catch {
    // best-effort
  }
}

/** Selezione fine (swap tessere, cambio opzione). */
export async function hapticSelection(): Promise<void> {
  const mod = await haptics();
  if (!mod) return;
  try {
    await mod.selectionAsync();
  } catch {
    // best-effort
  }
}
