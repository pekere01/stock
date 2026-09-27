import { describe, it, expect } from 'vitest';
import { pathLength, pointAt } from '../src/logic/path';

const pts = [
  { x: 0, y: 0 },
  { x: 3, y: 4 },
  { x: 3, y: 10 },
];

describe('path', () => {
  it('toplam uzunluk segmentlerin toplamı', () => {
    expect(pathLength(pts)).toBe(11);
  });

  it('mesafe 0 veya negatif → başlangıç', () => {
    expect(pointAt(pts, 0)).toEqual({ x: 0, y: 0 });
    expect(pointAt(pts, -5)).toEqual({ x: 0, y: 0 });
  });

  it('segment sonu ve ortası', () => {
    expect(pointAt(pts, 5)).toEqual({ x: 3, y: 4 });
    expect(pointAt(pts, 8)).toEqual({ x: 3, y: 7 });
    const mid = pointAt(pts, 2.5);
    expect(mid.x).toBeCloseTo(1.5);
    expect(mid.y).toBeCloseTo(2);
  });

  it('uzunluğu aşan mesafe → bitiş', () => {
    expect(pointAt(pts, 50)).toEqual({ x: 3, y: 10 });
  });
});
