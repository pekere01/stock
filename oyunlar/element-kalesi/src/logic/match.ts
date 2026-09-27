import { ELEMENTS, type HybridId, type Unit } from '../data/units';
import { FIRST_BREAK_MS, START_LIVES, START_MANA } from '../data/economy';
import type { EnemyId } from '../data/enemies';
import { SLOT_COUNT } from './layout';
import { merge } from './merge';
import { summonCost } from './economy';
import type { Spawn } from './waves';

export type Rng = () => number;

export interface Enemy {
  id: number;
  type: EnemyId;
  hp: number;
  maxHp: number;
  /** yol üzerinde kat edilen mesafe (px) */
  dist: number;
  slowPct: number;
  slowUntil: number;
  poisonDps: number;
  poisonUntil: number;
}

export type MatchEvent =
  | { type: 'attack'; slot: number; targetIds: number[] }
  | { type: 'discover'; hybrid: HybridId };

export type Phase = 'break' | 'wave' | 'won' | 'lost';

export interface MatchState {
  rng: Rng;
  /** maç başından beri geçen ms */
  time: number;
  mana: number;
  lives: number;
  summons: number;
  board: (Unit | null)[];
  /** yuva başına kalan saldırı bekleme süresi (ms) */
  cooldowns: number[];
  /** 1'den başlar; 0 = ilk dalga henüz başlamadı */
  wave: number;
  phase: Phase;
  breakLeft: number;
  pending: Spawn[];
  waveTime: number;
  enemies: Enemy[];
  nextEnemyId: number;
  discovered: HybridId[];
  /** sahnenin her karede okuyup boşalttığı olaylar */
  events: MatchEvent[];
}

export function createMatch(rng: Rng = Math.random): MatchState {
  return {
    rng,
    time: 0,
    mana: START_MANA,
    lives: START_LIVES,
    summons: 0,
    board: Array.from({ length: SLOT_COUNT }, () => null),
    cooldowns: Array.from({ length: SLOT_COUNT }, () => 0),
    wave: 0,
    phase: 'break',
    breakLeft: FIRST_BREAK_MS,
    pending: [],
    waveTime: 0,
    enemies: [],
    nextEnemyId: 1,
    discovered: [],
    events: [],
  };
}

function isOver(s: MatchState): boolean {
  return s.phase === 'won' || s.phase === 'lost';
}

export function currentSummonCost(s: MatchState): number {
  return summonCost(s.summons);
}

export function summon(s: MatchState): boolean {
  if (isOver(s)) return false;
  const cost = currentSummonCost(s);
  const empty: number[] = [];
  s.board.forEach((u, i) => {
    if (u === null) empty.push(i);
  });
  if (s.mana < cost || empty.length === 0) return false;
  const slot = empty[Math.floor(s.rng() * empty.length)];
  const element = ELEMENTS[Math.floor(s.rng() * ELEMENTS.length)];
  s.board[slot] = { kind: 'base', element, level: 1 };
  s.cooldowns[slot] = 0;
  s.mana -= cost;
  s.summons++;
  return true;
}

/** Birimi `from`dan `to`ya bırakır: hedef boşsa taşır, doluysa birleştirmeyi dener. */
export function dropUnit(s: MatchState, from: number, to: number): boolean {
  if (isOver(s) || from === to) return false;
  const a = s.board[from];
  const b = s.board[to];
  if (!a) return false;
  if (!b) {
    s.board[to] = a;
    s.board[from] = null;
    s.cooldowns[to] = s.cooldowns[from];
    s.cooldowns[from] = 0;
    return true;
  }
  const result = merge(a, b);
  if (!result.ok) return false;
  s.board[to] = result.unit;
  s.board[from] = null;
  s.cooldowns[from] = 0;
  if (result.unit.kind === 'hybrid' && !s.discovered.includes(result.unit.hybrid)) {
    s.discovered.push(result.unit.hybrid);
    s.events.push({ type: 'discover', hybrid: result.unit.hybrid });
  }
  return true;
}
