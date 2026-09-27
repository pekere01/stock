import { ELEMENT_INFO, HYBRID_BONUS, HYBRID_INFO, LEVEL_DAMAGE_STEP, type Unit, type UnitStats } from '../data/units';

export function levelMult(level: number): number {
  return 1 + LEVEL_DAMAGE_STEP * (level - 1);
}

function scale(stats: UnitStats, mult: number): UnitStats {
  const out: UnitStats = { ...stats, damage: stats.damage * mult };
  if (stats.poisonDps !== undefined) out.poisonDps = stats.poisonDps * mult;
  return out;
}

export function unitStats(unit: Unit): UnitStats {
  if (unit.kind === 'base') return scale(ELEMENT_INFO[unit.element].stats, levelMult(unit.level));
  const [p, q] = HYBRID_INFO[unit.hybrid].parents;
  const a = ELEMENT_INFO[p].stats;
  const b = ELEMENT_INFO[q].stats;
  const combined: UnitStats = {
    ...a,
    ...b,
    damage: a.damage + b.damage,
    range: Math.max(a.range, b.range),
    cooldownMs: Math.min(a.cooldownMs, b.cooldownMs),
  };
  return scale(combined, levelMult(unit.level) * HYBRID_BONUS);
}
