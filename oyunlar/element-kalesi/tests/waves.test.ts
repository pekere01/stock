import { describe, it, expect } from 'vitest';
import { enemyHp, spawnSchedule } from '../src/logic/waves';
import { WAVES } from '../src/data/waves';

describe('spawnSchedule', () => {
  it('tek grup aralıklarla çıkar', () => {
    expect(spawnSchedule([{ enemy: 'grunt', count: 3, intervalMs: 500 }])).toEqual([
      { enemy: 'grunt', atMs: 0 },
      { enemy: 'grunt', atMs: 500 },
      { enemy: 'grunt', atMs: 1000 },
    ]);
  });

  it('gruplar arasında GROUP_GAP_MS beklenir', () => {
    expect(
      spawnSchedule([
        { enemy: 'grunt', count: 2, intervalMs: 500 },
        { enemy: 'runner', count: 1, intervalMs: 0 },
      ]),
    ).toEqual([
      { enemy: 'grunt', atMs: 0 },
      { enemy: 'grunt', atMs: 500 },
      { enemy: 'runner', atMs: 1500 },
    ]);
  });
});

describe('WAVES', () => {
  it('15 dalga; 5 ve 10 boss, 15 ejderha içerir', () => {
    expect(WAVES).toHaveLength(15);
    expect(WAVES[4].some((g) => g.enemy === 'boss')).toBe(true);
    expect(WAVES[9].some((g) => g.enemy === 'boss')).toBe(true);
    expect(WAVES[14].some((g) => g.enemy === 'dragon')).toBe(true);
  });
});

describe('enemyHp', () => {
  it('dalgayla birlikte artar', () => {
    expect(enemyHp('grunt', 1)).toBe(30);
    expect(enemyHp('grunt', 3)).toBe(39);
  });
});
