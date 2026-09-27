import { SUMMON_BASE_COST, SUMMON_COST_STEP } from '../data/economy';

export function summonCost(summonCount: number): number {
  return SUMMON_BASE_COST + SUMMON_COST_STEP * summonCount;
}
