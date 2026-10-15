/**
 * "Agility Oreo" — logica pura del runner (unità virtuali: campo 100u,
 * la schermata mappa a pixel). Spawn con gap di sicurezza, rampa di
 * velocità smooth, fisica del salto parabolico, collisione AABB,
 * scoring con combo. RNG iniettato per i test.
 */
import type { KeyValueStorage } from '../checkin/persistence';

export const AGILITY_MAX_MS = 60_000;
export const AGILITY_FIELD_W = 100;
export const DOG_X = 18;
export const DOG_W = 8;
export const DOG_H = 10;
export const JUMP_MS = 650;
export const JUMP_HEIGHT_U = 26;

export type ObstacleKind = 'hurdle' | 'cones' | 'tunnel';

export interface ObstacleSpec {
  w: number;
  h: number;
}

export const OBSTACLE_DIMS: Record<ObstacleKind, ObstacleSpec> = {
  hurdle: { w: 5, h: 11 },
  cones: { w: 6, h: 13 },
  tunnel: { w: 12, h: 16 },
};

export interface AgilityObstacle {
  id: number;
  kind: ObstacleKind;
  /** Istante in cui l'ostacolo entra in campo dal bordo destro. */
  spawnAtMs: number;
  /** Velocità (u/s) al momento dello spawn. */
  speed: number;
}

/** Velocità smooth: 28 → 52 u/s su 60s. */
export function speedAt(elapsedMs: number): number {
  const progress = Math.min(1, Math.max(0, elapsedMs / AGILITY_MAX_MS));
  return 28 + progress * 24;
}

/**
 * Gap minimo di sicurezza tra due spawn (in ms di percorrenza alla
 * velocità corrente): 1050 → 700 ms, così il salto è sempre giocabile.
 */
export function minGapMs(elapsedMs: number): number {
  const progress = Math.min(1, Math.max(0, elapsedMs / AGILITY_MAX_MS));
  return Math.round(1050 - progress * 350);
}

function rollKind(roll: number): ObstacleKind {
  if (roll < 0.55) return 'hurdle';
  if (roll < 0.8) return 'cones';
  return 'tunnel';
}

/** Schedule ostacoli: mai meno del gap di sicurezza tra uno e l'altro. */
export function buildAgilitySchedule(
  rng: () => number,
  durationMs: number = AGILITY_MAX_MS,
): AgilityObstacle[] {
  const obstacles: AgilityObstacle[] = [];
  let t = 800;
  let id = 0;
  while (t < durationMs - 600) {
    const speed = speedAt(t);
    obstacles.push({ id, kind: rollKind(rng()), spawnAtMs: Math.round(t), speed });
    id += 1;
    const gap = minGapMs(t) + rng() * 650;
    t += gap;
  }
  return obstacles;
}

/** X dell'ostacolo (bordo sinistro) in unità: entra da 100 e va a sinistra. */
export function obstacleX(obstacle: AgilityObstacle, nowMs: number): number {
  const elapsed = Math.max(0, nowMs - obstacle.spawnAtMs);
  return AGILITY_FIELD_W - (elapsed / 1000) * obstacle.speed;
}

/** Altezza del salto (u) in un dato istante: parabola 0 → picco → 0. */
export function jumpHeightAt(jumpStartMs: number | null, nowMs: number): number {
  if (jumpStartMs === null) return 0;
  const u = (nowMs - jumpStartMs) / JUMP_MS;
  if (u <= 0 || u >= 1) return 0;
  return 4 * JUMP_HEIGHT_U * u * (1 - u);
}

export function isJumping(jumpStartMs: number | null, nowMs: number): boolean {
  return jumpHeightAt(jumpStartMs, nowMs) > 0;
}

/**
 * Collisione AABB: ostacolo nel range del cane e cane "basso" per
 * muretto/birilli; per il tunnel vale l'opposto: se sei in aria mentre
 * lo attraversi, sbatti la testa.
 */
export function collides(
  dogY: number,
  obstacle: AgilityObstacle,
  nowMs: number,
): boolean {
  const spec = OBSTACLE_DIMS[obstacle.kind];
  const x = obstacleX(obstacle, nowMs);
  const overlapX = x < DOG_X + DOG_W && x + spec.w > DOG_X;
  if (!overlapX) return false;
  if (obstacle.kind === 'tunnel') {
    return dogY > 2;
  }
  return dogY < spec.h;
}

/** Ostacolo superato (uscito a sinistra del cane senza collisione). */
export function isCleared(obstacle: AgilityObstacle, nowMs: number): boolean {
  const spec = OBSTACLE_DIMS[obstacle.kind];
  return obstacleX(obstacle, nowMs) + spec.w < DOG_X;
}

/** Punti per l'ostacolo appena superato: combo x2 dal sesto consecutivo. */
export function pointsForClear(streakBefore: number): number {
  return streakBefore >= 5 ? 2 : 1;
}

export function isCombo(streakBefore: number): boolean {
  return streakBefore >= 5;
}

/** Frase di Oreo in prima persona per fascia di punteggio. */
export function agilityEndgameLine(score: number): string {
  if (score <= 8) return 'Mi sono fermato a annusare i birilli…';
  if (score <= 20) return 'Zampe veloci, cuore felice!';
  return 'AGILITY CHAMPION! La coppa è nostra!';
}

/** Telecronaca di Oreo. */
export const AGILITY_START_LINE = 'Al via! Corri con me!';
export const AGILITY_JUMP_LINES: readonly string[] = ['Salto!', 'Via!', 'Su!'];
export const AGILITY_TUNNEL_LINE = 'Il tunnel: si passa dentro!';
export const AGILITY_COMBO_LINE = 'Combo x2!';

/* ------------------------------------------------------------------ */
/* Best score per cane (pattern checkin/persistence)                    */
/* ------------------------------------------------------------------ */

let injectedBackend: KeyValueStorage | null = null;

/** Test/dev: inietta uno storage in-memory invece di AsyncStorage. */
export function setAgilityStorageBackend(backend: KeyValueStorage | null): void {
  injectedBackend = backend;
}

async function storage(): Promise<KeyValueStorage | null> {
  if (injectedBackend) return injectedBackend;
  try {
    const mod = await import('@react-native-async-storage/async-storage');
    return mod.default;
  } catch {
    return null;
  }
}

function bestKey(dogId?: string): string {
  return `games:agility-best:v1:${dogId?.trim() || 'default'}`;
}

export async function loadAgilityBest(dogId?: string): Promise<number> {
  const store = await storage();
  if (!store) return 0;
  try {
    const raw = await store.getItem(bestKey(dogId));
    const value = raw ? Number.parseInt(raw, 10) : 0;
    return Number.isFinite(value) && value > 0 ? value : 0;
  } catch {
    return 0;
  }
}

export async function saveAgilityBest(
  score: number,
  dogId?: string,
): Promise<number> {
  const previous = await loadAgilityBest(dogId);
  const best = Math.max(previous, score);
  const store = await storage();
  if (store && best !== previous) {
    try {
      await store.setItem(bestKey(dogId), String(best));
    } catch {
      // persistenza best-effort
    }
  }
  return best;
}
