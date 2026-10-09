export type RetryableMessage = {
  id: string;
  retryForId?: string;
};

/**
 * Removes the failed assistant row and the user row that produced it.
 * Retrying a turn must replace the failed attempt instead of duplicating it.
 */
export function removeFailedRetryPair<T extends RetryableMessage>(
  messages: T[],
  failedMessageId: string,
): T[] {
  const failed = messages.find((message) => message.id === failedMessageId);
  const retryForId = failed?.retryForId;
  return messages.filter(
    (message) =>
      message.id !== failedMessageId &&
      (!retryForId || message.id !== retryForId),
  );
}
