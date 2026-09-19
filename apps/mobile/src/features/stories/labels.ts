/** Etichetta corta sotto l’avatar: didascalia, oppure Oggi/Ieri. */
export function storyRailLabel(
  story: { caption?: string; createdAt: string },
  now: Date = new Date(),
): string {
  const caption = story.caption?.trim();
  if (caption) {
    const word = caption.split(/\s+/)[0] ?? caption;
    return word.length > 14 ? `${word.slice(0, 13)}…` : word;
  }
  const created = new Date(story.createdAt);
  if (Number.isNaN(created.getTime())) return 'Storia';
  const startOf = (d: Date) =>
    Date.parse(
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`,
    );
  const diffDays = Math.round((startOf(now) - startOf(created)) / (24 * 60 * 60 * 1000));
  if (diffDays <= 0) return 'Oggi';
  if (diffDays === 1) return 'Ieri';
  return 'Storia';
}
