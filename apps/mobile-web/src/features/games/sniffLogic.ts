/**
 * "Fiuto da campione" — logica pura del memory delle ciotole.
 * Shuffle tracciabile: la posizione finale del bocconcino è sempre nota
 * (sequenza di scambi applicata alle posizioni, mai random a posteriori).
 * Scoring con streak bonus, hint "Naso di Oreo" (1 per partita).
 * RNG iniettato per i test.
 */
import type { KeyValueStorage } from '../checkin/persistence';

export const SNIFF_ROUNDS = 10;
export const SNIFF_CUPS = 3;

export interface ShuffleMove {
  /** Indici di slot (0..2) scambiati. */
  a: number;
  b: number;
  durationMs: number;
}

export interface SniffRound {
  round: number;
  /** Slot in cui il bocconcino viene coperto (prima dello shuffle). */
  treatStartSlot: number;
  moves: ShuffleMove[];
  /** Slot finale in cui si trova il bocconcino (derivato, mai inventato). */
  treatFinalSlot: number;
}

/** Numero scambi per round: 3 → 6 (uno in più ogni ~2 round). */
export function movesForRound(round: number): number {
  return Math.min(6, 3 + Math.floor((round - 1) / 2));
}

/** Durata di uno scambio: 620 → 320 ms lungo la partita. */
export function moveDurationMs(round: number): number {
  const progress = Math.min(1, Math.max(0, (round - 1) / (SNIFF_ROUNDS - 1)));
  return Math.round(620 - progress * 300);
}

/**
 * Applica uno scambio alle posizioni: slots[i] = indice ciotola nello slot i.
 */
export function applyMove(slots: readonly number[], move: ShuffleMove): number[] {
  const next = [...slots];
  [next[move.a], next[move.b]] = [next[move.b], next[move.a]];
  return next;
}

/** Costruisce il round: ciotola col bocconcino + scambi + posizione finale. */
export function buildSniffRound(round: number, rng: () => number): SniffRound {
  const treatCup = Math.floor(rng() * SNIFF_CUPS) % SNIFF_CUPS;
  // Posizione iniziale: le ciotole partono ordinate (slot i = ciotola i).
  const treatStartSlot = treatCup;
  const moveCount = movesForRound(round);
  const duration = moveDurationMs(round);
  let slots = [0, 1, 2];
  const moves: ShuffleMove[] = [];
  let lastA = -1;
  let lastB = -1;
  for (let i = 0; i < moveCount; i += 1) {
    let a = Math.floor(rng() * SNIFF_CUPS) % SNIFF_CUPS;
    let b = (a + 1 + Math.floor(rng() * (SNIFF_CUPS - 1))) % SNIFF_CUPS;
    // Evita di invertire subito lo stesso scambio (più leggibile a occhio).
    if (moves.length > 0 && a === lastB && b === lastA) {
      b = (b + 1) % SNIFF_CUPS;
      if (b === a) b = (b + 1) % SNIFF_CUPS;
    }
    const move = { a, b, durationMs: duration };
    slots = applyMove(slots, move);
    moves.push(move);
    lastA = a;
    lastB = b;
  }
  return {
    round,
    treatStartSlot,
    moves,
    treatFinalSlot: slots.indexOf(treatCup),
  };
}

/** Punti del round: +1 se indovinato, +1 bonus con streak 3+. */
export function sniffRoundPoints(correct: boolean, streakAfter: number): number {
  if (!correct) return 0;
  return streakAfter >= 3 ? 2 : 1;
}

/** Frase di Oreo in prima persona per fascia di punteggio. */
export function sniffEndgameLine(score: number): string {
  if (score <= 3) return 'Il naso era in pausa pranzo…';
  if (score <= 7) return 'Naso quasi da campione!';
  return 'FIUTO DA CAMPIONE! Bocconcini per tutti!';
}

/** Telecronaca di Oreo. */
export const SNIFF_START_LINE = 'Annusa bene…';
export const SNIFF_CORRECT_LINES: readonly string[] = [
  'Era lì!',
  'Naso infallibile!',
  'Lo sapevo io!',
];
export const SNIFF_WRONG_LINES: readonly string[] = [
  'Oh! Il mio naso non sbaglia quasi mai.',
  'Mi ha fregato lo shuffle!',
];
export const SNIFF_HINT_LINE = 'Fiuto! È quella che si muove.';

/* ------------------------------------------------------------------ */
/* Best score per cane (pattern checkin/persistence)                    */
/* ------------------------------------------------------------------ */

let injectedBackend: KeyValueStorage | null = null;

/** Test/dev: inietta uno storage in-memory invece di AsyncStorage. */
export function setSniffStorageBackend(backend: KeyValueStorage | null): void {
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
  return `games:sniff-best:v1:${dogId?.trim() || 'default'}`;
}

export async function loadSniffBest(dogId?: string): Promise<number> {
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

export async function saveSniffBest(
  score: number,
  dogId?: string,
): Promise<number> {
  const previous = await loadSniffBest(dogId);
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
