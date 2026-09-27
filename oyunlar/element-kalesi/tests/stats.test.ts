import { describe, it, expect } from 'vitest';
import { levelMult, unitStats } from '../src/logic/stats';
import { summonCost } from '../src/logic/economy';

describe('unitStats', () => {
  it('seviye 1 ateş taban değerleri korur', () => {
    const s = unitStats({ kind: 'base', element: 'fire', level: 1 });
    expect(s.damage).toBe(8);
    expect(s.splashRadius).toBe(50);
    expect(s.cooldownMs).toBe(900);
  });

  it('seviye hasarı ölçekler', () => {
    expect(levelMult(3)).toBeCloseTo(2.2);
    expect(unitStats({ kind: 'base', element: 'fire', level: 3 }).damage).toBeCloseTo(17.6);
  });

  it('zehir hasarı da seviyeyle ölçeklenir', () => {
    expect(unitStats({ kind: 'base', element: 'nature', level: 2 }).poisonDps).toBeCloseTo(9.6);
  });

  it('melez iki ebeveynin etkilerini birleştirir', () => {
    const s = unitStats({ kind: 'hybrid', hybrid: 'steam', level: 2 });
    expect(s.damage).toBeCloseTo((8 + 4) * 1.6 * 1.25);
    expect(s.splashRadius).toBe(50);
    expect(s.slowPct).toBe(0.4);
    expect(s.range).toBe(130);
    expect(s.cooldownMs).toBe(700);
  });
});

describe('summonCost', () => {
  it('her çağırmada 5 artar', () => {
    expect(summonCost(0)).toBe(10);
    expect(summonCost(1)).toBe(15);
    expect(summonCost(4)).toBe(30);
  });
});
