/**
 * Test tinta vivace: cluster più saturo (non media), clamp anti-fango
 * (cane nero-focato → teal brand), mix verso il bianco, cache per cane.
 */
import {
  DEFAULT_AVATAR_PALETTE,
  loadAvatarTint,
  mixWithWhite,
  paletteFromDominant,
  pickVividColor,
  rgbToHsl,
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

describe('avatar vivid tint', () => {
  it('mixes toward white', () => {
    expect(mixWithWhite('#000000', 1)).toBe('#ffffff');
    expect(mixWithWhite('#000000', 0)).toBe('#000000');
    expect(mixWithWhite('not-a-color', 0.5)).toBe('#ffffff');
  });

  it('rgbToHsl is sane for known colors', () => {
    expect(rgbToHsl(255, 0, 0)).toEqual({ h: 0, s: 1, l: 0.5 });
    expect(rgbToHsl(20, 20, 20).s).toBe(0);
    expect(rgbToHsl(255, 255, 255).l).toBe(1);
  });

  it('picks the most saturated pixel, not the average', () => {
    const samples: Array<[number, number, number]> = [
      [40, 32, 28],   // pelo scuro
      [45, 36, 30],   // pelo scuro
      [46, 38, 32],   // pelo scuro
      [220, 120, 60], // focato vivace
    ];
    expect(pickVividColor(samples)).toBe('#dc783c');
  });

  it('mud case: only dark/dull pixels → null (brand teal wins)', () => {
    const mud: Array<[number, number, number]> = [
      [40, 32, 28],
      [45, 36, 30],
      [60, 52, 46],
      [30, 26, 24],
    ];
    expect(pickVividColor(mud)).toBeNull();
    expect(paletteFromDominant(pickVividColor(mud))).toEqual(DEFAULT_AVATAR_PALETTE);
  });

  it('clamps: rejects too dark, too light, too grey', () => {
    expect(pickVividColor([[10, 10, 10]])).toBeNull(); // troppo scuro
    expect(pickVividColor([[245, 245, 245]])).toBeNull(); // troppo chiaro
    expect(pickVividColor([[120, 122, 121]])).toBeNull(); // grigio
  });

  it('palette is accents-only: veil has low opacity, never a page background', () => {
    const palette = paletteFromDominant('#dc783c');
    expect(palette.accent).toBe('#dc783c');
    expect(palette.veilOpacity).toBeLessThanOrEqual(0.15);
    expect(palette.accentSoft).not.toBe(palette.accent);
    expect(palette).not.toHaveProperty('heroFrom');
    expect(palette).not.toHaveProperty('heroTo');
  });

  it('caches per dog and photo', async () => {
    setAvatarTintBackend(memoryStorage());
    expect(await loadAvatarTint('dog-1', 'file:///a.jpg')).toBeNull();
    await saveAvatarTint('dog-1', 'file:///a.jpg', '#8b5a2b');
    expect(await loadAvatarTint('dog-1', 'file:///a.jpg')).toBe('#8b5a2b');
    expect(await loadAvatarTint('dog-2', 'file:///a.jpg')).toBeNull();
  });
});
