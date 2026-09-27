import { SLOT_POSITIONS, SLOT_SIZE, type Point } from '../data/level';

export const SLOT_COUNT = SLOT_POSITIONS.length;

export function slotCenter(index: number): Point {
  return { ...SLOT_POSITIONS[index] };
}

export function slotAt(x: number, y: number): number | null {
  const half = SLOT_SIZE / 2;
  for (let i = 0; i < SLOT_COUNT; i++) {
    const c = SLOT_POSITIONS[i];
    if (Math.abs(x - c.x) <= half && Math.abs(y - c.y) <= half) return i;
  }
  return null;
}
