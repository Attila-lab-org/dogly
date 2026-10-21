/**
 * Test logica "Agility Oreo": rampa velocità, schedule con gap di
 * sicurezza, fisica del salto, collisioni (muretto/birilli/tunnel),
 * combo scoring, frasi finali, best score per cane.
 */
import {
  AGILITY_MAX_MS,
  COYOTE_MS,
  DOG_H,
  DOG_W,
  DOG_X,
  HITBOX_MARGIN_U,
  OBSTACLE_DIMS,
  boneCollected,
  bonusBoneX,
  buildBonusArcs,
  agilityEndgameLine,
  buildAgilitySchedule,
  collides,
  isCleared,
  isCombo,
  isNearMiss,
  jumpCoversObstacle,
  jumpHeightAt,
  loadAgilityBest,
  minGapMs,
  obstacleX,
  pointsForClear,
  AGILITY_LIVES,
  isGameOver,
  isInvulnerable,
  livesAfterCrash,
  saveAgilityBest,
  setAgilityStorageBackend,
  speedAt,
  type AgilityObstacle,
  type ObstacleKind,
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

describe('speed ramp (rebalanced: easier, lives instead of timer)', () => {
  it('ramps 20 → 34 u/s over 90s and clamps', () => {
    expect(speedAt(0)).toBe(20);
    expect(speedAt(45_000)).toBe(27);
    expect(speedAt(90_000)).toBe(34);
    expect(speedAt(-5)).toBe(20);
    expect(speedAt(500_000)).toBe(34);
  });

  it('keeps the safety gap +15% wider than before', () => {
    expect(minGapMs(0)).toBe(1500);
    expect(minGapMs(AGILITY_MAX_MS)).toBe(1000);
  });
});

describe('schedule', () => {
  it('is deterministic with the same RNG', () => {
    expect(buildAgilitySchedule(steppedRng())).toEqual(
      buildAgilitySchedule(steppedRng()),
    );
  });

  it('never spawns closer than the safety gap and nothing in the first 2s', () => {
    const obstacles = buildAgilitySchedule(Math.random);
    expect(obstacles[0].spawnAtMs).toBeGreaterThanOrEqual(2000);
    expect(obstacles.length).toBeGreaterThanOrEqual(25);
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
    expect(jumpHeightAt(1000, 1000 + 760)).toBe(0);
    const mid = jumpHeightAt(1000, 1000 + 380);
    expect(mid).toBeCloseTo(36, 0);
    const quarter = jumpHeightAt(1000, 1000 + 190);
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

  it('keeps the dog safe when airborne over the obstacle, crashes if landed before it arrives', () => {
    const hurdle = at('hurdle', 0);
    const now = hitTime(0);
    // Salto in corso durante il contatto: nessun crash anche in discesa.
    expect(collides(0, hurdle, now, now - 500)).toBe(false);
    // Salto finito prima che l'ostacolo arrivi: il cane è a terra e urta.
    expect(collides(0, hurdle, now, now - 1000)).toBe(true);
  });

  it('tunnel follows the same jump rule as every other obstacle', () => {
    const tunnel = at('tunnel', 0);
    const now = hitTime(0);
    expect(collides(0, tunnel, now)).toBe(true);
    expect(collides(OBSTACLE_DIMS.tunnel.h + 2, tunnel, now)).toBe(false);
  });

  it('cleared means fully past the dog', () => {
    const hurdle = at('hurdle', 0);
    expect(isCleared(hurdle, hitTime(0))).toBe(false);
    expect(isCleared(hurdle, 4000)).toBe(true);
  });
});

describe('realistic tap timing', () => {
  const DOG_RIGHT = DOG_X + DOG_W;
  const KINDS: ObstacleKind[] = ['hurdle', 'cones', 'tunnel'];

  /**
   * Simula il passaggio di un ostacolo a tick da 50ms: il giocatore tappa
   * quando l'ostacolo è a `tapBodies` corpi-cane di distanza (null = mai).
   */
  function runPassage(
    kind: ObstacleKind,
    speed: number,
    tapBodies: number | null,
  ): { crashed: boolean; tapped: boolean } {
    const obstacle: AgilityObstacle = { id: 0, kind, spawnAtMs: 0, speed };
    let jumpStartMs: number | null = null;
    let tapped = false;
    for (let now = 0; now <= 12_000; now += 50) {
      if (!tapped && tapBodies !== null) {
        const gap = obstacleX(obstacle, now) - DOG_RIGHT;
        if (gap <= tapBodies * DOG_W) {
          jumpStartMs = now;
          tapped = true;
        }
      }
      if (isCleared(obstacle, now)) return { crashed: false, tapped };
      const dogY = jumpHeightAt(jumpStartMs, now);
      if (collides(dogY, obstacle, now, jumpStartMs)) {
        return { crashed: true, tapped };
      }
    }
    return { crashed: false, tapped };
  }

  it('tap at 1.2 and 1.5 dog bodies clears every obstacle at base speed (20 u/s)', () => {
    for (const kind of KINDS) {
      for (const bodies of [1.2, 1.5]) {
        const run = runPassage(kind, 20, bodies);
        expect(run.tapped).toBe(true);
        expect(run.crashed).toBe(false);
      }
    }
  });

  it('the same taps clear every obstacle at mid-ramp (27 u/s) and full speed (34 u/s)', () => {
    for (const kind of KINDS) {
      for (const speed of [27, 34]) {
        for (const bodies of [1.2, 1.5]) {
          expect(runPassage(kind, speed, bodies).crashed).toBe(false);
        }
      }
    }
  });

  it('a late tap during the contact still saves the dog (coyote window covers the tick)', () => {
    for (const kind of KINDS) {
      expect(runPassage(kind, 20, 0.05).crashed).toBe(false);
    }
  });

  it('never tapping crashes into every kind, tunnel included', () => {
    for (const kind of KINDS) {
      expect(runPassage(kind, 20, null).crashed).toBe(true);
    }
  });

  it('a tap way too early (4 bodies) does not clear the obstacle by itself', () => {
    expect(runPassage('hurdle', 20, 4).crashed).toBe(true);
  });

  it('jumpCoversObstacle matches the geometry of the tap window', () => {
    const hurdle: AgilityObstacle = { id: 0, kind: 'hurdle', spawnAtMs: 0, speed: 20 };
    // Overlap al suolo: x in (13.8, 25.2) → t in (3740, 4310) ms.
    expect(jumpCoversObstacle(null, hurdle)).toBe(false);
    expect(jumpCoversObstacle(3220, hurdle)).toBe(true); // tap a 1.2 corpi
    expect(jumpCoversObstacle(2100, hurdle)).toBe(false); // tap a 4 corpi
  });

  it('exposes a forgiving hitbox margin and an 80ms coyote window', () => {
    expect(HITBOX_MARGIN_U).toBe(0.8);
    expect(COYOTE_MS).toBe(80);
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

describe('lives system', () => {
  it('starts at 3 lives, loses one per crash, game over at zero', () => {
    expect(AGILITY_LIVES).toBe(3);
    expect(livesAfterCrash(3)).toBe(2);
    expect(livesAfterCrash(2)).toBe(1);
    expect(livesAfterCrash(1)).toBe(0);
    expect(livesAfterCrash(0)).toBe(0);
    expect(isGameOver(1)).toBe(false);
    expect(isGameOver(0)).toBe(true);
  });

  it('invulnerability window covers 1.5s after a crash', () => {
    expect(isInvulnerable(null, 5000)).toBe(false);
    expect(isInvulnerable(5000, 5000)).toBe(true);
    expect(isInvulnerable(5000, 5000 + 1499)).toBe(true);
    expect(isInvulnerable(5000, 5000 + 1500)).toBe(false);
  });

  it('schedule can extend beyond 60s chunks with unique ids', () => {
    const first = buildAgilitySchedule(Math.random);
    const last = first[first.length - 1];
    const extra = buildAgilitySchedule(Math.random, last.spawnAtMs + 60_000, {
      startAtMs: last.spawnAtMs + 1,
      startId: last.id + 1,
    });
    expect(extra.length).toBeGreaterThan(0);
    expect(extra[0].spawnAtMs).toBeGreaterThan(last.spawnAtMs);
    const ids = new Set([...first, ...extra].map((o) => o.id));
    expect(ids.size).toBe(first.length + extra.length);
  });
});

describe('bonus bones and near-miss', () => {
  it('arcs spawn inside obstacle gaps with 2-3 bones at jump height', () => {
    const obstacles = buildAgilitySchedule(Math.random);
    const arcs = buildBonusArcs(obstacles, Math.random);
    for (const arc of arcs) {
      expect(arc.bones.length).toBeGreaterThanOrEqual(2);
      expect(arc.bones.length).toBeLessThanOrEqual(3);
      for (const bone of arc.bones) {
        expect(bone.y).toBeGreaterThanOrEqual(10);
        expect(bone.y).toBeLessThanOrEqual(23);
      }
      // ogni arcata sta dentro un gap reale tra due ostacoli consecutivi
      const insideGap = obstacles.some(
        (obstacle, index) =>
          index + 1 < obstacles.length &&
          arc.spawnAtMs > obstacle.spawnAtMs &&
          arc.spawnAtMs < obstacles[index + 1].spawnAtMs,
      );
      expect(insideGap).toBe(true);
    }
  });

  it('bones are collected only when jumping through them', () => {
    expect(boneCollected(20, 20, 20)).toBe(true);
    expect(boneCollected(0, 20, 20)).toBe(false);
    expect(boneCollected(20, 20, 60)).toBe(false);
    expect(boneCollected(14, 20, 20)).toBe(false);
  });

  it('near-miss triggers only within 2u of the obstacle top', () => {
    expect(isNearMiss(OBSTACLE_DIMS.hurdle.h + 1, 'hurdle')).toBe(true);
    expect(isNearMiss(OBSTACLE_DIMS.hurdle.h + 4, 'hurdle')).toBe(false);
    expect(isNearMiss(0, 'hurdle')).toBe(false);
    expect(isNearMiss(OBSTACLE_DIMS.cones.h + 1, 'cones')).toBe(true);
    expect(isNearMiss(OBSTACLE_DIMS.tunnel.h + 1, 'tunnel')).toBe(true);
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
