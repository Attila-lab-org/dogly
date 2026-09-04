import { colors, gradients, radius, shadows, spacing, tabBar, typography } from '../theme/tokens';

describe('design tokens (UX_REFERENCE vincolante)', () => {
  it('palette principale: sfondo freddo, primario blu, accent teal, testo navy', () => {
    expect(colors.background).toBe('#F4F7FB');
    expect(colors.primary).toBe('#2563EB');
    expect(colors.accent).toBe('#14B8A6');
    expect(colors.text).toBe('#0E2A47');
    expect(colors.surface).toBe('#FFFFFF');
  });

  it('gradiente CTA blu → azzurro', () => {
    expect(gradients.cta).toHaveLength(2);
    expect(gradients.cta[0]).toBe(colors.primary);
  });

  it('radius card 16–24 come da mockup', () => {
    expect(radius.md).toBe(16);
    expect(radius.lg).toBe(24);
  });

  it('spacing scale definita e crescente', () => {
    expect(spacing.xs).toBeLessThan(spacing.sm);
    expect(spacing.sm).toBeLessThan(spacing.md);
    expect(spacing.md).toBeLessThan(spacing.lg);
    expect(spacing.lg).toBeLessThan(spacing.xl);
  });

  it('typography con pesi e dimensioni base', () => {
    expect(typography.weight.bold).toBe('700');
    expect(typography.size.md).toBe(16);
  });

  it('ombre card morbide definite', () => {
    expect(shadows.card.shadowOpacity).toBeGreaterThan(0);
    expect(shadows.card.shadowOpacity).toBeLessThan(0.2);
  });

  it('tab bar: voce attiva blu primario', () => {
    expect(tabBar.activeTint).toBe(colors.primary);
  });
});
