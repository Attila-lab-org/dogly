let updateCheck: Promise<void> | null = null;

/**
 * Scarica in background un OTA disponibile. Non ricarica la sessione corrente:
 * il bundle verrà applicato al successivo avvio nativo, senza interrompere
 * login, upload o altre operazioni dell'utente.
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
  })().finally(() => {
    updateCheck = null;
  });

  return updateCheck;
}
