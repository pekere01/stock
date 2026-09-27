import { describe, it, expect } from 'vitest';
import { SLOT_COUNT, slotAt, slotCenter } from '../src/logic/layout';

describe('layout', () => {
  it('15 yuva var', () => {
    expect(SLOT_COUNT).toBe(15);
  });

  it('yuva merkezleri satır satır dizilir', () => {
    expect(slotCenter(0)).toEqual({ x: 140, y: 220 });
    expect(slotCenter(4)).toEqual({ x: 225, y: 305 });
    expect(slotCenter(14)).toEqual({ x: 310, y: 560 });
  });

  it('yuva içindeki nokta o yuvayı verir', () => {
    expect(slotAt(140, 220)).toBe(0);
    expect(slotAt(255, 275)).toBe(4);
  });

  it('yuva arası boşluk ve tahta dışı → null', () => {
    expect(slotAt(182, 220)).toBeNull();
    expect(slotAt(10, 10)).toBeNull();
  });
});
