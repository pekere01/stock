import { describe, it, expect } from 'vitest';
import { createMatch, PATH_LENGTH, step, type Enemy, type MatchState } from '../src/logic/match';
import { ENEMY_INFO, type EnemyId } from '../src/data/enemies';
import { BREAK_MS, FIRST_BREAK_MS } from '../src/data/economy';

function inWave(): MatchState {
  const s = createMatch(() => 0);
  s.phase = 'wave';
  s.wave = 1;
  s.pending = [];
  return s;
}

function addEnemy(s: MatchState, type: EnemyId, dist: number, hp = ENEMY_INFO[type].hp): Enemy {
  const e: Enemy = {
    id: s.nextEnemyId++,
    type,
    hp,
    maxHp: ENEMY_INFO[type].hp,
    dist,
    slowPct: 0,
    slowUntil: 0,
    poisonDps: 0,
    poisonUntil: 0,
  };
  s.enemies.push(e);
  return e;
}

describe('dalga akışı', () => {
  it('ilk mola bitince dalga 1 başlar, ilk düşman bir sonraki karede çıkar', () => {
    const s = createMatch(() => 0);
    step(s, FIRST_BREAK_MS);
    expect(s.phase).toBe('wave');
    expect(s.wave).toBe(1);
    expect(s.enemies).toHaveLength(0);
    step(s, 16);
    expect(s.enemies).toHaveLength(1);
    expect(s.enemies[0].hp).toBe(30);
  });

  it('dalga temizlenince mola başlar', () => {
    const s = inWave();
    step(s, 16);
    expect(s.phase).toBe('break');
    expect(s.breakLeft).toBe(BREAK_MS);
  });

  it('son dalga temizlenince kazanılır', () => {
    const s = inWave();
    s.wave = 15;
    step(s, 16);
    expect(s.phase).toBe('won');
  });

  it('bitmiş maçta step hiçbir şey yapmaz', () => {
    const s = inWave();
    s.phase = 'lost';
    addEnemy(s, 'grunt', 0);
    step(s, 1000);
    expect(s.enemies[0].dist).toBe(0);
  });
});

describe('hareket ve kale', () => {
  it('yol uzunluğu 1910', () => {
    expect(PATH_LENGTH).toBe(1910);
  });

  it('düşman hızıyla ilerler', () => {
    const s = inWave();
    const e = addEnemy(s, 'grunt', 0);
    step(s, 1000);
    expect(e.dist).toBeCloseTo(60);
  });

  it('yavaşlatma hızı düşürür', () => {
    const s = inWave();
    const e = addEnemy(s, 'grunt', 0);
    e.slowPct = 0.5;
    e.slowUntil = 5000;
    step(s, 1000);
    expect(e.dist).toBeCloseTo(30);
  });

  it('zehir zamanla can yakar', () => {
    const s = inWave();
    const e = addEnemy(s, 'grunt', 0);
    e.poisonDps = 10;
    e.poisonUntil = 5000;
    step(s, 1000);
    expect(e.hp).toBeCloseTo(20);
  });

  it('kaleye ulaşan düşman can düşürür ve kaldırılır', () => {
    const s = inWave();
    addEnemy(s, 'grunt', PATH_LENGTH - 0.5);
    step(s, 100);
    expect(s.lives).toBe(19);
    expect(s.enemies).toHaveLength(0);
  });

  it('can biterse kaybedilir', () => {
    const s = inWave();
    s.lives = 1;
    addEnemy(s, 'brute', PATH_LENGTH - 0.5);
    step(s, 100);
    expect(s.lives).toBe(0);
    expect(s.phase).toBe('lost');
  });
});

describe('savaş', () => {
  // Yuva 0 merkezi (150,205). Yol üzerinde dist 240 → (150,150), mesafe 55.
  it('menzildeki düşmana vurur, bekleme süresi başlar, olay üretir', () => {
    const s = inWave();
    s.board[0] = { kind: 'base', element: 'fire', level: 1 };
    const e = addEnemy(s, 'grunt', 240);
    step(s, 16);
    expect(e.hp).toBe(22);
    expect(s.cooldowns[0]).toBe(900);
    expect(s.events).toContainEqual({ type: 'attack', slot: 0, targetIds: [e.id] });
  });

  it('menzil dışındakine vurmaz', () => {
    const s = inWave();
    s.board[0] = { kind: 'base', element: 'fire', level: 1 };
    const e = addEnemy(s, 'grunt', 1000);
    step(s, 16);
    expect(e.hp).toBe(30);
    expect(s.cooldowns[0]).toBe(0);
  });

  it('kaleye en yakın (en ilerideki) düşmanı hedefler', () => {
    const s = inWave();
    s.board[0] = { kind: 'base', element: 'ice', level: 1 };
    const back = addEnemy(s, 'grunt', 220);
    const front = addEnemy(s, 'grunt', 240);
    step(s, 16);
    expect(front.hp).toBe(26);
    expect(back.hp).toBe(30);
    expect(front.slowPct).toBe(0.4);
    expect(front.slowUntil).toBe(16 + 1200);
  });

  it('ateş çevreye alan hasarı verir', () => {
    const s = inWave();
    s.board[0] = { kind: 'base', element: 'fire', level: 1 };
    const back = addEnemy(s, 'grunt', 220);
    const front = addEnemy(s, 'grunt', 240);
    step(s, 16);
    expect(front.hp).toBe(22);
    expect(back.hp).toBe(26);
  });

  it('şimşek yakındaki 2 düşmana sekiyor', () => {
    const s = inWave();
    s.board[0] = { kind: 'base', element: 'lightning', level: 1 };
    const a = addEnemy(s, 'grunt', 240);
    const b = addEnemy(s, 'grunt', 220);
    const c = addEnemy(s, 'grunt', 200);
    step(s, 16);
    expect(a.hp).toBeCloseTo(24);
    expect(b.hp).toBeCloseTo(26.4);
    expect(c.hp).toBeCloseTo(26.4);
  });

  it('doğa zehir uygular', () => {
    const s = inWave();
    s.board[0] = { kind: 'base', element: 'nature', level: 1 };
    const e = addEnemy(s, 'grunt', 240);
    step(s, 16);
    expect(e.hp).toBe(27);
    expect(e.poisonDps).toBe(6);
    expect(e.poisonUntil).toBe(16 + 2000);
  });

  it('ölen düşman kaldırılır ve mana verir', () => {
    const s = inWave();
    s.board[0] = { kind: 'base', element: 'fire', level: 1 };
    addEnemy(s, 'grunt', 240, 5);
    addEnemy(s, 'grunt', 1000);
    step(s, 16);
    expect(s.enemies).toHaveLength(1);
    expect(s.mana).toBe(55);
  });
});
