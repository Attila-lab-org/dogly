/**
 * Test tinta profilo: mix verso il bianco, palette dal colore dominante,
 * default onesto senza foto, cache per dogId+photoUri.
 */
import {
  DEFAULT_AVATAR_PALETTE,
  loadAvatarTint,
  mixWithWhite,
  paletteFromDominant,
  saveAvatarTint,
  setAvatarTintBackend,
} from '../features/dogs/avatarTint';

function memoryStorage() {
  const map = new Map<string, string>();
  return {
    getItem: async (key: string) => map.get(key) ?? null,
    setItem: async (key: string, value: string) => {
      map.set(key, value);
    },
  };
}

afterEach(() => setAvatarTintBackend(null));

describe('avatar tint palette', () => {
  it('mixes toward white', () => {
    expect(mixWithWhite('#000000', 1)).toBe('#ffffff');
    expect(mixWithWhite('#000000', 0)).toBe('#000000');
    expect(mixWithWhite('#ff8b74', 0.5)).toBe('#ffc5ba');
    expect(mixWithWhite('not-a-color', 0.5)).toBe('#ffffff');
  });

  it('builds soft tints from the dominant color, never for text', () => {
    const palette = paletteFromDominant('#8B5A2B');
    expect(palette.heroFrom).not.toBe('#8B5A2B');
    expect(palette.heroFrom.startsWith('#')).toBe(true);
    // le tinte soft sono più chiare del colore dominante
    expect(palette.heroTo > palette.heroFrom).toBe(true);
    expect(palette.chip).not.toBe(DEFAULT_AVATAR_PALETTE.chip);
  });

  it('falls back to the default palette without a usable color', () => {
    expect(paletteFromDominant(null)).toEqual(DEFAULT_AVATAR_PALETTE);
    expect(paletteFromDominant('zzz')).toEqual(DEFAULT_AVATAR_PALETTE);
  });

  it('caches per dog and photo', async () => {
    setAvatarTintBackend(memoryStorage());
    expect(await loadAvatarTint('dog-1', 'file:///a.jpg')).toBeNull();
    await saveAvatarTint('dog-1', 'file:///a.jpg', '#8b5a2b');
    expect(await loadAvatarTint('dog-1', 'file:///a.jpg')).toBe('#8b5a2b');
    expect(await loadAvatarTint('dog-1', 'file:///b.jpg')).toBeNull();
    expect(await loadAvatarTint('dog-2', 'file:///a.jpg')).toBeNull();
  });
});
