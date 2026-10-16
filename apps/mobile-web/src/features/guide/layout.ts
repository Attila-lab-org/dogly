export type GuideRect = { x: number; y: number; width: number; height: number };
export type GuideViewport = { width: number; height: number; top?: number; bottom?: number };
export type GuidePoint = { x: number; y: number };

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

/** Never draw a pointer to missing, hidden or off-screen controls. */
export function visibleGuideRect(rect: GuideRect | null, viewport: GuideViewport): GuideRect | null {
  if (!rect || !Object.values(rect).every(Number.isFinite) || rect.width < 4 || rect.height < 4) return null;
  if (rect.x < -1 || rect.y < (viewport.top ?? 0) - 1 || rect.x + rect.width > viewport.width + 1 || rect.y + rect.height > viewport.height - (viewport.bottom ?? 0) + 1) return null;
  return rect;
}

export function positionGuide(viewport: GuideViewport, measuredTarget: GuideRect | null, contentHeight: number) {
  const margin = 16;
  const top = (viewport.top ?? 0) + 64;
  const bottom = viewport.height - (viewport.bottom ?? 0) - margin;
  const width = Math.min(520, viewport.width - margin * 2);
  const x = (viewport.width - width) / 2;
  const target = visibleGuideRect(measuredTarget, viewport);
  const gap = 46;
  const above = target ? target.y - gap - top : 0;
  const below = target ? bottom - target.y - target.height - gap : 0;
  const placement = above >= contentHeight || above >= below ? 'above' : 'below';
  const availableHeight = target ? Math.max(0, placement === 'above' ? above : below) : bottom - top;
  // On a very short viewport, keep the explanation usable and omit the pointer.
  const anchored = Boolean(target && availableHeight >= 110);
  const maxHeight = anchored ? availableHeight : bottom - top;
  const height = Math.min(contentHeight, maxHeight);
  const y = anchored && target
    ? placement === 'above' ? target.y - gap - height : target.y + target.height + gap
    : top + Math.max(0, (bottom - top - height) / 2);
  let arrow: { start: GuidePoint; end: GuidePoint } | null = null;
  if (anchored && target) {
    const targetX = target.x + target.width / 2;
    arrow = {
      start: { x: clamp(targetX, x + 24, x + width - 24), y: placement === 'above' ? y + height + 7 : y - 7 },
      end: { x: targetX, y: placement === 'above' ? target.y - 3 : target.y + target.height + 3 },
    };
  }
  return { panel: { x, y, width, height }, maxHeight, target: anchored ? target : null, arrow };
}

export function arrowPath(start: GuidePoint, end: GuidePoint) {
  const angle = Math.atan2(end.y - start.y, end.x - start.x);
  const wing = 8;
  const left = { x: end.x - wing * Math.cos(angle - Math.PI / 4), y: end.y - wing * Math.sin(angle - Math.PI / 4) };
  const right = { x: end.x - wing * Math.cos(angle + Math.PI / 4), y: end.y - wing * Math.sin(angle + Math.PI / 4) };
  return `M ${start.x} ${start.y} L ${end.x} ${end.y} M ${left.x} ${left.y} L ${end.x} ${end.y} L ${right.x} ${right.y}`;
}
