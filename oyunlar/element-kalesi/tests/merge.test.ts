import { describe, it, expect } from 'vitest';
import { merge, hybridFor } from '../src/logic/merge';
import { ELEMENTS, type ElementId, type Unit } from '../src/data/units';

const base = (element: ElementId, level: number): Unit => ({ kind: 'base', element, level });

describe('merge', () => {
  it('aynı element + aynı seviye → bir üst seviye', () => {
    expect(merge(base('fire', 1), base('fire', 1))).toEqual({ ok: true, unit: base('fire', 2) });
  });

  it('azami seviyede aynı element birleşmez', () => {
    expect(merge(base('ice', 5), base('ice', 5))).toEqual({ ok: false });
  });

  it('farklı seviyeler birleşmez', () => {
    expect(merge(base('fire', 2), base('fire', 1))).toEqual({ ok: false });
  });

  it('seviye 1 farklı elementler melez oluşturmaz', () => {
    expect(merge(base('fire', 1), base('ice', 1))).toEqual({ ok: false });
  });

  it('seviye 2+ farklı elementler melez oluşturur, sıra fark etmez', () => {
    const expected = { ok: true, unit: { kind: 'hybrid', hybrid: 'steam', level: 2 } };
    expect(merge(base('fire', 2), base('ice', 2))).toEqual(expected);
    expect(merge(base('ice', 2), base('fire', 2))).toEqual(expected);
  });

  it('melez içeren birleştirme geçersiz', () => {
    const hybrid: Unit = { kind: 'hybrid', hybrid: 'steam', level: 2 };
    expect(merge(hybrid, base('fire', 2))).toEqual({ ok: false });
    expect(merge(hybrid, hybrid)).toEqual({ ok: false });
  });
});

describe('hybridFor', () => {
  it('6 farklı element çifti 6 farklı melez verir', () => {
    const found = new Set<string>();
    for (let i = 0; i < ELEMENTS.length; i++) {
      for (let j = i + 1; j < ELEMENTS.length; j++) {
        const h = hybridFor(ELEMENTS[i], ELEMENTS[j]);
        expect(h).not.toBeNull();
        found.add(h!);
      }
    }
    expect(found.size).toBe(6);
  });

  it('aynı element için melez yok', () => {
    expect(hybridFor('fire', 'fire')).toBeNull();
  });
});
