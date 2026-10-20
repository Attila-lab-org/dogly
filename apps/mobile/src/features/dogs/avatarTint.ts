/**
 * Tinta del profilo dal colore dominante della foto del cane.
 * Web: canvas 1×1 (getImageData). Nativa: nessuna API pixel disponibile
 * senza moduli nativi → palette default (documentato; il profilo resta
 * brand teal). Cache per dogId+photoUri nel kv (pattern checkin).
 * La tinta colora solo SFONDI e accenti soft, mai il testo.
 */
import { useEffect, useState } from 'react';
import type { KeyValueStorage } from '../checkin/persistence';

export interface AvatarPalette {
  /** Gradiente hero: dal tint soft allo sfondo pagina. */
  heroFrom: string;
  heroTo: string;
  /** Soft per chip/pill (solo sfondi). */
  chip: string;
}

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

export const DEFAULT_AVATAR_PALETTE: AvatarPalette = {
  heroFrom: '#DBEAFE',
  heroTo: '#F4F7FB',
  chip: '#CCFBF1',
};

/** Palette profilo dal colore dominante (soft: mai per il testo). */
export function paletteFromDominant(dominant: string | null): AvatarPalette {
  if (!dominant || !hexToRgb(dominant)) return DEFAULT_AVATAR_PALETTE;
  return {
    heroFrom: mixWithWhite(dominant, 0.72),
    heroTo: mixWithWhite(dominant, 0.94),
    chip: mixWithWhite(dominant, 0.82),
  };
}

/* ------------------------------------------------------------------ */
/* Estrazione colore (web via canvas; nativa → null = palette default)  */
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
      canvas.width = 1;
      canvas.height = 1;
      const context = canvas.getContext('2d');
      if (!context) return null;
      context.drawImage(image, 0, 0, 1, 1);
      const [r, g, b] = context.getImageData(0, 0, 1, 1).data;
      return toHex(r, g, b);
    } finally {
      URL.revokeObjectURL(url);
    }
  } catch {
    // CORS o formato non leggibile: palette default, mai bloccare il profilo.
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
  // Stable across signed-URL remints (ignore ?token=…).
  const pathOnly = photoUri.split('?')[0] ?? photoUri;
  let hash = 0;
  for (let i = 0; i < pathOnly.length; i += 1) {
    hash = (hash * 31 + pathOnly.charCodeAt(i)) >>> 0;
  }
  return `dogs:avatar-tint:v2:${dogId}:${hash.toString(36)}`;
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
 * Palette del profilo per questo cane: cache → calcolo (web) → default.
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
