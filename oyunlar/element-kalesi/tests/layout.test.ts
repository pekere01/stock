import { describe, it, expect } from 'vitest';
import { SLOT_COUNT, slotAt, slotCenter } from '../src/logic/layout';
import { PATH, SLOT_SIZE, type Point } from '../src/data/level';

function distToSegment(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

function distToPath(p: Point): number {
  let best = Infinity;
  for (let i = 0; i < PATH.length - 1; i++) best = Math.min(best, distToSegment(p, PATH[i], PATH[i + 1]));
  return best;
}

describe('layout', () => {
  it('15 yuva var', () => {
    expect(SLOT_COUNT).toBe(15);
  });

  it('yuva içindeki nokta o yuvayı verir', () => {
    for (let i = 0; i < SLOT_COUNT; i++) {
      const c = slotCenter(i);
      expect(slotAt(c.x, c.y)).toBe(i);
      expect(slotAt(c.x + SLOT_SIZE / 2 - 1, c.y - SLOT_SIZE / 2 + 1)).toBe(i);
    }
  });

  it('yuvalar üst üste binmez', () => {
    for (let i = 0; i < SLOT_COUNT; i++) {
      for (let j = i + 1; j < SLOT_COUNT; j++) {
        const a = slotCenter(i);
        const b = slotCenter(j);
        expect(Math.abs(a.x - b.x) >= SLOT_SIZE || Math.abs(a.y - b.y) >= SLOT_SIZE).toBe(true);
      }
    }
  });

  it('yuvalar yolun üstünde değil ama yola yakın', () => {
    for (let i = 0; i < SLOT_COUNT; i++) {
      const d = distToPath(slotCenter(i));
      expect(d).toBeGreaterThan(40);
      expect(d).toBeLessThan(100);
    }
  });

  it('tahta dışı → null', () => {
    expect(slotAt(10, 10)).toBeNull();
    expect(slotAt(90, 400)).toBeNull();
  });
});
