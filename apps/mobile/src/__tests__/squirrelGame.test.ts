/**
 * Test logica "Scoiattolo!": schedule deterministico con RNG iniettato,
 * rampa difficoltà, scoring dorato/riccio (mai sotto zero), frasi finali
 * per fascia, best score persistito per cane (storage iniettabile).
 */
import {
  SQUIRREL_GAME_DURATION_MS,
  applyScore,
  buildSpawnSchedule,
  loadSquirrelBest,
  saveSquirrelBest,
  scoreFor,
  setSquirrelStorageBackend,
  spawnIntervalMs,
  squirrelEndgameLine,
  visibleDurationMs,
} from '../features/games/squirrelLogic';

function memoryStorage() {
  const map = new Map<string, string>();
  return {
    getItem: async (key: string) => map.get(key) ?? null,
    setItem: async (key: string, value: string) => {
      map.set(key, value);
    },
  };
}

/** RNG deterministico a passo fisso per i test. */
function steppedRng(start = 0.42, step = 0.37): () => number {
  let value = start;
  return () => {
    value = (value + step) % 1;
    return value;
  };
}

afterEach(() => setSquirrelStorageBackend(null));

describe('difficulty ramp', () => {
  it('ramps spawn interval 900→450 and visibility 1100→600 smoothly', () => {
    expect(spawnIntervalMs(0)).toBe(900);
    expect(spawnIntervalMs(SQUIRREL_GAME_DURATION_MS)).toBe(450);
    expect(spawnIntervalMs(SQUIRREL_GAME_DURATION_MS / 2)).toBe(675);
    expect(visibleDurationMs(0)).toBe(1100);
    expect(visibleDurationMs(SQUIRREL_GAME_DURATION_MS)).toBe(600);
    // clamp oltre i bordi
    expect(spawnIntervalMs(-100)).toBe(900);
    expect(spawnIntervalMs(SQUIRREL_GAME_DURATION_MS * 2)).toBe(450);
  });
});

describe('spawn schedule', () => {
  it('is deterministic with the same RNG', () => {
    const a = buildSpawnSchedule(steppedRng());
    const b = buildSpawnSchedule(steppedRng());
    expect(a).toEqual(b);
  });

  it('fills the match with increasing, in-bounds spawns', () => {
    const events = buildSpawnSchedule(Math.random);
    expect(events.length).toBeGreaterThanOrEqual(35);
    expect(events.length).toBeLessThanOrEqual(60);
    for (let i = 0; i < events.length; i += 1) {
      const event = events[i];
      expect(event.holeIndex).toBeGreaterThanOrEqual(0);
      expect(event.holeIndex).toBeLessThan(9);
      expect(event.spawnAtMs).toBeLessThan(SQUIRREL_GAME_DURATION_MS);
      if (i > 0) {
        expect(event.spawnAtMs).toBeGreaterThan(events[i - 1].spawnAtMs);
        // mai due spawn consecutivi nella stessa buca
        expect(event.holeIndex).not.toBe(events[i - 1].holeIndex);
      }
    }
  });

  it('spawns faster near the end than at the start', () => {
    const events = buildSpawnSchedule(Math.random);
    const firstGaps = events.slice(1, 5).map((e, i) => e.spawnAtMs - events[i].spawnAtMs);
    const lastGaps = events
      .slice(-4)
      .map((e, i, arr) => (i === 0 ? e.spawnAtMs - events[events.length - 4].spawnAtMs : e.spawnAtMs - arr[i - 1].spawnAtMs));
    const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
    expect(avg(lastGaps)).toBeLessThan(avg(firstGaps));
  });

  it('rolls creature kinds with the expected mix', () => {
    // RNG costante 0.05 → sempre riccio; 0.2 → sempre dorato; 0.9 → scoiattolo
    const hedgehogs = buildSpawnSchedule(() => 0.05);
    expect(hedgehogs.every((e) => e.kind === 'hedgehog')).toBe(true);
    const goldens = buildSpawnSchedule(() => 0.2);
    expect(goldens.every((e) => e.kind === 'golden')).toBe(true);
    const squirrels = buildSpawnSchedule(() => 0.9);
    expect(squirrels.every((e) => e.kind === 'squirrel')).toBe(true);
  });
});

describe('scoring', () => {
  it('scores squirrel +1, golden +3, hedgehog −2 floored at zero', () => {
    expect(scoreFor('squirrel')).toBe(1);
    expect(scoreFor('golden')).toBe(3);
    expect(scoreFor('hedgehog')).toBe(-2);
    expect(applyScore(0, 'hedgehog')).toBe(0);
    expect(applyScore(1, 'hedgehog')).toBe(0);
    expect(applyScore(5, 'golden')).toBe(8);
    expect(applyScore(4, 'squirrel')).toBe(5);
  });
});

describe('endgame lines', () => {
  it('maps score bands to Oreo voice lines', () => {
    expect(squirrelEndgameLine(0)).toContain('farfalle');
    expect(squirrelEndgameLine(5)).toContain('farfalle');
    expect(squirrelEndgameLine(6)).toContain('parco');
    expect(squirrelEndgameLine(12)).toContain('parco');
    expect(squirrelEndgameLine(13)).toContain('trofeo');
  });
});

describe('best score persistence', () => {
  it('keeps only the best score, scoped per dog', async () => {
    setSquirrelStorageBackend(memoryStorage());
    expect(await loadSquirrelBest('dog-1')).toBe(0);
    expect(await saveSquirrelBest(7, 'dog-1')).toBe(7);
    expect(await saveSquirrelBest(3, 'dog-1')).toBe(7);
    expect(await saveSquirrelBest(12, 'dog-1')).toBe(12);
    expect(await loadSquirrelBest('dog-1')).toBe(12);
    expect(await loadSquirrelBest('dog-2')).toBe(0);
  });
});
