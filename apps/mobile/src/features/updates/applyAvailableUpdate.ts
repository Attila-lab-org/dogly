import * as Updates from 'expo-updates';

let updateCheck: Promise<void> | null = null;

/**
 * Standalone builds must not remain indefinitely on their embedded bundle.
 * EAS still performs its native launch check; this explicit check makes the
 * result deterministic when the app was installed or resumed during publish.
 */
export function applyAvailableUpdate(): Promise<void> {
  if (__DEV__ || !Updates.isEnabled) {
    return Promise.resolve();
  }
  if (updateCheck) return updateCheck;

  updateCheck = (async () => {
    const result = await Updates.checkForUpdateAsync();
    if (!result.isAvailable) return;

    await Updates.fetchUpdateAsync();
    await Updates.reloadAsync();
  })().finally(() => {
    updateCheck = null;
  });

  return updateCheck;
}
