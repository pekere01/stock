import type { EnemyId } from './enemies';

export interface WaveGroup {
  enemy: EnemyId;
  count: number;
  intervalMs: number;
}

export type WaveDef = WaveGroup[];

/** Bir dalgadaki gruplar arası bekleme. */
export const GROUP_GAP_MS = 1000;

export const WAVES: WaveDef[] = [
  [{ enemy: 'grunt', count: 6, intervalMs: 900 }],
  [{ enemy: 'grunt', count: 8, intervalMs: 800 }],
  [{ enemy: 'grunt', count: 6, intervalMs: 800 }, { enemy: 'runner', count: 4, intervalMs: 600 }],
  [{ enemy: 'runner', count: 8, intervalMs: 500 }, { enemy: 'grunt', count: 6, intervalMs: 700 }],
  [{ enemy: 'grunt', count: 6, intervalMs: 700 }, { enemy: 'boss', count: 1, intervalMs: 0 }],
  [{ enemy: 'brute', count: 4, intervalMs: 1200 }, { enemy: 'grunt', count: 8, intervalMs: 600 }],
  [{ enemy: 'runner', count: 12, intervalMs: 450 }],
  [{ enemy: 'brute', count: 6, intervalMs: 1000 }, { enemy: 'runner', count: 6, intervalMs: 500 }],
  [{ enemy: 'grunt', count: 15, intervalMs: 450 }, { enemy: 'brute', count: 4, intervalMs: 900 }],
  [{ enemy: 'brute', count: 5, intervalMs: 900 }, { enemy: 'boss', count: 2, intervalMs: 3000 }],
  [{ enemy: 'runner', count: 16, intervalMs: 400 }, { enemy: 'brute', count: 6, intervalMs: 800 }],
  [{ enemy: 'brute', count: 10, intervalMs: 800 }],
  [{ enemy: 'grunt', count: 20, intervalMs: 350 }, { enemy: 'runner', count: 12, intervalMs: 350 }],
  [{ enemy: 'boss', count: 3, intervalMs: 2500 }, { enemy: 'brute', count: 8, intervalMs: 700 }],
  [{ enemy: 'brute', count: 6, intervalMs: 800 }, { enemy: 'dragon', count: 1, intervalMs: 0 }],
];
