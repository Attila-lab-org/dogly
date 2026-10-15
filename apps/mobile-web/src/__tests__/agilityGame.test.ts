/**
 * Test logica "Agility Oreo": rampa velocità, schedule con gap di
 * sicurezza, fisica del salto, collisioni (muretto/birilli/tunnel),
 * combo scoring, frasi finali, best score per cane.
 */
import {
  AGILITY_MAX_MS,
  DOG_H,
  OBSTACLE_DIMS,
  agilityEndgameLine,
  buildAgilitySchedule,
  collides,
  isCleared,
  isCombo,
  jumpHeightAt,
  loadAgilityBest,
  minGapMs,
  obstacleX,
  pointsForClear,
  saveAgilityBest,
  setAgilityStorageBackend,
  speedAt,
  type AgilityObstacle,
} from '../features/games/agilityLogic';

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

afterEach(() => setAgilityStorageBackend(null));

describe('speed ramp', () => {
  it('ramps 28 → 52 u/s smoothly and clamps', () => {
    expect(speedAt(0)).toBe(28);
    expect(speedAt(AGILITY_MAX_MS)).toBe(52);
    expect(speedAt(AGILITY_MAX_MS / 2)).toBe(40);
    expect(speedAt(-5)).toBe(28);
    expect(speedAt(AGILITY_MAX_MS * 2)).toBe(52);
    expect(minGapMs(0)).toBe(1050);
    expect(minGapMs(AGILITY_MAX_MS)).toBe(700);
  });
});

describe('schedule', () => {
  it('is deterministic with the same RNG', () => {
    expect(buildAgilitySchedule(steppedRng())).toEqual(
      buildAgilitySchedule(steppedRng()),
    );
  });

  it('never spawns closer than the safety gap', () => {
    const obstacles = buildAgilitySchedule(Math.random);
    expect(obstacles.length).toBeGreaterThanOrEqual(30);
    for (let i = 1; i < obstacles.length; i += 1) {
      const gap = obstacles[i].spawnAtMs - obstacles[i - 1].spawnAtMs;
      expect(gap).toBeGreaterThanOrEqual(minGapMs(obstacles[i - 1].spawnAtMs));
    }
    expect(obstacles.every((o) => o.spawnAtMs < AGILITY_MAX_MS)).toBe(true);
  });

  it('mixes hurdle, cones and tunnel', () => {
    const kinds = new Set(buildAgilitySchedule(Math.random).map((o) => o.kind));
    expect(kinds.size).toBe(3);
  });
});

describe('jump physics', () => {
  it('parabola: 0 at start/end, peak in the middle', () => {
    expect(jumpHeightAt(null, 100)).toBe(0);
    expect(jumpHeightAt(1000, 1000)).toBe(0);
    expect(jumpHeightAt(1000, 1000 + 650)).toBe(0);
    const mid = jumpHeightAt(1000, 1000 + 325);
    expect(mid).toBeCloseTo(26, 0);
    const quarter = jumpHeightAt(1000, 1000 + 162.5);
    expect(quarter).toBeGreaterThan(0);
    expect(quarter).toBeLessThan(mid);
  });
});

describe('collisions', () => {
  const at = (kind: AgilityObstacle['kind'], spawnAtMs: number): AgilityObstacle => ({
    id: 0,
    kind,
    spawnAtMs,
    speed: 40,
  });
  // 40 u/s: l'ostacolo copre il cane (x 18) dopo (100-18-8)/40 = 1.85s → uso 1.9s
  const hitTime = (spawnAtMs: number) => spawnAtMs + 1900;

  it('grounded dog hits hurdle and cones, clears them when jumping high', () => {
    const hurdle = at('hurdle', 0);
    const now = hitTime(0);
    expect(obstacleX(hurdle, now)).toBeLessThan(26);
    expect(collides(0, hurdle, now)).toBe(true);
    expect(collides(OBSTACLE_DIMS.hurdle.h + 2, hurdle, now)).toBe(false);
    const cones = at('cones', 0);
    expect(collides(0, cones, now)).toBe(true);
  });

  it('tunnel is reversed: safe grounded, crash when airborne', () => {
    const tunnel = at('tunnel', 0);
    const now = hitTime(0);
    expect(collides(0, tunnel, now)).toBe(false);
    expect(collides(10, tunnel, now)).toBe(true);
  });

  it('cleared means fully past the dog', () => {
    const hurdle = at('hurdle', 0);
    expect(isCleared(hurdle, hitTime(0))).toBe(false);
    expect(isCleared(hurdle, 4000)).toBe(true);
  });
});

describe('combo scoring', () => {
  it('doubles from the sixth consecutive clear', () => {
    expect(pointsForClear(0)).toBe(1);
    expect(pointsForClear(4)).toBe(1);
    expect(pointsForClear(5)).toBe(2);
    expect(pointsForClear(9)).toBe(2);
    expect(isCombo(5)).toBe(true);
    expect(isCombo(4)).toBe(false);
  });
});

describe('endgame and best', () => {
  it('maps score bands to voice lines', () => {
    expect(agilityEndgameLine(3)).toContain('birilli');
    expect(agilityEndgameLine(15)).toContain('Zampe');
    expect(agilityEndgameLine(30)).toContain('AGILITY');
  });

  it('keeps only the best score per dog', async () => {
    setAgilityStorageBackend(memoryStorage());
    expect(await loadAgilityBest('dog-1')).toBe(0);
    expect(await saveAgilityBest(9, 'dog-1')).toBe(9);
    expect(await saveAgilityBest(4, 'dog-1')).toBe(9);
    expect(await loadAgilityBest('dog-1')).toBe(9);
    expect(await loadAgilityBest('dog-2')).toBe(0);
  });
});
