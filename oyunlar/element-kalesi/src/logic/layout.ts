import { BOARD_COLS, BOARD_ORIGIN, BOARD_ROWS, SLOT_GAP, SLOT_SIZE, type Point } from '../data/level';

export const SLOT_COUNT = BOARD_COLS * BOARD_ROWS;

export function slotCenter(index: number): Point {
  const col = index % BOARD_COLS;
  const row = Math.floor(index / BOARD_COLS);
  const step = SLOT_SIZE + SLOT_GAP;
  return { x: BOARD_ORIGIN.x + col * step, y: BOARD_ORIGIN.y + row * step };
}

export function slotAt(x: number, y: number): number | null {
  const half = SLOT_SIZE / 2;
  for (let i = 0; i < SLOT_COUNT; i++) {
    const c = slotCenter(i);
    if (Math.abs(x - c.x) <= half && Math.abs(y - c.y) <= half) return i;
  }
  return null;
}
