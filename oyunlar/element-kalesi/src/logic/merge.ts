import { HYBRID_INFO, MAX_LEVEL, MIN_HYBRID_LEVEL, type ElementId, type HybridId, type Unit } from '../data/units';

export type MergeResult = { ok: true; unit: Unit } | { ok: false };

export function hybridFor(a: ElementId, b: ElementId): HybridId | null {
  for (const id of Object.keys(HYBRID_INFO) as HybridId[]) {
    const [p, q] = HYBRID_INFO[id].parents;
    if ((p === a && q === b) || (p === b && q === a)) return id;
  }
  return null;
}

export function merge(a: Unit, b: Unit): MergeResult {
  if (a.kind !== 'base' || b.kind !== 'base' || a.level !== b.level) return { ok: false };
  if (a.element === b.element) {
    if (a.level >= MAX_LEVEL) return { ok: false };
    return { ok: true, unit: { kind: 'base', element: a.element, level: a.level + 1 } };
  }
  if (a.level < MIN_HYBRID_LEVEL) return { ok: false };
  const hybrid = hybridFor(a.element, b.element);
  if (!hybrid) return { ok: false };
  return { ok: true, unit: { kind: 'hybrid', hybrid, level: a.level } };
}
