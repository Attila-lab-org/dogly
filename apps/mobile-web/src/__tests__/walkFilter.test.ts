/**
 * Test filtro micro-passeggiate: <30s E <50m non è un ricordo degno.
 */
import {
  MIN_WALK_METERS,
  MIN_WALK_SECONDS,
  isMeaningfulWalk,
  isTrivialWalk,
} from '../features/walk/walkFilter';

describe('walk quality filter', () => {
  it('esclude uscite brevi E corte', () => {
    expect(isMeaningfulWalk({ duration_seconds: 1, distance_meters: 0 })).toBe(false);
    expect(isMeaningfulWalk({ duration_seconds: 8, distance_meters: 10 })).toBe(false);
    expect(isMeaningfulWalk({ duration_seconds: 29, distance_meters: 49 })).toBe(false);
    expect(isTrivialWalk({ duration_seconds: 5, distance_meters: 2 })).toBe(true);
  });

  it('tiene uscite degne per durata O distanza', () => {
    expect(isMeaningfulWalk({ duration_seconds: 30, distance_meters: 0 })).toBe(true);
    expect(isMeaningfulWalk({ duration_seconds: 5, distance_meters: 51 })).toBe(true);
    expect(isMeaningfulWalk({ duration_seconds: 300, distance_meters: 1200 })).toBe(true);
  });

  it('soglie coerenti', () => {
    expect(MIN_WALK_SECONDS).toBe(30);
    expect(MIN_WALK_METERS).toBe(50);
  });
});
