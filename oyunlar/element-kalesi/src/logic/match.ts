import { ELEMENTS, type HybridId, type Unit, type UnitStats } from '../data/units';
import { BREAK_MS, CHAIN_FACTOR, FIRST_BREAK_MS, SPLASH_FACTOR, START_LIVES, START_MANA } from '../data/economy';
import { ENEMY_INFO, type EnemyId } from '../data/enemies';
import { PATH, type Point } from '../data/level';
import { WAVES } from '../data/waves';
import { SLOT_COUNT, slotCenter } from './layout';
import { merge } from './merge';
import { summonCost } from './economy';
import { pathLength, pointAt } from './path';
import { unitStats } from './stats';
import { enemyHp, spawnSchedule, type Spawn } from './waves';

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

export const PATH_LENGTH = pathLength(PATH);

export function enemyPosition(e: Enemy): Point {
  return pointAt(PATH, e.dist);
}

export function step(s: MatchState, dt: number): void {
  if (isOver(s)) return;
  s.time += dt;

  if (s.phase === 'break') {
    s.breakLeft -= dt;
    if (s.breakLeft <= 0) startNextWave(s);
  } else {
    spawnDue(s, dt);
  }

  moveEnemies(s, dt);
  if (s.lives <= 0) {
    s.lives = 0;
    s.phase = 'lost';
    return;
  }

  unitsAttack(s, dt);
  collectDead(s);

  if (s.phase === 'wave' && s.pending.length === 0 && s.enemies.length === 0) {
    if (s.wave >= WAVES.length) {
      s.phase = 'won';
    } else {
      s.phase = 'break';
      s.breakLeft = BREAK_MS;
    }
  }
}

function startNextWave(s: MatchState): void {
  s.wave++;
  s.pending = spawnSchedule(WAVES[s.wave - 1]);
  s.waveTime = 0;
  s.phase = 'wave';
}

function spawnDue(s: MatchState, dt: number): void {
  s.waveTime += dt;
  while (s.pending.length > 0 && s.pending[0].atMs <= s.waveTime) {
    const spawn = s.pending.shift()!;
    const hp = enemyHp(spawn.enemy, s.wave);
    s.enemies.push({
      id: s.nextEnemyId++,
      type: spawn.enemy,
      hp,
      maxHp: hp,
      dist: 0,
      slowPct: 0,
      slowUntil: 0,
      poisonDps: 0,
      poisonUntil: 0,
    });
  }
}

function moveEnemies(s: MatchState, dt: number): void {
  for (const e of s.enemies) {
    if (e.poisonUntil > s.time) e.hp -= (e.poisonDps * dt) / 1000;
    const slow = e.slowUntil > s.time ? e.slowPct : 0;
    e.dist += (ENEMY_INFO[e.type].speed * (1 - slow) * dt) / 1000;
  }
  for (const e of s.enemies) {
    if (e.dist >= PATH_LENGTH && e.hp > 0) s.lives -= ENEMY_INFO[e.type].leak;
  }
  s.enemies = s.enemies.filter((e) => e.dist < PATH_LENGTH);
}

export function pickTarget(s: MatchState, origin: Point, range: number): Enemy | null {
  let best: Enemy | null = null;
  for (const e of s.enemies) {
    if (e.hp <= 0) continue;
    const p = enemyPosition(e);
    if (Math.hypot(p.x - origin.x, p.y - origin.y) > range) continue;
    if (!best || e.dist > best.dist) best = e;
  }
  return best;
}

function unitsAttack(s: MatchState, dt: number): void {
  s.board.forEach((unit, slot) => {
    if (!unit) return;
    s.cooldowns[slot] = Math.max(0, s.cooldowns[slot] - dt);
    if (s.cooldowns[slot] > 0) return;
    const stats = unitStats(unit);
    const target = pickTarget(s, slotCenter(slot), stats.range);
    if (!target) return;
    const targetIds = applyAttack(s, stats, target);
    s.cooldowns[slot] = stats.cooldownMs;
    s.events.push({ type: 'attack', slot, targetIds });
  });
}

function applyAttack(s: MatchState, st: UnitStats, target: Enemy): number[] {
  const hit = [target.id];
  target.hp -= st.damage;
  const tp = enemyPosition(target);

  if (st.splashRadius) {
    for (const e of s.enemies) {
      if (e === target || e.hp <= 0) continue;
      const p = enemyPosition(e);
      if (Math.hypot(p.x - tp.x, p.y - tp.y) <= st.splashRadius) {
        e.hp -= st.damage * SPLASH_FACTOR;
        hit.push(e.id);
      }
    }
  }

  if (st.slowPct && st.slowMs) {
    const current = target.slowUntil > s.time ? target.slowPct : 0;
    target.slowPct = Math.max(st.slowPct, current);
    target.slowUntil = s.time + st.slowMs;
  }

  if (st.poisonDps && st.poisonMs) {
    const current = target.poisonUntil > s.time ? target.poisonDps : 0;
    target.poisonDps = Math.max(st.poisonDps, current);
    target.poisonUntil = s.time + st.poisonMs;
  }

  if (st.chain && st.chainRange) {
    const chainRange = st.chainRange;
    const nearby = s.enemies
      .filter((e) => e !== target && e.hp > 0 && !hit.includes(e.id))
      .map((e) => {
        const p = enemyPosition(e);
        return { e, d: Math.hypot(p.x - tp.x, p.y - tp.y) };
      })
      .filter((o) => o.d <= chainRange)
      .sort((a, b) => a.d - b.d)
      .slice(0, st.chain);
    for (const o of nearby) {
      o.e.hp -= st.damage * CHAIN_FACTOR;
      hit.push(o.e.id);
    }
  }

  return hit;
}

function collectDead(s: MatchState): void {
  for (const e of s.enemies) {
    if (e.hp <= 0) s.mana += ENEMY_INFO[e.type].reward;
  }
  s.enemies = s.enemies.filter((e) => e.hp > 0);
}
