let updateCheck: Promise<void> | null = null;

/**
 * Standalone builds must not remain indefinitely on their embedded bundle.
 * EAS still performs its native launch check; this explicit check makes the
 * result deterministic when the app was installed or resumed during publish.
 */
export function applyAvailableUpdate(): Promise<void> {
  if (__DEV__) {
    return Promise.resolve();
  }
  if (updateCheck) return updateCheck;

  updateCheck = (async () => {
    // Some development clients intentionally omit ExpoUpdates. Importing it at
    // module load would crash before __DEV__ can bypass the OTA check.
    const Updates = await import('expo-updates');
    if (!Updates.isEnabled) return;

    const result = await Updates.checkForUpdateAsync();
    if (!result.isAvailable) return;

    await Updates.fetchUpdateAsync();
    await Updates.reloadAsync();
  })().finally(() => {
    updateCheck = null;
  });

  return updateCheck;
}
