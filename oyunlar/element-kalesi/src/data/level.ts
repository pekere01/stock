export interface Point {
  x: number;
  y: number;
}

export const GAME_WIDTH = 450;
export const GAME_HEIGHT = 800;

/** Düşman yolu: üstten girer, yılan gibi kıvrılarak iner, sol alttaki kale kapısında biter. */
export const PATH: Point[] = [
  { x: 90, y: -30 },
  { x: 90, y: 150 },
  { x: 360, y: 150 },
  { x: 360, y: 330 },
  { x: 90, y: 330 },
  { x: 90, y: 510 },
  { x: 360, y: 510 },
  { x: 360, y: 690 },
  { x: 90, y: 690 },
  { x: 90, y: 800 },
];

/** Kule platformunun kenar uzunluğu (dokunma alanı). */
export const SLOT_SIZE = 60;

const COLS = [150, 225, 300];
const ROWS = [205, 275, 385, 455, 600];

/** Yolun kıvrımları arasındaki 15 kule platformu (satır satır, soldan sağa). */
export const SLOT_POSITIONS: Point[] = ROWS.flatMap((y) => COLS.map((x) => ({ x, y })));
