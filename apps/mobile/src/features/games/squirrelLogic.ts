/**
 * "Scoiattolo!" — logica pura del mini-gioco (30s a partita).
 * Schedule degli spawn deterministico con RNG iniettato (test),
 * rampa di difficoltà smooth, scoring con scoiattolo dorato (+3) e
 * riccio amico (−2, mai punitivo), best score persistito per cane.
 */
import type { KeyValueStorage } from '../checkin/persistence';

export const SQUIRREL_GAME_DURATION_MS = 30_000;
export const SQUIRREL_HOLES = 9;

export type CreatureKind = 'squirrel' | 'golden' | 'hedgehog';

export interface SpawnEvent {
  id: number;
  /** Indice buca 0..8 (griglia 3×3, row-major). */
  holeIndex: number;
  kind: CreatureKind;
  spawnAtMs: number;
  visibleMs: number;
}

/** Intervallo spawn: 900ms → 450ms lungo la partita (curva lineare smooth). */
export function spawnIntervalMs(elapsedMs: number): number {
  const progress = Math.min(1, Math.max(0, elapsedMs / SQUIRREL_GAME_DURATION_MS));
  return Math.round(900 - progress * 450);
}

/** Tempo in vista: 1100ms → 600ms. */
export function visibleDurationMs(elapsedMs: number): number {
  const progress = Math.min(1, Math.max(0, elapsedMs / SQUIRREL_GAME_DURATION_MS));
  return Math.round(1100 - progress * 500);
}

function rollKind(roll: number): CreatureKind {
  if (roll < 0.15) return 'hedgehog';
  if (roll < 0.25) return 'golden';
  return 'squirrel';
}

/**
 * Schedule completo della partita. Mai due spawn consecutivi nella stessa
 * buca; i tipi seguono le probabilità (riccio 15%, dorato 10%).
 */
export function buildSpawnSchedule(
  rng: () => number,
  durationMs: number = SQUIRREL_GAME_DURATION_MS,
): SpawnEvent[] {
  const events: SpawnEvent[] = [];
  let t = 350;
  let id = 0;
  let lastHole = -1;
  while (t < durationMs - 400) {
    let holeIndex = Math.floor(rng() * SQUIRREL_HOLES) % SQUIRREL_HOLES;
    if (holeIndex === lastHole) {
      holeIndex = (holeIndex + 1 + Math.floor(rng() * (SQUIRREL_HOLES - 1))) % SQUIRREL_HOLES;
    }
    lastHole = holeIndex;
    events.push({
      id,
      holeIndex,
      kind: rollKind(rng()),
      spawnAtMs: Math.round(t),
      visibleMs: visibleDurationMs(t),
    });
    id += 1;
    t += spawnIntervalMs(t);
  }
  return events;
}

export function scoreFor(kind: CreatureKind): number {
  if (kind === 'golden') return 3;
  if (kind === 'hedgehog') return -2;
  return 1;
}

/** Il punteggio non scende mai sotto zero: niente punitività. */
export function applyScore(score: number, kind: CreatureKind): number {
  return Math.max(0, score + scoreFor(kind));
}

/** Frase di Oreo in prima persona per fascia di punteggio. */
export function squirrelEndgameLine(score: number): string {
  if (score <= 5) return 'Mi sono distratto dalle farfalle…';
  if (score <= 12) return 'Il parco ci teme!';
  return 'SCOIA-TTO-LO! Domani gli porto il trofeo.';
}

/** Telecronaca di Oreo durante la partita (chip sopra il campo). */
export const COMMENTARY_START = 'Pronti? Gli scoiattoli non aspettano!';
export const COMMENTARY_FINAL_SECONDS = 'Corri corri!';
export const COMMENTARY_HIT_LINES: readonly string[] = [
  'Preso!',
  'Che riflessi!',
  'Questo non scappava!',
];
export const COMMENTARY_GOLDEN = 'DORATO! +3!';
export const COMMENTARY_HEDGEHOG = 'No! Quello è un amico!';
export const COMMENTARY_MISS_LINES: readonly string[] = [
  'Ah, rientrato…',
  'Veloce quel furbetto!',
];

export function commentaryFor(kind: CreatureKind, random: () => number = Math.random): string {
  if (kind === 'golden') return COMMENTARY_GOLDEN;
  if (kind === 'hedgehog') return COMMENTARY_HEDGEHOG;
  const index = Math.min(
    COMMENTARY_HIT_LINES.length - 1,
    Math.floor(random() * COMMENTARY_HIT_LINES.length),
  );
  return COMMENTARY_HIT_LINES[index];
}

/* ------------------------------------------------------------------ */
/* Best score per cane (pattern checkin/persistence: backend iniettabile) */
/* ------------------------------------------------------------------ */

let injectedBackend: KeyValueStorage | null = null;

/** Test/dev: inietta uno storage in-memory invece di AsyncStorage. */
export function setSquirrelStorageBackend(backend: KeyValueStorage | null): void {
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
  return `games:squirrel-best:v1:${dogId?.trim() || 'default'}`;
}

export async function loadSquirrelBest(dogId?: string): Promise<number> {
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

/** Salva solo se è un nuovo record (best score, non ultimo punteggio). */
export async function saveSquirrelBest(
  score: number,
  dogId?: string,
): Promise<number> {
  const previous = await loadSquirrelBest(dogId);
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
