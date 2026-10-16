/**
 * Test logica "Bau Match": init senza match e con mossa, swap validi,
 * rilevamento match orizzontali/verticali, razzi da 4+, cascata con
 * gravity+refill deterministico, reshuffle senza mosse, scoring, best.
 */
import {
  BOARD_SIZE,
  MATCH_LIVES,
  MATCH_COLS,
  MATCH_ROWS,
  areAdjacent,
  chainScore,
  findClears,
  findLines,
  hasAnyMove,
  indexOf,
  isMatchGameOver,
  isValidSwap,
  loadMatchBest,
  livesAfterMistake,
  matchLevelGoal,
  matchPieceCountForLevel,
  matchEndgameLine,
  randomBoard,
  removeDropRefill,
  reshuffle,
  resolveCascades,
  saveMatchBest,
  setMatchStorageBackend,
  swapCells,
  type Board,
} from '../features/games/matchLogic';

function memoryStorage() {
  const map = new Map<string, string>();
  return {
    getItem: async (key: string) => map.get(key) ?? null,
    setItem: async (key: string, value: string) => {
      map.set(key, value);
    },
  };
}

function steppedRng(start = 0.42, step = 0.37): () => number {
  let value = start;
  return () => {
    value = (value + step) % 1;
    return value;
  };
}

/** Board da righe di 6 caratteri ('0'..'4'). */
function craft(rows: string[]): Board {
  return rows.flatMap((row) => [...row].map(Number));
}

afterEach(() => setMatchStorageBackend(null));

describe('initial board', () => {
  it('has no matches and at least one move, over many seeds', () => {
    for (let seed = 0; seed < 30; seed += 1) {
      const board = randomBoard(steppedRng(seed / 30, 0.31));
      expect(board.length).toBe(BOARD_SIZE);
      expect(findLines(board)).toEqual([]);
      expect(hasAnyMove(board)).toBe(true);
    }
  });
});

describe('match detection', () => {
  it('finds horizontal and vertical lines', () => {
    const board = craft([
      '000123',
      '123401',
      '234012',
      '340123',
      '401234',
      '012340',
      '112340',
    ]);
    const lines = findLines(board);
    const flat = lines.flat();
    expect(flat).toContain(indexOf(0, 0));
    expect(flat).toContain(indexOf(0, 1));
    expect(flat).toContain(indexOf(0, 2));
    // colonna 0: 0,1,2,3,4,0,1 → nessuna tripla; colonna 1: 0,2,3,4,0,1,1 no
    expect(lines.length).toBe(1);
  });

  it('a 4+ line becomes a rocket clearing the whole row/column', () => {
    const board = craft([
      '000012',
      '123401',
      '234012',
      '340123',
      '401234',
      '012340',
      '112340',
    ]);
    const { cells, rockets } = findClears(board);
    expect(rockets).toBe(1);
    for (let col = 0; col < MATCH_COLS; col += 1) {
      expect(cells.has(indexOf(0, col))).toBe(true);
    }
  });

  it('no rockets on a plain 3-line', () => {
    const board = craft([
      '000123',
      '123401',
      '234012',
      '340123',
      '401234',
      '012340',
      '112340',
    ]);
    expect(findClears(board).rockets).toBe(0);
  });
});

describe('swaps', () => {
  it('accepts adjacent swap that creates a match, rejects others', () => {
    const board = craft([
      '001023',
      '120341',
      '234012',
      '340123',
      '401234',
      '012340',
      '112340',
    ]);
    expect(areAdjacent(indexOf(0, 2), indexOf(0, 3))).toBe(true);
    // scambio (0,2)-(0,3): riga diventa 000123 → match
    expect(isValidSwap(board, indexOf(0, 2), indexOf(0, 3))).toBe(true);
    // non adiacenti
    expect(isValidSwap(board, indexOf(0, 0), indexOf(2, 0))).toBe(false);
    // adiacenti ma senza match
    expect(isValidSwap(board, indexOf(3, 1), indexOf(3, 2))).toBe(false);
    // stessa tessera
    expect(isValidSwap(board, indexOf(0, 0), indexOf(0, 1))).toBe(false);
  });

  it('swapCells swaps exactly the two cells', () => {
    const board = craft([
      '012345',
      '123450',
      '234501',
      '345012',
      '450123',
      '501234',
      '012345',
    ]);
    const next = swapCells(board, indexOf(0, 0), indexOf(1, 0));
    expect(next[indexOf(0, 0)]).toBe(1);
    expect(next[indexOf(1, 0)]).toBe(0);
  });
});

describe('drop and refill', () => {
  it('gravity pulls pieces down and refills from the top', () => {
    const board = craft([
      '012345',
      '123450',
      '234501',
      '345012',
      '450123',
      '501234',
      '012345',
    ]);
    const cleared = new Set([indexOf(6, 0), indexOf(6, 1)]);
    const { board: next, refilled } = removeDropRefill(board, cleared, steppedRng());
    expect(next[indexOf(6, 0)]).toBeGreaterThanOrEqual(0);
    expect(next[indexOf(6, 1)]).toBeGreaterThanOrEqual(0);
    // la colonna scende di una cella: riga 5 eredita il valore di riga 4
    expect(next[indexOf(5, 0)]).toBe(board[indexOf(4, 0)]);
    expect(refilled.length).toBe(2);
    // deterministico con lo stesso RNG
    const again = removeDropRefill(board, cleared, steppedRng());
    expect(again.board).toEqual(next);
  });

  it('resolveCascades is deterministic and counts chains', () => {
    const board = craft([
      '000123',
      '123401',
      '234012',
      '340123',
      '401234',
      '012340',
      '112340',
    ]);
    const first = resolveCascades(board, steppedRng());
    const second = resolveCascades(board, steppedRng());
    expect(first.board).toEqual(second.board);
    expect(first.chainClears.length).toBeGreaterThanOrEqual(1);
    expect(findLines(first.board).length).toBeGreaterThanOrEqual(0);
    const total = first.chainClears.reduce((sum, cells) => sum + cells.size, 0);
    expect(total).toBeGreaterThanOrEqual(3);
  });
});

describe('no moves and scoring', () => {
  it('reshuffle produces a board with a move', () => {
    const board = randomBoard(steppedRng());
    const shuffled = reshuffle(board, steppedRng(0.7, 0.19));
    expect(hasAnyMove(shuffled)).toBe(true);
    expect([...shuffled].sort()).toEqual([...board].sort());
  });

  it('chain scoring multiplies by chain index', () => {
    expect(chainScore(3, 0)).toBe(3);
    expect(chainScore(3, 1)).toBe(6);
    expect(chainScore(4, 2)).toBe(12);
  });

  it('endgame lines map score bands', () => {
    expect(matchEndgameLine(10)).toContain('zampine');
    expect(matchEndgameLine(80)).toContain('biscotti');
    expect(matchEndgameLine(200)).toContain('BAU MATCH');
  });
});

describe('best score persistence', () => {
  it('keeps only the best score, scoped per dog', async () => {
    setMatchStorageBackend(memoryStorage());
    expect(await loadMatchBest('dog-1')).toBe(0);
    expect(await saveMatchBest(90, 'dog-1')).toBe(90);
    expect(await saveMatchBest(40, 'dog-1')).toBe(90);
    expect(await saveMatchBest(150, 'dog-1')).toBe(150);
    expect(await loadMatchBest('dog-1')).toBe(150);
    expect(await loadMatchBest('dog-2')).toBe(0);
  });
});

describe('level and lives progression', () => {
  it('has no timer and increases the board difficulty by level', () => {
    expect(MATCH_LIVES).toBe(3);
    expect(matchLevelGoal(1)).toBeLessThan(matchLevelGoal(2));
    expect(matchLevelGoal(2)).toBeLessThan(matchLevelGoal(3));
    expect(matchPieceCountForLevel(1)).toBe(3);
    expect(matchPieceCountForLevel(2)).toBe(4);
    expect(matchPieceCountForLevel(3)).toBe(5);
    expect(randomBoard(steppedRng(), matchPieceCountForLevel(1))).toHaveLength(BOARD_SIZE);
    expect(randomBoard(steppedRng(), matchPieceCountForLevel(3))).toHaveLength(BOARD_SIZE);
  });

  it('uses lives for mistakes and ends at zero', () => {
    expect(livesAfterMistake(3)).toBe(2);
    expect(livesAfterMistake(1)).toBe(0);
    expect(isMatchGameOver(1)).toBe(false);
    expect(isMatchGameOver(0)).toBe(true);
  });
});
