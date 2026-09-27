export type ElementId = 'fire' | 'ice' | 'lightning' | 'nature';
export type HybridId = 'steam' | 'plasma' | 'ash' | 'crystal' | 'frost' | 'storm';

export type Unit =
  | { kind: 'base'; element: ElementId; level: number }
  | { kind: 'hybrid'; hybrid: HybridId; level: number };

export interface UnitStats {
  damage: number;
  range: number;
  cooldownMs: number;
  splashRadius?: number;
  slowPct?: number;
  slowMs?: number;
  chain?: number;
  chainRange?: number;
  poisonDps?: number;
  poisonMs?: number;
}

export const ELEMENTS: ElementId[] = ['fire', 'ice', 'lightning', 'nature'];
export const MAX_LEVEL = 5;
export const MIN_HYBRID_LEVEL = 2;
/** Her seviye hasara taban değerin %60'ı kadar ekler. */
export const LEVEL_DAMAGE_STEP = 0.6;
/** Melezlerin ebeveyn toplamına göre ek güç çarpanı. */
export const HYBRID_BONUS = 1.25;

export const ELEMENT_INFO: Record<ElementId, { name: string; icon: string; color: number; stats: UnitStats }> = {
  fire: { name: 'Ateş', icon: '🔥', color: 0xff5a36, stats: { damage: 8, range: 120, cooldownMs: 900, splashRadius: 50 } },
  ice: { name: 'Buz', icon: '❄️', color: 0x5ac8ff, stats: { damage: 4, range: 130, cooldownMs: 700, slowPct: 0.4, slowMs: 1200 } },
  lightning: { name: 'Şimşek', icon: '⚡', color: 0xffd23f, stats: { damage: 6, range: 140, cooldownMs: 800, chain: 2, chainRange: 80 } },
  nature: { name: 'Doğa', icon: '🌿', color: 0x5ad16b, stats: { damage: 3, range: 120, cooldownMs: 1000, poisonDps: 6, poisonMs: 2000 } },
};

export const HYBRID_INFO: Record<HybridId, { name: string; parents: [ElementId, ElementId]; color: number }> = {
  steam: { name: 'Buhar Büyücüsü', parents: ['fire', 'ice'], color: 0xd9d9d9 },
  plasma: { name: 'Plazma Topçusu', parents: ['fire', 'lightning'], color: 0xff9f1c },
  ash: { name: 'Kül Druidi', parents: ['fire', 'nature'], color: 0x8d6e63 },
  crystal: { name: 'Kristal Okçu', parents: ['ice', 'lightning'], color: 0xb388ff },
  frost: { name: 'Don Sarmaşığı', parents: ['ice', 'nature'], color: 0x4dd0e1 },
  storm: { name: 'Fırtına Druidi', parents: ['lightning', 'nature'], color: 0x26a69a },
};
