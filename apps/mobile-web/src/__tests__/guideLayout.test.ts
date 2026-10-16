import { arrowPath, positionGuide, visibleGuideRect } from '@/features/guide/layout';

describe('contextual guide layout', () => {
  const viewport = { width: 390, height: 844, top: 0, bottom: 0 };
  const composer = { x: 18, y: 680, width: 354, height: 86 };

  it('rejects missing or off-screen targets', () => {
    expect(visibleGuideRect(null, viewport)).toBeNull();
    expect(visibleGuideRect({ x: 0, y: 0, width: 2, height: 20 }, viewport)).toBeNull();
    expect(visibleGuideRect({ x: 18, y: 680, width: 354, height: 200 }, viewport)).toBeNull();
  });

  it('anchors the explanation to the measured composer and points to its centre', () => {
    const layout = positionGuide(viewport, composer, 250);
    expect(layout.target).toEqual(composer);
    expect(layout.arrow?.end).toEqual({ x: 195, y: 677 });
    expect(layout.panel.width).toBe(358);
  });

  it('renders a directional arrow path from the explanation to the target', () => {
    expect(arrowPath({ x: 195, y: 600 }, { x: 195, y: 769 })).toContain('M 195 600 L 195 769');
  });
});
