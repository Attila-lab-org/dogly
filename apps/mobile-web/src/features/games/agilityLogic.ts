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
// Salto più alto e leggibile: il giocatore ha una finestra reale per superare
// muretti e birilli anche su schermi piccoli o con un tap leggermente tardivo.
export const JUMP_MS = 760;
export const JUMP_HEIGHT_U = 36;

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

/**
 * Velocità smooth: 20 → 34 u/s su 90s. Il mondo cresce con calma, così il
 * salto resta leggibile anche alle prime partite.
 */
export function speedAt(elapsedMs: number): number {
  const progress = Math.min(1, Math.max(0, elapsedMs / 90_000));
  return 20 + progress * 14;
}

/**
 * Gap minimo di sicurezza tra due spawn: più spazio tra gli ostacoli e una
 * progressione che diventa impegnativa senza diventare frustrante.
 */
export function minGapMs(elapsedMs: number): number {
  const progress = Math.min(1, Math.max(0, elapsedMs / AGILITY_MAX_MS));
  return Math.round(1500 - progress * 500);
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
  options: { startAtMs?: number; startId?: number } = {},
): AgilityObstacle[] {
  const obstacles: AgilityObstacle[] = [];
  // Nessun ostacolo nei primi 2 secondi: il giocatore prende il ritmo.
  // Una partenza più ampia lascia il tempo di capire il gesto prima del primo ostacolo.
  let t = options.startAtMs ?? 3000;
  let id = options.startId ?? 0;
  while (t < durationMs - 600) {
    const speed = speedAt(t);
    // Nei primi passaggi insegniamo il gesto: il tunnel arriva dopo, così un
    // tap di prova non viene punito da una regola ancora non presentata.
    const kind = obstacles.length < 3
      ? (rng() < 0.55 ? 'hurdle' : 'cones')
      : rollKind(rng());
    obstacles.push({ id, kind, spawnAtMs: Math.round(t), speed });
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
 * Collisione AABB: tutti gli ostacoli si superano con lo stesso gesto,
 * il salto. Non esistono più regole separate per il tunnel.
 */
// Margine hitbox ridotto: il crash scatta solo quando l'ostacolo tocca
// davvero la sagoma del cane (col pass-through del salto, resta rilevante
// solo per gli impatti a terra — devono sembrare giusti a occhio).
export const HITBOX_MARGIN_U = 0.8;

/** Finestra di grazia: un tap entro 80ms dal contatto salva comunque il cane. */
export const COYOTE_MS = 80;

/**
 * Salto riuscito: se durante l'aria l'ostacolo è passato (anche solo per
 * uno spicchio) sotto il cane, è superato per intero. Un tap un po'
 * anticipato o in extremis non viene punito: conta l'intenzione del gesto.
 * Senza questa regola il tunnel a bassa velocità resta sotto il cane più
 * a lungo dell'aria del salto e risulterebbe impossibile.
 */
export function jumpCoversObstacle(
  jumpStartMs: number | null,
  obstacle: AgilityObstacle,
): boolean {
  if (jumpStartMs === null || obstacle.speed <= 0) return false;
  const spec = OBSTACLE_DIMS[obstacle.kind];
  const overlapStartMs =
    obstacle.spawnAtMs +
    ((AGILITY_FIELD_W - (DOG_X + DOG_W - HITBOX_MARGIN_U)) / obstacle.speed) * 1000;
  const overlapEndMs =
    obstacle.spawnAtMs +
    ((AGILITY_FIELD_W + spec.w - DOG_X - HITBOX_MARGIN_U) / obstacle.speed) * 1000;
  return jumpStartMs < overlapEndMs && jumpStartMs + JUMP_MS > overlapStartMs;
}

export function collides(
  dogY: number,
  obstacle: AgilityObstacle,
  nowMs: number,
  jumpStartMs: number | null = null,
): boolean {
  const spec = OBSTACLE_DIMS[obstacle.kind];
  const x = obstacleX(obstacle, nowMs);
  const overlapX =
    x < DOG_X + DOG_W - HITBOX_MARGIN_U && x + spec.w > DOG_X + HITBOX_MARGIN_U;
  if (!overlapX) return false;
  if (jumpCoversObstacle(jumpStartMs, obstacle)) return false;
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

/* ------------------------------------------------------------------ */
/* Ossi bonus in arcata (da raccogliere in salto) e near-miss.          */
/* ------------------------------------------------------------------ */

export interface BonusBone {
  /** Offset orizzontale (u) rispetto al punto di spawn dell'arcata. */
  dx: number;
  /** Altezza (u) del bocconcino: si raccoglie solo saltando. */
  y: number;
}

export interface BonusArc {
  id: number;
  spawnAtMs: number;
  speed: number;
  bones: BonusBone[];
}

/** Arcate di 2-3 ossi nei gap tra ostacoli (~40% dei gap), quota salto. */
export function buildBonusArcs(
  obstacles: AgilityObstacle[],
  rng: () => number,
): BonusArc[] {
  const arcs: BonusArc[] = [];
  for (let i = 0; i < obstacles.length - 1; i += 1) {
    if (rng() > 0.4) continue;
    const gapStart = obstacles[i].spawnAtMs;
    const gapEnd = obstacles[i + 1].spawnAtMs;
    const mid = gapStart + (gapEnd - gapStart) / 2;
    const speed = speedAt(mid);
    const count = 2 + Math.floor(rng() * 2);
    const bones: BonusBone[] = Array.from({ length: count }, (_, b) => {
      const u = count === 1 ? 0.5 : b / (count - 1);
      return {
        dx: 4 + u * 14,
        y: 10 + Math.sin(u * Math.PI) * 12,
      };
    });
    arcs.push({ id: arcs.length, spawnAtMs: Math.round(mid), speed, bones });
  }
  return arcs;
}

/** X di un osso bonus (stesso moto degli ostacoli). */
export function bonusBoneX(arc: BonusArc, bone: BonusBone, nowMs: number): number {
  const elapsed = Math.max(0, nowMs - arc.spawnAtMs);
  return AGILITY_FIELD_W + bone.dx - (elapsed / 1000) * arc.speed;
}

/** Osso raccolto: overlap orizzontale col cane e cane abbastanza in alto. */
export function boneCollected(dogY: number, boneY: number, boneX: number): boolean {
  const overlapX = boneX > DOG_X - 2 && boneX < DOG_X + DOG_W + 2;
  return overlapX && dogY >= boneY - 5;
}

/**
 * Near-miss: l'ostacolo passa sotto il cane a meno di 2u (~10%) dal
 * contatto — il cane era in aria ma di pochissimo.
 */
export function isNearMiss(dogYAtClear: number, kind: ObstacleKind): boolean {
  const margin = dogYAtClear - OBSTACLE_DIMS[kind].h;
  return dogYAtClear > 0 && margin <= 2;
}

/* ------------------------------------------------------------------ */
/* Sistema a vite (niente timer: si gioca finché ci sono cuori).        */
/* ------------------------------------------------------------------ */

export const AGILITY_LIVES = 3;
export const INVULNERABLE_MS = 1500;

export function livesAfterCrash(lives: number): number {
  return Math.max(0, lives - 1);
}

export function isGameOver(lives: number): boolean {
  return lives <= 0;
}

export function isInvulnerable(lastCrashAtMs: number | null, nowMs: number): boolean {
  return lastCrashAtMs !== null && nowMs - lastCrashAtMs < INVULNERABLE_MS;
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
export const AGILITY_TUNNEL_LINE = 'Il tunnel: si salta!';
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
