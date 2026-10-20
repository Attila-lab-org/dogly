/**
 * Test tile OSM (walk): mercator noto, zoom adatto alla bbox, griglia che
 * copre la finestra, proiezione percorso dentro i pixel, refresh margine.
 */
import {
  MAX_TILE_ZOOM,
  TILE_SIZE,
  buildTileFrame,
  frameNeedsRefresh,
  latLngToPixel,
  latLngToTile,
  projectInFrame,
  routePathInFrame,
  zoomForPoints,
} from '../features/walk/tiles';
import type { WalkPoint } from '../features/walk/tracking';

function point(lat: number, lng: number, t: number): WalkPoint {
  return { latitude: lat, longitude: lng, timestamp: t };
}

// Passeggiata sintetica ~600m a Milano (Duomo → sud-est).
const WALK = [
  point(45.4642, 9.19, 0),
  point(45.4631, 9.1935, 60_000),
  point(45.4621, 9.196, 120_000),
  point(45.461, 9.1985, 180_000),
];

describe('web mercator', () => {
  it('maps known coordinates to known tiles', () => {
    // (0,0) → centro esatto a zoom 1
    const z1 = latLngToTile(0, 0, 1);
    expect(z1.x).toBe(1);
    expect(z1.y).toBe(1);
    // estremo nord-ovest
    const nw = latLngToTile(85.0511, -180, 2);
    expect(nw.x).toBeCloseTo(0, 1);
    expect(nw.y).toBeCloseTo(0, 1);
  });

  it('pixel scale doubles per zoom level', () => {
    const a = latLngToPixel(45.4642, 9.19, 15);
    const b = latLngToPixel(45.4642, 9.19, 16);
    expect(b.x / a.x).toBeCloseTo(2, 5);
    expect(b.y / a.y).toBeCloseTo(2, 5);
  });
});

describe('tile frame', () => {
  it('chooses a zoom that fits the walk and covers the window', () => {
    const frame = buildTileFrame(WALK, 360, 190);
    expect(frame).not.toBeNull();
    expect(frame!.zoom).toBeLessThanOrEqual(MAX_TILE_ZOOM);
    expect(frame!.zoom).toBeGreaterThan(11);
    // ogni tile è dentro il mondo
    const maxTile = 2 ** frame!.zoom - 1;
    for (const tile of frame!.tiles) {
      expect(tile.x).toBeGreaterThanOrEqual(0);
      expect(tile.x).toBeLessThanOrEqual(maxTile);
      expect(tile.url).toContain(`/${frame!.zoom}/${tile.x}/${tile.y}.png`);
    }
    // la griglia copre la finestra
    const xs = frame!.tiles.map((t) => t.x);
    const ys = frame!.tiles.map((t) => t.y);
    expect(Math.min(...xs) * TILE_SIZE).toBeLessThanOrEqual(frame!.originPixelX);
    expect((Math.max(...xs) + 1) * TILE_SIZE).toBeGreaterThanOrEqual(
      frame!.originPixelX + frame!.width,
    );
    expect(Math.min(...ys) * TILE_SIZE).toBeLessThanOrEqual(frame!.originPixelY);
    expect((Math.max(...ys) + 1) * TILE_SIZE).toBeGreaterThanOrEqual(
      frame!.originPixelY + frame!.height,
    );
  });

  it('projects the route inside the window', () => {
    const frame = buildTileFrame(WALK, 360, 190)!;
    for (const p of WALK) {
      const { x, y } = projectInFrame(frame, p);
      expect(x).toBeGreaterThanOrEqual(-1);
      expect(x).toBeLessThanOrEqual(frame.width + 1);
      expect(y).toBeGreaterThanOrEqual(-1);
      expect(y).toBeLessThanOrEqual(frame.height + 1);
    }
    const path = routePathInFrame(frame, WALK);
    expect(path).not.toBeNull();
    expect(path).toMatch(/^M /);
    expect((path!.match(/L /g) ?? []).length).toBe(WALK.length - 1);
  });

  it('zooms out for long walks, max zoom for a single point', () => {
    expect(zoomForPoints([point(45.4642, 9.19, 0)], 360, 190)).toBe(MAX_TILE_ZOOM);
    const longWalk = [point(45.46, 9.19, 0), point(45.52, 9.29, 600_000)];
    const zoomLong = zoomForPoints(longWalk, 360, 190);
    expect(zoomLong).toBeLessThan(MAX_TILE_ZOOM);
    const frame = buildTileFrame(longWalk, 360, 190);
    expect(frame).not.toBeNull();
  });

  it('returns null without points or size', () => {
    expect(buildTileFrame([], 360, 190)).toBeNull();
    expect(buildTileFrame(WALK, 0, 190)).toBeNull();
  });

  it('refreshes the frame only when the route leaves the comfort zone', () => {
    const frame = buildTileFrame(WALK, 360, 190)!;
    expect(frameNeedsRefresh(frame, WALK, 360, 190)).toBe(false);
    const far = [...WALK, point(45.52, 9.29, 600_000)];
    expect(frameNeedsRefresh(frame, far, 360, 190)).toBe(true);
    expect(frameNeedsRefresh(null, WALK, 360, 190)).toBe(true);
  });
});
