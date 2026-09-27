export type EnemyId = 'grunt' | 'runner' | 'brute' | 'boss' | 'dragon';

export interface EnemyInfo {
  name: string;
  hp: number;
  /** piksel / saniye */
  speed: number;
  /** öldürülünce verilen mana */
  reward: number;
  /** kaleye ulaşınca düşürdüğü can */
  leak: number;
  color: number;
  radius: number;
}

export const ENEMY_INFO: Record<EnemyId, EnemyInfo> = {
  grunt: { name: 'Goblin', hp: 30, speed: 60, reward: 5, leak: 1, color: 0x9ccc65, radius: 10 },
  runner: { name: 'Kurt', hp: 18, speed: 110, reward: 5, leak: 1, color: 0xbdbdbd, radius: 9 },
  brute: { name: 'Trol', hp: 90, speed: 40, reward: 10, leak: 2, color: 0x8d6e63, radius: 14 },
  boss: { name: 'Ork Şefi', hp: 600, speed: 35, reward: 50, leak: 5, color: 0xe53935, radius: 20 },
  dragon: { name: 'Ejderha', hp: 2000, speed: 30, reward: 100, leak: 20, color: 0x7b1fa2, radius: 26 },
};

/** Her dalgada düşman canı taban değerin %15'i kadar artar. */
export const HP_GROWTH_PER_WAVE = 0.15;
