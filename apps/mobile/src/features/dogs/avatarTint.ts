/**
 * Tinta vivace dal colore del cane (PO 2026-10: niente "tortora" ovunque).
 * Estrazione: griglia 8×8 sul thumbnail (canvas web), scelto il pixel
 * CLUSTER più saturo — non la media — con clamp di qualità
 * (saturazione ≥ 0.25, lightness 0.35–0.75); se nulla passa → teal brand.
 * Uso: SOLO accenti piccoli (chip meta, bordo/glow avatar, velo hero a
 * bassa opacità). Mai sfondo pagina: resta `colors.background` brand.
 * Cache invariata (kv per dogId+photoUri, pattern checkin).
 * Nativa: nessuna API pixel senza moduli nativi → teal brand (documentato).
 */
import { useEffect, useState } from 'react';
import type { KeyValueStorage } from '../checkin/persistence';

export interface AvatarPalette {
  /** Accento vivace del pelo (chip meta, bordo avatar). */
  accent: string;
  /** Soft dell'accento per piccoli fondi (chip). */
  accentSoft: string;
  /** Colore del velo hero (va applicato con `veilOpacity`). */
  veil: string;
  veilOpacity: number;
}

const BRAND_ACCENT = '#14B8A6';
const BRAND_ACCENT_SOFT = '#CCFBF1';

export const DEFAULT_AVATAR_PALETTE: AvatarPalette = {
  accent: BRAND_ACCENT,
  accentSoft: BRAND_ACCENT_SOFT,
  veil: BRAND_ACCENT,
  veilOpacity: 0.13,
};

function hexToRgb(hex: string): [number, number, number] | null {
  const match = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!match) return null;
  const value = Number.parseInt(match[1], 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

function toHex(r: number, g: number, b: number): string {
  const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
  return `#${[clamp(r), clamp(g), clamp(b)]
    .map((v) => v.toString(16).padStart(2, '0'))
    .join('')}`;
}

/** Mescola verso il bianco: 0 = colore pieno, 1 = bianco. */
export function mixWithWhite(hex: string, amount: number): string {
  const rgb = hexToRgb(hex);
  if (!rgb) return '#ffffff';
  return toHex(
    rgb[0] + (255 - rgb[0]) * amount,
    rgb[1] + (255 - rgb[1]) * amount,
    rgb[2] + (255 - rgb[2]) * amount,
  );
}

/** HSL da RGB (0-255). */
export function rgbToHsl(r: number, g: number, b: number): { h: number; s: number; l: number } {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l };
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = 0;
  if (max === rn) h = ((gn - bn) / d + (gn < bn ? 6 : 0)) / 6;
  else if (max === gn) h = ((bn - rn) / d + 2) / 6;
  else h = ((rn - gn) / d + 4) / 6;
  return { h: h * 360, s, l };
}

const MIN_SATURATION = 0.25;
const MIN_LIGHTNESS = 0.35;
const MAX_LIGHTNESS = 0.75;

/**
 * Il colore "vivace" del cane: il pixel più saturo che supera i clamp di
 * qualità (niente fango da media). Ritorna null se nessuno passa.
 */
export function pickVividColor(samples: Array<[number, number, number]>): string | null {
  let best: { hex: string; s: number } | null = null;
  for (const [r, g, b] of samples) {
    const { s, l } = rgbToHsl(r, g, b);
    if (s < MIN_SATURATION || l < MIN_LIGHTNESS || l > MAX_LIGHTNESS) continue;
    if (!best || s > best.s) best = { hex: toHex(r, g, b), s };
  }
  return best?.hex ?? null;
}

/** Palette accenti dalla tinta vivace (mai sfondo pagina). */
export function paletteFromDominant(dominant: string | null): AvatarPalette {
  if (!dominant || !hexToRgb(dominant)) return DEFAULT_AVATAR_PALETTE;
  return {
    accent: dominant,
    accentSoft: mixWithWhite(dominant, 0.82),
    veil: dominant,
    veilOpacity: 0.13,
  };
}

/* ------------------------------------------------------------------ */
/* Estrazione colore (web via canvas; nativa → null = teal brand)       */
/* ------------------------------------------------------------------ */

async function computeDominantWeb(photoUri: string): Promise<string | null> {
  if (typeof document === 'undefined') return null;
  try {
    const response = await fetch(photoUri);
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    try {
      const image = await new Promise<HTMLImageElement>((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error('img load'));
        img.src = url;
      });
      const canvas = document.createElement('canvas');
      canvas.width = 8;
      canvas.height = 8;
      const context = canvas.getContext('2d');
      if (!context) return null;
      context.drawImage(image, 0, 0, 8, 8);
      const data = context.getImageData(0, 0, 8, 8).data;
      const samples: Array<[number, number, number]> = [];
      for (let i = 0; i < data.length; i += 4) {
        if (data[i + 3] < 128) continue; // ignora i trasparenti
        samples.push([data[i], data[i + 1], data[i + 2]]);
      }
      return pickVividColor(samples);
    } finally {
      URL.revokeObjectURL(url);
    }
  } catch {
    // CORS o formato non leggibile: teal brand, mai bloccare il profilo.
    return null;
  }
}

let injectedBackend: KeyValueStorage | null = null;

/** Test/dev: storage in-memory invece di AsyncStorage. */
export function setAvatarTintBackend(backend: KeyValueStorage | null): void {
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

function tintKey(dogId: string, photoUri: string): string {
  let hash = 0;
  for (let i = 0; i < photoUri.length; i += 1) {
    hash = (hash * 31 + photoUri.charCodeAt(i)) >>> 0;
  }
  return `dogs:avatar-tint:v1:${dogId}:${hash.toString(36)}`;
}

export async function loadAvatarTint(
  dogId: string,
  photoUri: string,
): Promise<string | null> {
  const store = await storage();
  if (!store) return null;
  try {
    return await store.getItem(tintKey(dogId, photoUri));
  } catch {
    return null;
  }
}

export async function saveAvatarTint(
  dogId: string,
  photoUri: string,
  color: string,
): Promise<void> {
  const store = await storage();
  if (!store) return;
  try {
    await store.setItem(tintKey(dogId, photoUri), color);
  } catch {
    // persistenza best-effort
  }
}

/**
 * Palette accenti per questo cane: cache → calcolo (web) → teal brand.
 * Il risultato è sempre una palette valida (mai null).
 */
export function useAvatarPalette(
  dogId: string,
  photoUri: string | null,
): AvatarPalette {
  const [dominant, setDominant] = useState<string | null>(null);
  useEffect(() => {
    if (!photoUri || typeof document === 'undefined') {
      setDominant(null);
      return;
    }
    let alive = true;
    void (async () => {
      const cached = await loadAvatarTint(dogId, photoUri);
      if (cached) {
        if (alive) setDominant(cached);
        return;
      }
      const computed = await computeDominantWeb(photoUri);
      if (computed) await saveAvatarTint(dogId, photoUri, computed);
      if (alive) setDominant(computed);
    })();
    return () => {
      alive = false;
    };
  }, [dogId, photoUri]);
  return paletteFromDominant(dominant);
}
