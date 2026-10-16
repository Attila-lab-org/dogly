import { useCallback, useRef } from 'react';
import type { GuideRect } from './layout';
import type { GuideTarget } from './copy';

type Measurable = { measureInWindow: (callback: (x: number, y: number, width: number, height: number) => void) => void };
export type MeasureGuideTarget = (target: GuideTarget) => Promise<GuideRect | null>;

/** Refs measure the real controls after layout, in the same window as the overlay. */
export function useGuideTargets() {
  const nodes = useRef(new Map<GuideTarget, Measurable>());
  const callbacks = useRef(new Map<GuideTarget, (node: unknown | null) => void>());
  const anchor = useCallback((id: GuideTarget) => {
    if (!callbacks.current.has(id)) {
      callbacks.current.set(id, (node) => {
        if (node && typeof (node as Measurable).measureInWindow === 'function') nodes.current.set(id, node as Measurable);
        else nodes.current.delete(id);
      });
    }
    return callbacks.current.get(id)!;
  }, []);
  const measureTarget: MeasureGuideTarget = useCallback((id) => new Promise((resolve) => {
    const node = nodes.current.get(id);
    if (!node) { resolve(null); return; }
    const timeout = setTimeout(() => resolve(null), 200);
    node.measureInWindow((x, y, width, height) => {
      clearTimeout(timeout);
      resolve({ x, y, width, height });
    });
  }), []);
  return { anchor, measureTarget };
}
