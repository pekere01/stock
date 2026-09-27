import { ENEMY_INFO, HP_GROWTH_PER_WAVE, type EnemyId } from '../data/enemies';
import { GROUP_GAP_MS, type WaveDef } from '../data/waves';

export interface Spawn {
  enemy: EnemyId;
  atMs: number;
}

export function spawnSchedule(wave: WaveDef): Spawn[] {
  const out: Spawn[] = [];
  let t = 0;
  wave.forEach((group, gi) => {
    if (gi > 0) t += GROUP_GAP_MS;
    for (let i = 0; i < group.count; i++) {
      out.push({ enemy: group.enemy, atMs: t });
      if (i < group.count - 1) t += group.intervalMs;
    }
  });
  return out;
}

export function enemyHp(enemy: EnemyId, wave: number): number {
  return Math.round(ENEMY_INFO[enemy].hp * (1 + HP_GROWTH_PER_WAVE * (wave - 1)));
}
