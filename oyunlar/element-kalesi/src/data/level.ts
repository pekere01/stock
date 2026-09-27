export interface Point {
  x: number;
  y: number;
}

export const GAME_WIDTH = 450;
export const GAME_HEIGHT = 800;

/** Düşman yolu: üstten girer, tahtanın etrafını dolanır, sol alttaki kale kapısında biter. */
export const PATH: Point[] = [
  { x: 40, y: -20 },
  { x: 40, y: 130 },
  { x: 410, y: 130 },
  { x: 410, y: 670 },
  { x: 40, y: 670 },
  { x: 40, y: 780 },
];

export const BOARD_COLS = 3;
export const BOARD_ROWS = 5;
export const SLOT_SIZE = 70;
export const SLOT_GAP = 15;
/** Sol üst yuvanın merkezi. */
export const BOARD_ORIGIN: Point = { x: 140, y: 220 };
