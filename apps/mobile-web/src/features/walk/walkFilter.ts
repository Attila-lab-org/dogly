/**
 * Filtro qualità dello storico passeggiate: le micro-uscite di prova
 * (<30s E <50m) non sono ricordi — non si salvano e non compaiono in UI.
 * Le soglie restano in un posto solo: cambiarle qui cambia ovunque.
 */
export const MIN_WALK_SECONDS = 30;
export const MIN_WALK_METERS = 50;

/** True se l'uscita è un ricordo degno dello storico. */
export function isMeaningfulWalk(walk: {
  duration_seconds: number;
  distance_meters: number;
}): boolean {
  return (
    walk.duration_seconds >= MIN_WALK_SECONDS ||
    walk.distance_meters >= MIN_WALK_METERS
  );
}

/** True se l'uscita è troppo breve per essere salvata. */
export function isTrivialWalk(walk: {
  duration_seconds: number;
  distance_meters: number;
}): boolean {
  return !isMeaningfulWalk(walk);
}
