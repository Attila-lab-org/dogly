/**
 * Test logica "Fiuto da campione": rampa round, shuffle tracciabile
 * (la posizione finale del bocconcino è sempre corretta riapplicando
 * gli scambi), scoring/streak, frasi finali, best score per cane.
 */
import {
  SNIFF_CUPS,
  SNIFF_ROUNDS,
  applyMove,
  buildSniffRound,
  loadSniffBest,
  moveDurationMs,
  movesForRound,
  saveSniffBest,
  setSniffStorageBackend,
  sniffEndgameLine,
  sniffRoundPoints,
} from '../features/games/sniffLogic';

function memoryStorage() {
  const map = new Map<string, string>();
  return {
    getItem: async (key: string) => map.get(key) ?? null,
    setItem: async (key: string, value: string) => {
      map.set(key, value);
    },
  };
}

function steppedRng(start = 0.31, step = 0.29): () => number {
  let value = start;
  return () => {
    value = (value + step) % 1;
    return value;
  };
}

afterEach(() => setSniffStorageBackend(null));

describe('round ramp', () => {
  it('ramps moves 3 → 6 and durations 620 → 320', () => {
    expect(movesForRound(1)).toBe(3);
    expect(movesForRound(3)).toBe(4);
    expect(movesForRound(7)).toBe(6);
    expect(movesForRound(10)).toBe(6);
    expect(moveDurationMs(1)).toBe(620);
    expect(moveDurationMs(SNIFF_ROUNDS)).toBe(320);
    expect(moveDurationMs(5)).toBeGreaterThan(320);
    expect(moveDurationMs(5)).toBeLessThan(620);
  });
});

describe('shuffle tracking', () => {
  it('is deterministic with the same RNG', () => {
    expect(buildSniffRound(4, steppedRng())).toEqual(
      buildSniffRound(4, steppedRng()),
    );
  });

  it('final treat slot always matches replaying the moves', () => {
    for (let round = 1; round <= SNIFF_ROUNDS; round += 1) {
      for (let seed = 0; seed < 20; seed += 1) {
        let value = seed / 20;
        const rng = () => {
          value = (value * 9301 + 49297) % 233280 / 233280;
          return value;
        };
        const sniffRound = buildSniffRound(round, rng);
        // Replay manuale: traccio la ciotola che nasconde il bocconcino.
        let slots = [0, 1, 2];
        const treatCup = slots[sniffRound.treatStartSlot];
        for (const move of sniffRound.moves) {
          slots = applyMove(slots, move);
        }
        expect(slots[sniffRound.treatFinalSlot]).toBe(treatCup);
        expect(sniffRound.treatFinalSlot).toBeGreaterThanOrEqual(0);
        expect(sniffRound.treatFinalSlot).toBeLessThan(SNIFF_CUPS);
      }
    }
  });

  it('moves swap exactly two distinct slots', () => {
    const sniffRound = buildSniffRound(6, steppedRng());
    for (const move of sniffRound.moves) {
      expect(move.a).not.toBe(move.b);
      expect(move.a).toBeGreaterThanOrEqual(0);
      expect(move.b).toBeLessThan(SNIFF_CUPS);
    }
  });

  it('applyMove swaps the two slots', () => {
    expect(applyMove([0, 1, 2], { a: 0, b: 2, durationMs: 500 })).toEqual([2, 1, 0]);
    expect(applyMove([2, 1, 0], { a: 1, b: 2, durationMs: 500 })).toEqual([2, 0, 1]);
  });
});

describe('scoring', () => {
  it('awards +1 per correct round and +1 bonus on streak 3+', () => {
    expect(sniffRoundPoints(false, 5)).toBe(0);
    expect(sniffRoundPoints(true, 1)).toBe(1);
    expect(sniffRoundPoints(true, 2)).toBe(1);
    expect(sniffRoundPoints(true, 3)).toBe(2);
    expect(sniffRoundPoints(true, 7)).toBe(2);
  });
});

describe('endgame and best', () => {
  it('maps score bands to voice lines', () => {
    expect(sniffEndgameLine(1)).toContain('pranzo');
    expect(sniffEndgameLine(5)).toContain('quasi');
    expect(sniffEndgameLine(9)).toContain('FIUTO DA CAMPIONE');
  });

  it('keeps only the best score per dog', async () => {
    setSniffStorageBackend(memoryStorage());
    expect(await loadSniffBest('dog-1')).toBe(0);
    expect(await saveSniffBest(6, 'dog-1')).toBe(6);
    expect(await saveSniffBest(3, 'dog-1')).toBe(6);
    expect(await loadSniffBest('dog-1')).toBe(6);
    expect(await loadSniffBest('dog-2')).toBe(0);
  });
});
