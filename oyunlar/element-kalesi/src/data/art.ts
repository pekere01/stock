/**
 * Görsel eşleştirme — oyun öğesi → görsel dosyası. Tasarımları değiştirmek için yalnız bu dosyayı ve
 * public/assets içeriğini güncelle; oyun kuralları (logic/) buradan hiçbir şey okumaz.
 * Kaynaklar ve lisanslar: assets/CREDITS.md
 */
import type { ElementId, HybridId } from './units';
import type { EnemyId } from './enemies';

export interface SheetDef {
  key: string;
  url: string;
  frameWidth: number;
  frameHeight: number;
}

export interface ImageDef {
  key: string;
  url: string;
}

export interface TowerArt {
  /** 3 kademeli gövde sprite sheet'i (soldan sağa küçük → büyük) */
  base: string;
  /** kademe başına silah sprite sheet'i (0..2); yoksa null */
  weapons: [string | null, string | null, string | null];
  tint?: number;
  /** silah görseli kule ölçeğine göre ek çarpan (varsayılan 1) */
  weaponScale?: number;
}

export interface EnemyArt {
  sheet: string;
  scale: number;
  /** satır başına dolu kare sayısı (9 satır: bekleme ↓↑→, yürüme ↓↑→, ölüm ↓↑→) */
  rows: number[];
}

const A = 'assets';

export const MAP_IMAGES: ImageDef[] = [
  'grass',
  'pad',
  'bush_big',
  'bush_small',
  'plant',
  'tree',
  'star_plant',
  'rock1',
  'rock2',
  'rock3',
].map((name) => ({ key: `map_${name}`, url: `${A}/map/${name}.png` }));

const tower = (n: number, h: number): SheetDef => ({
  key: `t${n}_base`,
  url: `${A}/towers/t${n}_base.png`,
  frameWidth: 64,
  frameHeight: h,
});
const weapon = (n: number, lv: number, size: number): SheetDef => ({
  key: `t${n}_l${lv}`,
  url: `${A}/towers/t${n}_l${lv}.png`,
  frameWidth: size,
  frameHeight: size,
});
const enemy = (key: string): SheetDef => ({ key, url: `${A}/enemies/${key}.png`, frameWidth: 64, frameHeight: 64 });

export const SHEETS: SheetDef[] = [
  tower(1, 128), weapon(1, 1, 96), weapon(1, 2, 96), weapon(1, 3, 96),
  tower(2, 192), weapon(2, 1, 96), weapon(2, 3, 128),
  tower(3, 128), weapon(3, 1, 96), weapon(3, 2, 96), weapon(3, 3, 96),
  tower(4, 128), weapon(4, 1, 128), weapon(4, 2, 128), weapon(4, 3, 128),
  tower(5, 128),
  tower(6, 128), weapon(6, 1, 64), weapon(6, 2, 96), weapon(6, 3, 96),
  tower(7, 128), weapon(7, 1, 64), weapon(7, 2, 64), weapon(7, 3, 64),
  tower(8, 192), weapon(8, 1, 48), weapon(8, 2, 48), weapon(8, 3, 64),
  enemy('leafbug'), enemy('firebug'), enemy('magma_crab'), enemy('scorpion'), enemy('voidbutterfly'),
];

export const TOWER_ART: Record<ElementId | HybridId, TowerArt> = {
  fire: { base: 't8_base', weapons: ['t8_l1', 't8_l2', 't8_l3'] },
  ice: { base: 't1_base', weapons: ['t1_l1', 't1_l2', 't1_l3'] },
  lightning: { base: 't7_base', weapons: ['t7_l1', 't7_l2', 't7_l3'] },
  nature: { base: 't3_base', weapons: ['t3_l1', 't3_l2', 't3_l3'] },
  steam: { base: 't6_base', weapons: ['t6_l1', 't6_l2', 't6_l3'] },
  plasma: { base: 't4_base', weapons: ['t4_l1', 't4_l2', 't4_l3'] },
  ash: { base: 't5_base', weapons: [null, null, null] },
  crystal: { base: 't2_base', weapons: ['t2_l1', 't2_l1', 't2_l3'], weaponScale: 0.55 },
  frost: { base: 't2_base', weapons: ['t2_l1', 't2_l1', 't2_l3'], tint: 0x9fe8ff, weaponScale: 0.55 },
  storm: { base: 't5_base', weapons: [null, null, null], tint: 0xb9ffc4 },
};

export const ENEMY_ART: Record<EnemyId, EnemyArt> = {
  grunt: { sheet: 'leafbug', scale: 1, rows: [6, 6, 6, 8, 8, 8, 7, 7, 7] },
  runner: { sheet: 'firebug', scale: 0.9, rows: [12, 12, 12, 16, 16, 16, 22, 22, 22] },
  brute: { sheet: 'magma_crab', scale: 1.3, rows: [8, 8, 8, 8, 8, 8, 10, 10, 10] },
  boss: { sheet: 'scorpion', scale: 1.9, rows: [8, 8, 8, 8, 8, 8, 8, 8, 8] },
  dragon: { sheet: 'voidbutterfly', scale: 2.6, rows: [6, 6, 6, 4, 4, 4, 12, 12, 12] },
};

/** Gövde karelerinde görünen kısmın üst kenarı (px, kademe 0..2) — silahı kule tepesine oturtmak için. */
export const BASE_TOPS: Record<string, [number, number, number]> = {
  t1_base: [30, 21, 12],
  t2_base: [82, 73, 64],
  t3_base: [31, 10, 1],
  t4_base: [21, 12, 3],
  t5_base: [22, 14, 7],
  t6_base: [24, 15, 7],
  t7_base: [25, 16, 7],
  t8_base: [94, 85, 76],
};

/** Kule görsellerinin ölçeği (64px genişlik → ekranda ~45px). */
export const TOWER_SCALE = 0.7;

/** Yürüme animasyonu satırları. */
export const WALK_ROW = { down: 3, up: 4, side: 5 } as const;
export const DEATH_ROW = 6;

/** Birim seviyesi (1..5) → görsel kademe (0..2). */
export function tierForLevel(level: number): 0 | 1 | 2 {
  if (level <= 1) return 0;
  if (level <= 3) return 1;
  return 2;
}

/** Yol ve harita süsleri (oyun alanı koordinatları). */
export const ROAD_STYLE = { edge: 0x6b4a2b, fill: 0xdcbf8f, width: 46, edgeWidth: 6 };

export const DECORATIONS: { key: string; x: number; y: number; scale?: number }[] = [
  { key: 'map_tree', x: 30, y: 250, scale: 0.9 },
  { key: 'map_bush_big', x: 420, y: 60 },
  { key: 'map_rock2', x: 420, y: 250, scale: 0.8 },
  { key: 'map_star_plant', x: 30, y: 420, scale: 0.8 },
  { key: 'map_tree', x: 420, y: 420 },
  { key: 'map_bush_small', x: 30, y: 590 },
  { key: 'map_rock1', x: 425, y: 600, scale: 0.8 },
  { key: 'map_plant', x: 180, y: 90, scale: 0.8 },
  { key: 'map_rock3', x: 290, y: 90, scale: 0.7 },
  { key: 'map_bush_small', x: 420, y: 740 },
  { key: 'map_star_plant', x: 170, y: 770, scale: 0.7 },
];
