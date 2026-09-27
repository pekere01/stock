import { describe, it, expect } from 'vitest';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { DECORATIONS, ENEMY_ART, MAP_IMAGES, SHEETS, TOWER_ART, tierForLevel } from '../src/data/art';
import { ELEMENTS, HYBRID_INFO } from '../src/data/units';
import { ENEMY_INFO } from '../src/data/enemies';

const sheetKeys = new Set(SHEETS.map((s) => s.key));
const imageKeys = new Set(MAP_IMAGES.map((i) => i.key));

describe('art', () => {
  it('her element ve melezin kule görseli var ve yüklenen dosyalara bağlı', () => {
    for (const id of [...ELEMENTS, ...Object.keys(HYBRID_INFO)] as (keyof typeof TOWER_ART)[]) {
      const art = TOWER_ART[id];
      expect(art, id).toBeDefined();
      expect(sheetKeys.has(art.base), `${id} gövde`).toBe(true);
      for (const w of art.weapons) if (w) expect(sheetKeys.has(w), `${id} silah ${w}`).toBe(true);
    }
  });

  it('her düşmanın görseli var, 9 animasyon satırı tanımlı', () => {
    for (const id of Object.keys(ENEMY_INFO) as (keyof typeof ENEMY_ART)[]) {
      const art = ENEMY_ART[id];
      expect(sheetKeys.has(art.sheet), id).toBe(true);
      expect(art.rows).toHaveLength(9);
    }
  });

  it('süsler yüklenen harita görsellerini kullanır', () => {
    for (const d of DECORATIONS) expect(imageKeys.has(d.key), d.key).toBe(true);
  });

  it('tüm görsel dosyaları diskte var', () => {
    for (const f of [...SHEETS, ...MAP_IMAGES]) {
      expect(existsSync(resolve(__dirname, '../public', f.url)), f.url).toBe(true);
    }
  });

  it('seviye → görsel kademe', () => {
    expect([1, 2, 3, 4, 5].map(tierForLevel)).toEqual([0, 1, 1, 2, 2]);
  });
});
