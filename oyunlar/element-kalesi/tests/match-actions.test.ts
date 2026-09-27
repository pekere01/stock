import { describe, it, expect } from 'vitest';
import { createMatch, currentSummonCost, dropUnit, summon } from '../src/logic/match';
import type { Unit } from '../src/data/units';

const seq = (...vals: number[]) => {
  let i = 0;
  return () => vals[i++ % vals.length];
};

describe('createMatch', () => {
  it('başlangıç durumu', () => {
    const s = createMatch(() => 0);
    expect(s.mana).toBe(50);
    expect(s.lives).toBe(20);
    expect(s.board).toHaveLength(15);
    expect(s.board.every((u) => u === null)).toBe(true);
    expect(s.phase).toBe('break');
    expect(s.wave).toBe(0);
  });
});

describe('summon', () => {
  it('rng ile seçilen boş yuvaya seviye 1 birim koyar ve mana düşer', () => {
    const s = createMatch(seq(0.99, 0.3));
    expect(summon(s)).toBe(true);
    expect(s.board[14]).toEqual({ kind: 'base', element: 'ice', level: 1 });
    expect(s.mana).toBe(40);
    expect(s.summons).toBe(1);
    expect(currentSummonCost(s)).toBe(15);
  });

  it('mana yetmezse çağırmaz', () => {
    const s = createMatch(() => 0);
    s.mana = 9;
    expect(summon(s)).toBe(false);
    expect(s.board.every((u) => u === null)).toBe(true);
  });

  it('tahta doluysa çağırmaz', () => {
    const s = createMatch(() => 0);
    s.mana = 9999;
    s.board = s.board.map((): Unit => ({ kind: 'base', element: 'fire', level: 1 }));
    expect(summon(s)).toBe(false);
    expect(s.mana).toBe(9999);
  });

  it('maç bittiyse çağırmaz', () => {
    const s = createMatch(() => 0);
    s.phase = 'lost';
    expect(summon(s)).toBe(false);
  });
});

describe('dropUnit', () => {
  it('boş yuvaya taşır', () => {
    const s = createMatch(() => 0);
    s.board[0] = { kind: 'base', element: 'fire', level: 1 };
    expect(dropUnit(s, 0, 5)).toBe(true);
    expect(s.board[0]).toBeNull();
    expect(s.board[5]).toEqual({ kind: 'base', element: 'fire', level: 1 });
  });

  it('aynı birimleri birleştirir, hedefte sonuç kalır', () => {
    const s = createMatch(() => 0);
    s.board[0] = { kind: 'base', element: 'fire', level: 1 };
    s.board[1] = { kind: 'base', element: 'fire', level: 1 };
    expect(dropUnit(s, 0, 1)).toBe(true);
    expect(s.board[0]).toBeNull();
    expect(s.board[1]).toEqual({ kind: 'base', element: 'fire', level: 2 });
  });

  it('geçersiz birleştirmede tahta değişmez', () => {
    const s = createMatch(() => 0);
    s.board[0] = { kind: 'base', element: 'fire', level: 1 };
    s.board[1] = { kind: 'base', element: 'ice', level: 1 };
    expect(dropUnit(s, 0, 1)).toBe(false);
    expect(s.board[0]).toEqual({ kind: 'base', element: 'fire', level: 1 });
    expect(s.board[1]).toEqual({ kind: 'base', element: 'ice', level: 1 });
  });

  it('boş kaynak veya aynı yuva → false', () => {
    const s = createMatch(() => 0);
    s.board[0] = { kind: 'base', element: 'fire', level: 1 };
    expect(dropUnit(s, 3, 0)).toBe(false);
    expect(dropUnit(s, 0, 0)).toBe(false);
  });

  it('yeni melez keşif olayı üretir, ikincisinde üretmez', () => {
    const s = createMatch(() => 0);
    s.board[0] = { kind: 'base', element: 'fire', level: 2 };
    s.board[1] = { kind: 'base', element: 'ice', level: 2 };
    s.board[2] = { kind: 'base', element: 'ice', level: 2 };
    s.board[3] = { kind: 'base', element: 'fire', level: 2 };
    expect(dropUnit(s, 0, 1)).toBe(true);
    expect(s.board[1]).toEqual({ kind: 'hybrid', hybrid: 'steam', level: 2 });
    expect(dropUnit(s, 2, 3)).toBe(true);
    expect(s.discovered).toEqual(['steam']);
    expect(s.events).toEqual([{ type: 'discover', hybrid: 'steam' }]);
  });
});
