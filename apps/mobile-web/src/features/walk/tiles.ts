/**
 * Tile OpenStreetMap per la mappa passeggiata: Web Mercator standard.
 * Dati i punti GPS: bbox → zoom adatto (max 17) → griglia di tile 256px.
 * Il percorso è proiettato in coordinate tile (mercator) → segue le strade
 * vere. Nessuna dipendenza nuova: le tile sono semplici <Image>.
 * Attribution "© OpenStreetMap contributors" resa visibile dal chiamante
 * (obbligo di licenza OSM).
 */
import type { WalkPoint } from './tracking';

export const OSM_TILE_URL = 'https://tile.openstreetmap.org';
export const OSM_ATTRIBUTION = '© OpenStreetMap contributors';
export const TILE_SIZE = 256;
export const MAX_TILE_ZOOM = 17;

export interface TileCoord {
  x: number;
  y: number;
  zoom: number;
  url: string;
}

export interface TileFrame {
  zoom: number;
  /** Pixel globali (a questo zoom) dell'angolo in alto a sinistra della finestra. */
  originPixelX: number;
  originPixelY: number;
  /** Dimensioni finestra in px. */
  width: number;
  height: number;
  tiles: TileCoord[];
}

/** Lat/lng → coordinate tile frazionarie (Web Mercator). */
export function latLngToTile(lat: number, lng: number, zoom: number): { x: number; y: number } {
  const n = 2 ** zoom;
  const x = ((lng + 180) / 360) * n;
  const latRad = (lat * Math.PI) / 180;
  const y = ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n;
  return { x, y };
}

/** Lat/lng → pixel globali a questo zoom. */
export function latLngToPixel(lat: number, lng: number, zoom: number): { x: number; y: number } {
  const tile = latLngToTile(lat, lng, zoom);
  return { x: tile.x * TILE_SIZE, y: tile.y * TILE_SIZE };
}

/** Zoom che fa stare la bbox dei punti dentro la finestra (con margine). */
export function zoomForPoints(
  points: WalkPoint[],
  width: number,
  height: number,
): number {
  if (!points.length) return 15;
  const lats = points.map((p) => p.latitude);
  const lngs = points.map((p) => p.longitude);
  const spanLat = Math.max(...lats) - Math.min(...lats);
  const spanLng = Math.max(...lngs) - Math.min(...lngs);
  if (spanLat < 0.0002 && spanLng < 0.0002) return MAX_TILE_ZOOM;
  for (let zoom = MAX_TILE_ZOOM; zoom > 10; zoom -= 1) {
    const a = latLngToPixel(Math.max(...lats), Math.min(...lngs), zoom);
    const b = latLngToPixel(Math.min(...lats), Math.max(...lngs), zoom);
    const spanX = Math.abs(b.x - a.x);
    const spanY = Math.abs(b.y - a.y);
    if (spanX <= width * 0.7 && spanY <= height * 0.7) return zoom;
  }
  return 11;
}

/**
 * Finestra di tile centrata sulla bbox dei punti: griglia minima di tile
 * che copre la finestra, con origine in pixel globali per proiettare il
 * percorso nella stessa geometria.
 */
export function buildTileFrame(
  points: WalkPoint[],
  width: number,
  height: number,
): TileFrame | null {
  if (!points.length || width <= 0 || height <= 0) return null;
  const zoom = zoomForPoints(points, width, height);
  const pixels = points.map((p) => latLngToPixel(p.latitude, p.longitude, zoom));
  const minX = Math.min(...pixels.map((p) => p.x));
  const maxX = Math.max(...pixels.map((p) => p.x));
  const minY = Math.min(...pixels.map((p) => p.y));
  const maxY = Math.max(...pixels.map((p) => p.y));
  const centerX = (minX + maxX) / 2;
  const centerY = (minY + maxY) / 2;
  const originPixelX = centerX - width / 2;
  const originPixelY = centerY - height / 2;

  const tileMinX = Math.floor(originPixelX / TILE_SIZE);
  const tileMinY = Math.floor(originPixelY / TILE_SIZE);
  const tileMaxX = Math.floor((originPixelX + width) / TILE_SIZE);
  const tileMaxY = Math.floor((originPixelY + height) / TILE_SIZE);
  const maxTile = 2 ** zoom - 1;
  const tiles: TileCoord[] = [];
  for (let x = Math.max(0, tileMinX); x <= Math.min(maxTile, tileMaxX); x += 1) {
    for (let y = Math.max(0, tileMinY); y <= Math.min(maxTile, tileMaxY); y += 1) {
      tiles.push({
        x,
        y,
        zoom,
        url: `${OSM_TILE_URL}/${zoom}/${x}/${y}.png`,
      });
    }
  }
  return { zoom, originPixelX, originPixelY, width, height, tiles };
}

/** Punto GPS → pixel dentro la finestra del frame. */
export function projectInFrame(
  frame: TileFrame,
  point: WalkPoint,
): { x: number; y: number } {
  const pixel = latLngToPixel(point.latitude, point.longitude, frame.zoom);
  return { x: pixel.x - frame.originPixelX, y: pixel.y - frame.originPixelY };
}

/** Percorso SVG (path d) dentro la finestra del frame. */
export function routePathInFrame(frame: TileFrame, points: WalkPoint[]): string | null {
  if (!points.length) return null;
  return points
    .map((point, index) => {
      const { x, y } = projectInFrame(frame, point);
      return `${index === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(' ');
}

/** True quando la nuova posizione è uscita dalla zona comoda del frame. */
export function frameNeedsRefresh(
  frame: TileFrame | null,
  points: WalkPoint[],
  width: number,
  height: number,
): boolean {
  if (!frame || !points.length) return true;
  const last = points[points.length - 1];
  const { x, y } = projectInFrame(frame, last);
  const marginX = width * 0.22;
  const marginY = height * 0.22;
  return (
    x < marginX || x > width - marginX || y < marginY || y > height - marginY
  );
}
