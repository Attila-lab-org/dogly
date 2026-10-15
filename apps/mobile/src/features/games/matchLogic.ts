/**
 * "Bau Match" — logica pura del Match-3 (griglia 6×7, board flat).
 * Init senza match e con mossa garantita, swap solo se crea match,
 * razzi per linee da 4+ (riga/colonna intera), cascata con gravity e
 * refill deterministico (RNG iniettato), reshuffle senza mosse.
 */
import type { KeyValueStorage } from '../checkin/persistence';

export const MATCH_COLS = 6;
export const MATCH_ROWS = 7;
export const MATCH_PIECES = 5;
export const BOARD_SIZE = MATCH_COLS * MATCH_ROWS;
export const MATCH_BLITZ_MS = 60_000;

export type Board = number[];

export function indexOf(row: number, col: number): number {
  return row * MATCH_COLS + col;
}

function rowOf(index: number): number {
  return Math.floor(index / MATCH_COLS);
}

function colOf(index: number): number {
  return index % MATCH_COLS;
}

/** Linee (>=3) orizzontali e verticali presenti nella board. */
export function findLines(board: Board): number[][] {
  const lines: number[][] = [];
  for (let row = 0; row < MATCH_ROWS; row += 1) {
    let start = 0;
    for (let col = 1; col <= MATCH_COLS; col += 1) {
      const same =
        col < MATCH_COLS && board[indexOf(row, col)] === board[indexOf(row, start)] && board[indexOf(row, col)] >= 0;
      if (!same) {
        if (col - start >= 3 && board[indexOf(row, start)] >= 0) {
          lines.push(
            Array.from({ length: col - start }, (_, i) => indexOf(row, start + i)),
          );
        }
        start = col;
      }
    }
  }
  for (let col = 0; col < MATCH_COLS; col += 1) {
    let start = 0;
    for (let row = 1; row <= MATCH_ROWS; row += 1) {
      const same =
        row < MATCH_ROWS && board[indexOf(row, col)] === board[indexOf(start, col)] && board[indexOf(row, col)] >= 0;
      if (!same) {
        if (row - start >= 3 && board[indexOf(start, col)] >= 0) {
          lines.push(
            Array.from({ length: row - start }, (_, i) => indexOf(start + i, col)),
          );
        }
        start = row;
      }
    }
  }
  return lines;
}

/**
 * Celle da scoppiare: tutte le linee, più — se una linea è da 4+ — la
 * riga o la colonna intera ("razzo").
 */
export function findClears(board: Board): { cells: Set<number>; rockets: number } {
  const cells = new Set<number>();
  let rockets = 0;
  for (const line of findLines(board)) {
    line.forEach((cell) => cells.add(cell));
    if (line.length >= 4) {
      rockets += 1;
      const horizontal = rowOf(line[0]) === rowOf(line[line.length - 1]);
      if (horizontal) {
        const row = rowOf(line[0]);
        for (let col = 0; col < MATCH_COLS; col += 1) cells.add(indexOf(row, col));
      } else {
        const col = colOf(line[0]);
        for (let row = 0; row < MATCH_ROWS; row += 1) cells.add(indexOf(row, col));
      }
    }
  }
  return { cells, rockets };
}

function wouldCreateMatchAt(board: Board, index: number): boolean {
  const piece = board[index];
  if (piece < 0) return false;
  const row = rowOf(index);
  const col = colOf(index);
  let run = 1;
  for (let c = col - 1; c >= 0 && board[indexOf(row, c)] === piece; c -= 1) run += 1;
  for (let c = col + 1; c < MATCH_COLS && board[indexOf(row, c)] === piece; c += 1) run += 1;
  if (run >= 3) return true;
  run = 1;
  for (let r = row - 1; r >= 0 && board[indexOf(r, col)] === piece; r -= 1) run += 1;
  for (let r = row + 1; r < MATCH_ROWS && board[indexOf(r, col)] === piece; r += 1) run += 1;
  return run >= 3;
}

export function areAdjacent(a: number, b: number): boolean {
  const dr = Math.abs(rowOf(a) - rowOf(b));
  const dc = Math.abs(colOf(a) - colOf(b));
  return dr + dc === 1;
}

/** Swap valido: adiacenti E almeno una delle due celle crea un match. */
export function isValidSwap(board: Board, a: number, b: number): boolean {
  if (!areAdjacent(a, b)) return false;
  if (board[a] === board[b]) return false;
  const next = [...board];
  [next[a], next[b]] = [next[b], next[a]];
  return wouldCreateMatchAt(next, a) || wouldCreateMatchAt(next, b);
}

export function swapCells(board: Board, a: number, b: number): Board {
  const next = [...board];
  [next[a], next[b]] = [next[b], next[a]];
  return next;
}

export function hasAnyMove(board: Board): boolean {
  for (let index = 0; index < BOARD_SIZE; index += 1) {
    const col = colOf(index);
    if (col < MATCH_COLS - 1 && isValidSwap(board, index, index + 1)) return true;
    if (rowOf(index) < MATCH_ROWS - 1 && isValidSwap(board, index, index + MATCH_COLS)) {
      return true;
    }
  }
  return false;
}

/** Board iniziale: nessun match presente e almeno una mossa possibile. */
export function randomBoard(rng: () => number): Board {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    const board: Board = Array.from(
      { length: BOARD_SIZE },
      () => Math.floor(rng() * MATCH_PIECES) % MATCH_PIECES,
    );
    // Ripara eventuali match iniziali sostituendo le celle coinvolte.
    for (let fix = 0; fix < 50; fix += 1) {
      const lines = findLines(board);
      if (lines.length === 0) break;
      for (const line of lines) {
        for (const cell of line) {
          board[cell] =
            (board[cell] + 1 + Math.floor(rng() * (MATCH_PIECES - 1))) % MATCH_PIECES;
        }
      }
    }
    if (findLines(board).length === 0 && hasAnyMove(board)) return board;
  }
  // Fallback pragmatico: board casuale con reshuffle applicato a valle.
  return Array.from(
    { length: BOARD_SIZE },
    () => Math.floor(rng() * MATCH_PIECES) % MATCH_PIECES,
  );
}

/** Rimescola le tessere esistenti finché c'è almeno una mossa. */
export function reshuffle(board: Board, rng: () => number): Board {
  const pieces = [...board];
  for (let attempt = 0; attempt < 200; attempt += 1) {
    for (let i = pieces.length - 1; i > 0; i -= 1) {
      const j = Math.floor(rng() * (i + 1));
      [pieces[i], pieces[j]] = [pieces[j], pieces[i]];
    }
    if (hasAnyMove(pieces)) return [...pieces];
  }
  return pieces;
}

export interface DropResult {
  board: Board;
  /** Nuova posizione → celle scese (per lo stagger delle cadute). */
  falls: Map<number, number>;
  refilled: number[];
}

/** Rimuove le celle, fa cadere per gravità e riempie dall'alto (RNG). */
export function removeDropRefill(board: Board, cells: Set<number>, rng: () => number): DropResult {
  const next: Board = [...board];
  cells.forEach((cell) => {
    next[cell] = -1;
  });
  const falls = new Map<number, number>();
  const refilled: number[] = [];
  for (let col = 0; col < MATCH_COLS; col += 1) {
    const stack: number[] = [];
    for (let row = MATCH_ROWS - 1; row >= 0; row -= 1) {
      const value = next[indexOf(row, col)];
      if (value >= 0) stack.push(value);
    }
    for (let row = MATCH_ROWS - 1; row >= 0; row -= 1) {
      const target = indexOf(row, col);
      const before = next[target];
      if (stack.length > 0) {
        const value = stack.shift() as number;
        next[target] = value;
        if (before !== value) falls.set(target, 1);
      } else {
        next[target] = Math.floor(rng() * MATCH_PIECES) % MATCH_PIECES;
        refilled.push(target);
        falls.set(target, 2);
      }
    }
  }
  return { board: next, falls, refilled };
}

export interface CascadeResult {
  board: Board;
  /** Celle scoppiate per catena (indice 0 = prima catena). */
  chainClears: Set<number>[];
  rockets: number;
}

/** Risolve tutte le cascate da una board: loop match → drop → refill. */
export function resolveCascades(board: Board, rng: () => number): CascadeResult {
  let current = [...board];
  const chainClears: Set<number>[] = [];
  let rockets = 0;
  for (let chain = 0; chain < 20; chain += 1) {
    const { cells, rockets: chainRockets } = findClears(current);
    if (cells.size === 0) break;
    rockets += chainRockets;
    chainClears.push(cells);
    current = removeDropRefill(current, cells, rng).board;
  }
  return { board: current, chainClears, rockets };
}

/** Punteggio di una catena: celle scoppiate × moltiplicatore catena. */
export function chainScore(cleared: number, chainIndex: number): number {
  return cleared * (chainIndex + 1);
}

/** Frase di Buddy in prima persona per fascia di punteggio. */
export function matchEndgameLine(score: number): string {
  if (score <= 40) return 'Le zampine mi si sono incrociate…';
  if (score <= 120) return 'Che pioggia di biscotti!';
  return 'BAU MATCH LEGGENDARIO! Re del parco giochi!';
}

/** Telecronaca di Buddy. */
export const MATCH_START_LINE = 'Occhio alle tessere: scambia e scoppia!';
export const MATCH_CHAIN_LINES: readonly string[] = [
  'Catena x2!',
  'Catena x3!',
  'Catena pazzesca!',
];
export const MATCH_ROCKET_LINE = 'Razzo! Tutta la fila!';
export const MATCH_RESHUFFLE_LINE = 'Rimescolo le tessere!';
export const MATCH_FINAL_SECONDS = 'Ultimi dieci: corri!';

/* ------------------------------------------------------------------ */
/* Best score per cane (pattern checkin/persistence)                    */
/* ------------------------------------------------------------------ */

let injectedBackend: KeyValueStorage | null = null;

/** Test/dev: inietta uno storage in-memory invece di AsyncStorage. */
export function setMatchStorageBackend(backend: KeyValueStorage | null): void {
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
  return `games:match-best:v1:${dogId?.trim() || 'default'}`;
}

export async function loadMatchBest(dogId?: string): Promise<number> {
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

export async function saveMatchBest(
  score: number,
  dogId?: string,
): Promise<number> {
  const previous = await loadMatchBest(dogId);
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
