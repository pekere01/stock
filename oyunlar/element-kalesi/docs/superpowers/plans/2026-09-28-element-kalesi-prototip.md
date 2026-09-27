---
title: Element Kalesi — Prototip Uygulama Planı
tags: [proje/aktif, alan/oyun, tip/plan]
created: 2026-09-28
type: plan
---

# Element Kalesi Prototip Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tarayıcıda ve telefonda oynanabilen, tek maçlık (15 dalga) Merge + Tower Defense prototipi — çağır, sürükle-birleştir, melez keşfet, dalgaları durdur, kazan/kaybet.

**Architecture:** Oyun kuralları `src/logic/` altında saf TypeScript simülasyonu (`MatchState` + `step(state, dt)`), Phaser'a hiç bağımlı değil ve Vitest ile test edilir. Tüm denge sayıları `src/data/`'da. `src/scenes/MatchScene.ts` yalnızca state'i çizer ve dokunmayı `summon`/`dropUnit` çağrılarına çevirir. Grafikler bu aşamada basit şekil + emoji.

**Tech Stack:** Phaser 3.90.0, TypeScript 5.9.3, Vite 7.3.6, Vitest 3.2.7, Node 24.

**Kaynak spec:** [[2026-09-28-element-kalesi-design]]

## Global Constraints

- Paket sürümleri sabit: `phaser@3.90.0`, `typescript@5.9.3`, `vite@7.3.6`, `vitest@3.2.7`.
- `src/logic/**` ve `src/data/**` içinde **hiçbir** `phaser` import'u olmaz.
- Tüm denge sayıları (can, hız, hasar, maliyet, dalga) yalnız `src/data/` içinde.
- Oyun alanı dikey **450×800**, `Scale.FIT` ile ekrana sığdırılır.
- Oyuncuya görünen tüm metinler Türkçe.
- Proje kökü: `C:\Users\Lenovo\Desktop\workspace\01_Projects\oyunlar\element-kalesi\` — tüm komutlar burada çalıştırılır. Git deposu kökü bir üst seviyede (`01_Projects`); `git add` göreli yollarla bu klasörden yapılır.
- Prototipte kapsam dışı: meta ilerleme (altın, yükseltme, bölüm seçimi), kayıt, reklam, Capacitor, gerçek grafikler.

## Dosya Haritası

| Dosya | Sorumluluk |
|---|---|
| `package.json`, `tsconfig.json`, `vite.config.ts`, `index.html`, `.gitignore` | Proje iskeleti, test ve dev sunucu yapılandırması |
| `src/data/units.ts` | Element/melez tipleri, temel istatistikler, melez tarifleri |
| `src/data/level.ts` | Oyun alanı boyutu, yol noktaları, tahta yerleşimi |
| `src/data/enemies.ts` | Düşman tipleri ve istatistikleri |
| `src/data/waves.ts` | 15 dalganın tanımı |
| `src/data/economy.ts` | Mana, can, çağırma maliyeti, mola süreleri, etki çarpanları |
| `src/logic/merge.ts` | `merge(a, b)` kuralı, `hybridFor` |
| `src/logic/path.ts` | Yol uzunluğu, yol üzerindeki mesafe → konum |
| `src/logic/layout.ts` | Yuva merkezleri, dokunulan noktanın yuvası |
| `src/logic/stats.ts` | Birim (seviye/melez) → savaş istatistikleri |
| `src/logic/waves.ts` | Dalga → zamanlanmış düşman listesi, dalgaya göre can |
| `src/logic/economy.ts` | Çağırma maliyeti formülü |
| `src/logic/match.ts` | Maç durumu, çağırma, sürükle-bırak, simülasyon adımı |
| `src/scenes/MatchScene.ts` | Çizim, HUD, dokunma, bitiş ekranı |
| `src/main.ts` | Phaser oyununu başlatır |
| `tests/*.test.ts` | `logic/` birim testleri |

---

### Task 1: Proje iskeleti + birleştirme kuralı

**Files:**
- Create: `package.json`, `tsconfig.json`, `vite.config.ts`, `.gitignore`
- Create: `src/data/units.ts`
- Create: `src/logic/merge.ts`
- Test: `tests/merge.test.ts`

**Interfaces:**
- Consumes: —
- Produces:
  - `type ElementId = 'fire' | 'ice' | 'lightning' | 'nature'`
  - `type HybridId = 'steam' | 'plasma' | 'ash' | 'crystal' | 'frost' | 'storm'`
  - `type Unit = { kind: 'base'; element: ElementId; level: number } | { kind: 'hybrid'; hybrid: HybridId; level: number }`
  - `interface UnitStats { damage; range; cooldownMs; splashRadius?; slowPct?; slowMs?; chain?; chainRange?; poisonDps?; poisonMs? }` (hepsi `number`)
  - `ELEMENTS: ElementId[]`, `ELEMENT_INFO: Record<ElementId, { name; icon; color; stats: UnitStats }>`, `HYBRID_INFO: Record<HybridId, { name; parents: [ElementId, ElementId]; color }>`, `MAX_LEVEL`, `MIN_HYBRID_LEVEL`, `LEVEL_DAMAGE_STEP`, `HYBRID_BONUS`
  - `type MergeResult = { ok: true; unit: Unit } | { ok: false }`
  - `merge(a: Unit, b: Unit): MergeResult`, `hybridFor(a: ElementId, b: ElementId): HybridId | null`

- [ ] **Step 1: İskelet dosyalarını oluştur**

`package.json`:
```json
{
  "name": "element-kalesi",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite --host",
    "build": "tsc --noEmit && vite build",
    "test": "vitest run"
  },
  "dependencies": {
    "phaser": "3.90.0"
  },
  "devDependencies": {
    "typescript": "5.9.3",
    "vite": "7.3.6",
    "vitest": "3.2.7"
  }
}
```

`tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "lib": ["ES2022", "DOM"],
    "types": ["vite/client"],
    "strict": true,
    "noEmit": true,
    "isolatedModules": true,
    "allowSyntheticDefaultImports": true,
    "esModuleInterop": true,
    "skipLibCheck": true
  },
  "include": ["src", "tests", "vite.config.ts"]
}
```

`vite.config.ts`:
```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  server: { host: true },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});
```

`.gitignore`:
```
node_modules/
dist/
```

- [ ] **Step 2: Bağımlılıkları kur**

Run: `npm install`
Expected: `added N packages`, hata yok.

- [ ] **Step 3: Birim verisini yaz** — `src/data/units.ts`

```ts
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
```

- [ ] **Step 4: Başarısız testi yaz** — `tests/merge.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import { merge, hybridFor } from '../src/logic/merge';
import { ELEMENTS, type ElementId, type Unit } from '../src/data/units';

const base = (element: ElementId, level: number): Unit => ({ kind: 'base', element, level });

describe('merge', () => {
  it('aynı element + aynı seviye → bir üst seviye', () => {
    expect(merge(base('fire', 1), base('fire', 1))).toEqual({ ok: true, unit: base('fire', 2) });
  });

  it('azami seviyede aynı element birleşmez', () => {
    expect(merge(base('ice', 5), base('ice', 5))).toEqual({ ok: false });
  });

  it('farklı seviyeler birleşmez', () => {
    expect(merge(base('fire', 2), base('fire', 1))).toEqual({ ok: false });
  });

  it('seviye 1 farklı elementler melez oluşturmaz', () => {
    expect(merge(base('fire', 1), base('ice', 1))).toEqual({ ok: false });
  });

  it('seviye 2+ farklı elementler melez oluşturur, sıra fark etmez', () => {
    const expected = { ok: true, unit: { kind: 'hybrid', hybrid: 'steam', level: 2 } };
    expect(merge(base('fire', 2), base('ice', 2))).toEqual(expected);
    expect(merge(base('ice', 2), base('fire', 2))).toEqual(expected);
  });

  it('melez içeren birleştirme geçersiz', () => {
    const hybrid: Unit = { kind: 'hybrid', hybrid: 'steam', level: 2 };
    expect(merge(hybrid, base('fire', 2))).toEqual({ ok: false });
    expect(merge(hybrid, hybrid)).toEqual({ ok: false });
  });
});

describe('hybridFor', () => {
  it('6 farklı element çifti 6 farklı melez verir', () => {
    const found = new Set<string>();
    for (let i = 0; i < ELEMENTS.length; i++) {
      for (let j = i + 1; j < ELEMENTS.length; j++) {
        const h = hybridFor(ELEMENTS[i], ELEMENTS[j]);
        expect(h).not.toBeNull();
        found.add(h!);
      }
    }
    expect(found.size).toBe(6);
  });

  it('aynı element için melez yok', () => {
    expect(hybridFor('fire', 'fire')).toBeNull();
  });
});
```

- [ ] **Step 5: Testin başarısız olduğunu gör**

Run: `npx vitest run tests/merge.test.ts`
Expected: FAIL — `Failed to resolve import "../src/logic/merge"`.

- [ ] **Step 6: Kuralı yaz** — `src/logic/merge.ts`

```ts
import { HYBRID_INFO, MAX_LEVEL, MIN_HYBRID_LEVEL, type ElementId, type HybridId, type Unit } from '../data/units';

export type MergeResult = { ok: true; unit: Unit } | { ok: false };

export function hybridFor(a: ElementId, b: ElementId): HybridId | null {
  for (const id of Object.keys(HYBRID_INFO) as HybridId[]) {
    const [p, q] = HYBRID_INFO[id].parents;
    if ((p === a && q === b) || (p === b && q === a)) return id;
  }
  return null;
}

export function merge(a: Unit, b: Unit): MergeResult {
  if (a.kind !== 'base' || b.kind !== 'base' || a.level !== b.level) return { ok: false };
  if (a.element === b.element) {
    if (a.level >= MAX_LEVEL) return { ok: false };
    return { ok: true, unit: { kind: 'base', element: a.element, level: a.level + 1 } };
  }
  if (a.level < MIN_HYBRID_LEVEL) return { ok: false };
  const hybrid = hybridFor(a.element, b.element);
  if (!hybrid) return { ok: false };
  return { ok: true, unit: { kind: 'hybrid', hybrid, level: a.level } };
}
```

- [ ] **Step 7: Testin geçtiğini gör**

Run: `npx vitest run tests/merge.test.ts`
Expected: PASS — 8 test.

- [ ] **Step 8: Commit**

```bash
git add package.json package-lock.json tsconfig.json vite.config.ts .gitignore src/data/units.ts src/logic/merge.ts tests/merge.test.ts
git commit -m "feat(element-kalesi): proje iskeleti ve birlestirme kurali"
```

---

### Task 2: Yol ve tahta yerleşimi

**Files:**
- Create: `src/data/level.ts`
- Create: `src/logic/path.ts`
- Create: `src/logic/layout.ts`
- Test: `tests/path.test.ts`, `tests/layout.test.ts`

**Interfaces:**
- Consumes: —
- Produces:
  - `interface Point { x: number; y: number }`, `GAME_WIDTH = 450`, `GAME_HEIGHT = 800`, `PATH: Point[]`, `BOARD_COLS = 3`, `BOARD_ROWS = 5`, `SLOT_SIZE = 70`, `SLOT_GAP = 15`, `BOARD_ORIGIN: Point`
  - `pathLength(points: Point[]): number`, `pointAt(points: Point[], dist: number): Point`
  - `SLOT_COUNT = 15`, `slotCenter(index: number): Point`, `slotAt(x: number, y: number): number | null`

- [ ] **Step 1: Seviye verisini yaz** — `src/data/level.ts`

```ts
export interface Point {
  x: number;
  y: number;
}

export const GAME_WIDTH = 450;
export const GAME_HEIGHT = 800;

/** Düşman yolu: üstten girer, tahtanın etrafını dolanır, sol alttaki kale kapısında biter. */
export const PATH: Point[] = [
  { x: 40, y: -20 },
  { x: 40, y: 130 },
  { x: 410, y: 130 },
  { x: 410, y: 670 },
  { x: 40, y: 670 },
  { x: 40, y: 780 },
];

export const BOARD_COLS = 3;
export const BOARD_ROWS = 5;
export const SLOT_SIZE = 70;
export const SLOT_GAP = 15;
/** Sol üst yuvanın merkezi. */
export const BOARD_ORIGIN: Point = { x: 140, y: 220 };
```

- [ ] **Step 2: Başarısız testleri yaz**

`tests/path.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { pathLength, pointAt } from '../src/logic/path';

const pts = [
  { x: 0, y: 0 },
  { x: 3, y: 4 },
  { x: 3, y: 10 },
];

describe('path', () => {
  it('toplam uzunluk segmentlerin toplamı', () => {
    expect(pathLength(pts)).toBe(11);
  });

  it('mesafe 0 veya negatif → başlangıç', () => {
    expect(pointAt(pts, 0)).toEqual({ x: 0, y: 0 });
    expect(pointAt(pts, -5)).toEqual({ x: 0, y: 0 });
  });

  it('segment sonu ve ortası', () => {
    expect(pointAt(pts, 5)).toEqual({ x: 3, y: 4 });
    expect(pointAt(pts, 8)).toEqual({ x: 3, y: 7 });
    const mid = pointAt(pts, 2.5);
    expect(mid.x).toBeCloseTo(1.5);
    expect(mid.y).toBeCloseTo(2);
  });

  it('uzunluğu aşan mesafe → bitiş', () => {
    expect(pointAt(pts, 50)).toEqual({ x: 3, y: 10 });
  });
});
```

`tests/layout.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { SLOT_COUNT, slotAt, slotCenter } from '../src/logic/layout';

describe('layout', () => {
  it('15 yuva var', () => {
    expect(SLOT_COUNT).toBe(15);
  });

  it('yuva merkezleri satır satır dizilir', () => {
    expect(slotCenter(0)).toEqual({ x: 140, y: 220 });
    expect(slotCenter(4)).toEqual({ x: 225, y: 305 });
    expect(slotCenter(14)).toEqual({ x: 310, y: 560 });
  });

  it('yuva içindeki nokta o yuvayı verir', () => {
    expect(slotAt(140, 220)).toBe(0);
    expect(slotAt(255, 275)).toBe(4);
  });

  it('yuva arası boşluk ve tahta dışı → null', () => {
    expect(slotAt(182, 220)).toBeNull();
    expect(slotAt(10, 10)).toBeNull();
  });
});
```

- [ ] **Step 3: Testlerin başarısız olduğunu gör**

Run: `npx vitest run tests/path.test.ts tests/layout.test.ts`
Expected: FAIL — `Failed to resolve import`.

- [ ] **Step 4: Uygulamayı yaz**

`src/logic/path.ts`:
```ts
import type { Point } from '../data/level';

export function pathLength(points: Point[]): number {
  let total = 0;
  for (let i = 0; i < points.length - 1; i++) {
    total += Math.hypot(points[i + 1].x - points[i].x, points[i + 1].y - points[i].y);
  }
  return total;
}

export function pointAt(points: Point[], dist: number): Point {
  if (dist <= 0) return { ...points[0] };
  let remaining = dist;
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i];
    const b = points[i + 1];
    const seg = Math.hypot(b.x - a.x, b.y - a.y);
    if (remaining <= seg) {
      const t = remaining / seg;
      return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
    }
    remaining -= seg;
  }
  return { ...points[points.length - 1] };
}
```

`src/logic/layout.ts`:
```ts
import { BOARD_COLS, BOARD_ORIGIN, BOARD_ROWS, SLOT_GAP, SLOT_SIZE, type Point } from '../data/level';

export const SLOT_COUNT = BOARD_COLS * BOARD_ROWS;

export function slotCenter(index: number): Point {
  const col = index % BOARD_COLS;
  const row = Math.floor(index / BOARD_COLS);
  const step = SLOT_SIZE + SLOT_GAP;
  return { x: BOARD_ORIGIN.x + col * step, y: BOARD_ORIGIN.y + row * step };
}

export function slotAt(x: number, y: number): number | null {
  const half = SLOT_SIZE / 2;
  for (let i = 0; i < SLOT_COUNT; i++) {
    const c = slotCenter(i);
    if (Math.abs(x - c.x) <= half && Math.abs(y - c.y) <= half) return i;
  }
  return null;
}
```

- [ ] **Step 5: Testlerin geçtiğini gör**

Run: `npx vitest run`
Expected: PASS — tüm testler (merge + path + layout).

- [ ] **Step 6: Commit**

```bash
git add src/data/level.ts src/logic/path.ts src/logic/layout.ts tests/path.test.ts tests/layout.test.ts
git commit -m "feat(element-kalesi): yol ve tahta yerlesimi"
```

---

### Task 3: Birim istatistikleri, düşmanlar, dalgalar, ekonomi

**Files:**
- Create: `src/data/enemies.ts`, `src/data/waves.ts`, `src/data/economy.ts`
- Create: `src/logic/stats.ts`, `src/logic/waves.ts`, `src/logic/economy.ts`
- Test: `tests/stats.test.ts`, `tests/waves.test.ts`

**Interfaces:**
- Consumes: `Unit`, `UnitStats`, `ELEMENT_INFO`, `HYBRID_INFO`, `LEVEL_DAMAGE_STEP`, `HYBRID_BONUS` (Task 1)
- Produces:
  - `type EnemyId = 'grunt' | 'runner' | 'brute' | 'boss' | 'dragon'`, `ENEMY_INFO: Record<EnemyId, { name; hp; speed; reward; leak; color; radius }>`, `HP_GROWTH_PER_WAVE`
  - `interface WaveGroup { enemy: EnemyId; count: number; intervalMs: number }`, `type WaveDef = WaveGroup[]`, `WAVES: WaveDef[]` (15 adet), `GROUP_GAP_MS`
  - `START_MANA`, `START_LIVES`, `SUMMON_BASE_COST`, `SUMMON_COST_STEP`, `FIRST_BREAK_MS`, `BREAK_MS`, `SPLASH_FACTOR`, `CHAIN_FACTOR`
  - `levelMult(level: number): number`, `unitStats(unit: Unit): UnitStats`
  - `interface Spawn { enemy: EnemyId; atMs: number }`, `spawnSchedule(wave: WaveDef): Spawn[]`, `enemyHp(enemy: EnemyId, wave: number): number`
  - `summonCost(summonCount: number): number`

- [ ] **Step 1: Veri dosyalarını yaz**

`src/data/enemies.ts`:
```ts
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
```

`src/data/waves.ts`:
```ts
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
```

`src/data/economy.ts`:
```ts
export const START_MANA = 50;
export const START_LIVES = 20;
export const SUMMON_BASE_COST = 10;
export const SUMMON_COST_STEP = 5;
/** Maç başında ilk dalgadan önceki hazırlık süresi. */
export const FIRST_BREAK_MS = 8000;
/** Dalgalar arası mola. */
export const BREAK_MS = 5000;
/** Alan hasarının çevredeki düşmanlara oranı. */
export const SPLASH_FACTOR = 0.5;
/** Zincir vuruşun sekip çarptığı düşmanlara oranı. */
export const CHAIN_FACTOR = 0.6;
```

- [ ] **Step 2: Başarısız testleri yaz**

`tests/stats.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { levelMult, unitStats } from '../src/logic/stats';
import { summonCost } from '../src/logic/economy';

describe('unitStats', () => {
  it('seviye 1 ateş taban değerleri korur', () => {
    const s = unitStats({ kind: 'base', element: 'fire', level: 1 });
    expect(s.damage).toBe(8);
    expect(s.splashRadius).toBe(50);
    expect(s.cooldownMs).toBe(900);
  });

  it('seviye hasarı ölçekler', () => {
    expect(levelMult(3)).toBeCloseTo(2.2);
    expect(unitStats({ kind: 'base', element: 'fire', level: 3 }).damage).toBeCloseTo(17.6);
  });

  it('zehir hasarı da seviyeyle ölçeklenir', () => {
    expect(unitStats({ kind: 'base', element: 'nature', level: 2 }).poisonDps).toBeCloseTo(9.6);
  });

  it('melez iki ebeveynin etkilerini birleştirir', () => {
    const s = unitStats({ kind: 'hybrid', hybrid: 'steam', level: 2 });
    expect(s.damage).toBeCloseTo((8 + 4) * 1.6 * 1.25);
    expect(s.splashRadius).toBe(50);
    expect(s.slowPct).toBe(0.4);
    expect(s.range).toBe(130);
    expect(s.cooldownMs).toBe(700);
  });
});

describe('summonCost', () => {
  it('her çağırmada 5 artar', () => {
    expect(summonCost(0)).toBe(10);
    expect(summonCost(1)).toBe(15);
    expect(summonCost(4)).toBe(30);
  });
});
```

`tests/waves.test.ts`:
```ts
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
```

- [ ] **Step 3: Testlerin başarısız olduğunu gör**

Run: `npx vitest run tests/stats.test.ts tests/waves.test.ts`
Expected: FAIL — `Failed to resolve import`.

- [ ] **Step 4: Uygulamayı yaz**

`src/logic/stats.ts`:
```ts
import { ELEMENT_INFO, HYBRID_BONUS, HYBRID_INFO, LEVEL_DAMAGE_STEP, type Unit, type UnitStats } from '../data/units';

export function levelMult(level: number): number {
  return 1 + LEVEL_DAMAGE_STEP * (level - 1);
}

function scale(stats: UnitStats, mult: number): UnitStats {
  const out: UnitStats = { ...stats, damage: stats.damage * mult };
  if (stats.poisonDps !== undefined) out.poisonDps = stats.poisonDps * mult;
  return out;
}

export function unitStats(unit: Unit): UnitStats {
  if (unit.kind === 'base') return scale(ELEMENT_INFO[unit.element].stats, levelMult(unit.level));
  const [p, q] = HYBRID_INFO[unit.hybrid].parents;
  const a = ELEMENT_INFO[p].stats;
  const b = ELEMENT_INFO[q].stats;
  const combined: UnitStats = {
    ...a,
    ...b,
    damage: a.damage + b.damage,
    range: Math.max(a.range, b.range),
    cooldownMs: Math.min(a.cooldownMs, b.cooldownMs),
  };
  return scale(combined, levelMult(unit.level) * HYBRID_BONUS);
}
```

`src/logic/waves.ts`:
```ts
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
```

`src/logic/economy.ts`:
```ts
import { SUMMON_BASE_COST, SUMMON_COST_STEP } from '../data/economy';

export function summonCost(summonCount: number): number {
  return SUMMON_BASE_COST + SUMMON_COST_STEP * summonCount;
}
```

- [ ] **Step 5: Testlerin geçtiğini gör**

Run: `npx vitest run`
Expected: PASS — tüm testler.

- [ ] **Step 6: Commit**

```bash
git add src/data/enemies.ts src/data/waves.ts src/data/economy.ts src/logic/stats.ts src/logic/waves.ts src/logic/economy.ts tests/stats.test.ts tests/waves.test.ts
git commit -m "feat(element-kalesi): birim istatistikleri, dusmanlar, dalgalar, ekonomi"
```

---

### Task 4: Maç durumu — çağırma ve sürükle-bırak

**Files:**
- Create: `src/logic/match.ts`
- Test: `tests/match-actions.test.ts`

**Interfaces:**
- Consumes: `ELEMENTS`, `Unit`, `HybridId` (Task 1); `merge` (Task 1); `SLOT_COUNT` (Task 2); `summonCost`, `START_MANA`, `START_LIVES`, `FIRST_BREAK_MS`, `Spawn`, `EnemyId` (Task 3)
- Produces:
  - `type Rng = () => number`
  - `interface Enemy { id; type: EnemyId; hp; maxHp; dist; slowPct; slowUntil; poisonDps; poisonUntil }` (sayılar `number`)
  - `type MatchEvent = { type: 'attack'; slot: number; targetIds: number[] } | { type: 'discover'; hybrid: HybridId }`
  - `type Phase = 'break' | 'wave' | 'won' | 'lost'`
  - `interface MatchState { rng; time; mana; lives; summons; board: (Unit | null)[]; cooldowns: number[]; wave; phase: Phase; breakLeft; pending: Spawn[]; waveTime; enemies: Enemy[]; nextEnemyId; discovered: HybridId[]; events: MatchEvent[] }`
  - `createMatch(rng?: Rng): MatchState`, `currentSummonCost(s: MatchState): number`, `summon(s: MatchState): boolean`, `dropUnit(s: MatchState, from: number, to: number): boolean`

- [ ] **Step 1: Başarısız testi yaz** — `tests/match-actions.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import { createMatch, currentSummonCost, dropUnit, summon } from '../src/logic/match';
import type { Unit } from '../src/data/units';

const seq = (...vals: number[]) => {
  let i = 0;
  return () => vals[i++ % vals.length];
};

describe('createMatch', () => {
  it('başlangıç durumu', () => {
    const s = createMatch(() => 0);
    expect(s.mana).toBe(50);
    expect(s.lives).toBe(20);
    expect(s.board).toHaveLength(15);
    expect(s.board.every((u) => u === null)).toBe(true);
    expect(s.phase).toBe('break');
    expect(s.wave).toBe(0);
  });
});

describe('summon', () => {
  it('rng ile seçilen boş yuvaya seviye 1 birim koyar ve mana düşer', () => {
    const s = createMatch(seq(0.99, 0.3));
    expect(summon(s)).toBe(true);
    expect(s.board[14]).toEqual({ kind: 'base', element: 'ice', level: 1 });
    expect(s.mana).toBe(40);
    expect(s.summons).toBe(1);
    expect(currentSummonCost(s)).toBe(15);
  });

  it('mana yetmezse çağırmaz', () => {
    const s = createMatch(() => 0);
    s.mana = 9;
    expect(summon(s)).toBe(false);
    expect(s.board.every((u) => u === null)).toBe(true);
  });

  it('tahta doluysa çağırmaz', () => {
    const s = createMatch(() => 0);
    s.mana = 9999;
    s.board = s.board.map((): Unit => ({ kind: 'base', element: 'fire', level: 1 }));
    expect(summon(s)).toBe(false);
    expect(s.mana).toBe(9999);
  });

  it('maç bittiyse çağırmaz', () => {
    const s = createMatch(() => 0);
    s.phase = 'lost';
    expect(summon(s)).toBe(false);
  });
});

describe('dropUnit', () => {
  it('boş yuvaya taşır', () => {
    const s = createMatch(() => 0);
    s.board[0] = { kind: 'base', element: 'fire', level: 1 };
    expect(dropUnit(s, 0, 5)).toBe(true);
    expect(s.board[0]).toBeNull();
    expect(s.board[5]).toEqual({ kind: 'base', element: 'fire', level: 1 });
  });

  it('aynı birimleri birleştirir, hedefte sonuç kalır', () => {
    const s = createMatch(() => 0);
    s.board[0] = { kind: 'base', element: 'fire', level: 1 };
    s.board[1] = { kind: 'base', element: 'fire', level: 1 };
    expect(dropUnit(s, 0, 1)).toBe(true);
    expect(s.board[0]).toBeNull();
    expect(s.board[1]).toEqual({ kind: 'base', element: 'fire', level: 2 });
  });

  it('geçersiz birleştirmede tahta değişmez', () => {
    const s = createMatch(() => 0);
    s.board[0] = { kind: 'base', element: 'fire', level: 1 };
    s.board[1] = { kind: 'base', element: 'ice', level: 1 };
    expect(dropUnit(s, 0, 1)).toBe(false);
    expect(s.board[0]).toEqual({ kind: 'base', element: 'fire', level: 1 });
    expect(s.board[1]).toEqual({ kind: 'base', element: 'ice', level: 1 });
  });

  it('boş kaynak veya aynı yuva → false', () => {
    const s = createMatch(() => 0);
    s.board[0] = { kind: 'base', element: 'fire', level: 1 };
    expect(dropUnit(s, 3, 0)).toBe(false);
    expect(dropUnit(s, 0, 0)).toBe(false);
  });

  it('yeni melez keşif olayı üretir, ikincisinde üretmez', () => {
    const s = createMatch(() => 0);
    s.board[0] = { kind: 'base', element: 'fire', level: 2 };
    s.board[1] = { kind: 'base', element: 'ice', level: 2 };
    s.board[2] = { kind: 'base', element: 'ice', level: 2 };
    s.board[3] = { kind: 'base', element: 'fire', level: 2 };
    expect(dropUnit(s, 0, 1)).toBe(true);
    expect(s.board[1]).toEqual({ kind: 'hybrid', hybrid: 'steam', level: 2 });
    expect(dropUnit(s, 2, 3)).toBe(true);
    expect(s.discovered).toEqual(['steam']);
    expect(s.events).toEqual([{ type: 'discover', hybrid: 'steam' }]);
  });
});
```

- [ ] **Step 2: Testin başarısız olduğunu gör**

Run: `npx vitest run tests/match-actions.test.ts`
Expected: FAIL — `Failed to resolve import "../src/logic/match"`.

- [ ] **Step 3: Maç durumunu yaz** — `src/logic/match.ts`

```ts
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
```

- [ ] **Step 4: Testin geçtiğini gör**

Run: `npx vitest run`
Expected: PASS — tüm testler.

- [ ] **Step 5: Commit**

```bash
git add src/logic/match.ts tests/match-actions.test.ts
git commit -m "feat(element-kalesi): mac durumu, cagirma ve surukle-birak"
```

---

### Task 5: Simülasyon adımı — dalgalar, hareket, savaş, kazan/kaybet

**Files:**
- Modify: `src/logic/match.ts` (dosyanın sonuna ekle + import'ları genişlet)
- Test: `tests/match-step.test.ts`

**Interfaces:**
- Consumes: Task 4'teki her şey; `PATH` (Task 2), `pathLength`, `pointAt`, `slotCenter` (Task 2); `unitStats`, `spawnSchedule`, `enemyHp`, `WAVES`, `ENEMY_INFO`, `BREAK_MS`, `SPLASH_FACTOR`, `CHAIN_FACTOR` (Task 3)
- Produces:
  - `PATH_LENGTH: number` (= 1540)
  - `enemyPosition(e: Enemy): Point`
  - `step(s: MatchState, dt: number): void`
  - `pickTarget(s: MatchState, origin: Point, range: number): Enemy | null`

**Adım sırası (tek `step` içinde):** `time += dt` → mola geri sayımı (biterse dalga başlar ve bu karede düşman çıkmaz) **veya** dalga sırasında zamanı gelen düşmanları çıkar → düşmanları hareket ettir + zehir → kaleye ulaşanları can olarak düş (can ≤ 0 → `lost`) → birimler saldırır → ölenleri kaldır, mana ver → dalga temizlendiyse mola veya `won`.

- [ ] **Step 1: Başarısız testi yaz** — `tests/match-step.test.ts`

```ts
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
  it('yol uzunluğu 1540', () => {
    expect(PATH_LENGTH).toBe(1540);
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
  // Yuva 0 merkezi (140,220). Yol üzerinde dist 250 → (140,130), mesafe 90.
  it('menzildeki düşmana vurur, bekleme süresi başlar, olay üretir', () => {
    const s = inWave();
    s.board[0] = { kind: 'base', element: 'fire', level: 1 };
    const e = addEnemy(s, 'grunt', 250);
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
    const back = addEnemy(s, 'grunt', 230);
    const front = addEnemy(s, 'grunt', 250);
    step(s, 16);
    expect(front.hp).toBe(26);
    expect(back.hp).toBe(30);
    expect(front.slowPct).toBe(0.4);
    expect(front.slowUntil).toBe(16 + 1200);
  });

  it('ateş çevreye alan hasarı verir', () => {
    const s = inWave();
    s.board[0] = { kind: 'base', element: 'fire', level: 1 };
    const back = addEnemy(s, 'grunt', 230);
    const front = addEnemy(s, 'grunt', 250);
    step(s, 16);
    expect(front.hp).toBe(22);
    expect(back.hp).toBe(26);
  });

  it('şimşek yakındaki 2 düşmana sekiyor', () => {
    const s = inWave();
    s.board[0] = { kind: 'base', element: 'lightning', level: 1 };
    const a = addEnemy(s, 'grunt', 250);
    const b = addEnemy(s, 'grunt', 230);
    const c = addEnemy(s, 'grunt', 210);
    step(s, 16);
    expect(a.hp).toBeCloseTo(24);
    expect(b.hp).toBeCloseTo(26.4);
    expect(c.hp).toBeCloseTo(26.4);
  });

  it('doğa zehir uygular', () => {
    const s = inWave();
    s.board[0] = { kind: 'base', element: 'nature', level: 1 };
    const e = addEnemy(s, 'grunt', 250);
    step(s, 16);
    expect(e.hp).toBe(27);
    expect(e.poisonDps).toBe(6);
    expect(e.poisonUntil).toBe(16 + 2000);
  });

  it('ölen düşman kaldırılır ve mana verir', () => {
    const s = inWave();
    s.board[0] = { kind: 'base', element: 'fire', level: 1 };
    addEnemy(s, 'grunt', 250, 5);
    addEnemy(s, 'grunt', 1000);
    step(s, 16);
    expect(s.enemies).toHaveLength(1);
    expect(s.mana).toBe(55);
  });
});
```

- [ ] **Step 2: Testin başarısız olduğunu gör**

Run: `npx vitest run tests/match-step.test.ts`
Expected: FAIL — `step`/`PATH_LENGTH` export edilmemiş (`is not a function` / `undefined`).

- [ ] **Step 3: `src/logic/match.ts` import'larını değiştir**

Dosyanın başındaki import bloğunu şununla değiştir:
```ts
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
```

- [ ] **Step 4: Simülasyonu dosyanın sonuna ekle** — `src/logic/match.ts`

```ts
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
```

- [ ] **Step 5: Testlerin geçtiğini gör**

Run: `npx vitest run`
Expected: PASS — tüm testler (merge, path, layout, stats, waves, match-actions, match-step).

- [ ] **Step 6: Tip kontrolü**

Run: `npx tsc --noEmit`
Expected: çıktı yok (hata yok).

- [ ] **Step 7: Commit**

```bash
git add src/logic/match.ts tests/match-step.test.ts
git commit -m "feat(element-kalesi): simulasyon adimi - dalga, hareket, savas, kazan/kaybet"
```

---

### Task 6: Oyun sahnesi — çizim, dokunma, HUD, bitiş ekranı

**Files:**
- Create: `index.html`
- Create: `src/main.ts`
- Create: `src/scenes/MatchScene.ts`

**Interfaces:**
- Consumes: `createMatch`, `step`, `summon`, `dropUnit`, `currentSummonCost`, `enemyPosition`, `MatchState` (Task 4–5); `SLOT_COUNT`, `slotCenter`, `slotAt` (Task 2); `GAME_WIDTH`, `GAME_HEIGHT`, `PATH`, `SLOT_SIZE` (Task 2); `ELEMENT_INFO`, `HYBRID_INFO`, `Unit` (Task 1); `ENEMY_INFO` (Task 3); `WAVES` (Task 3)
- Produces: `class MatchScene extends Phaser.Scene` (anahtar `'match'`)

Not: Phaser sekme gizlenince oyun döngüsünü kendiliğinden durdurur (spec: "arka plana alınınca maç duraklar"). Büyük kare atlamalarında simülasyon kararsızlaşmasın diye `dt` 50 ms ile sınırlanır.

- [ ] **Step 1: `index.html` yaz**

```html
<!doctype html>
<html lang="tr">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
    <title>Element Kalesi</title>
    <style>
      html,
      body {
        margin: 0;
        height: 100%;
        background: #0d1410;
        overflow: hidden;
        touch-action: none;
      }
      #game {
        width: 100%;
        height: 100%;
      }
    </style>
  </head>
  <body>
    <div id="game"></div>
    <script type="module" src="/src/main.ts"></script>
  </body>
</html>
```

- [ ] **Step 2: `src/main.ts` yaz**

```ts
import Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH } from './data/level';
import { MatchScene } from './scenes/MatchScene';

new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  width: GAME_WIDTH,
  height: GAME_HEIGHT,
  backgroundColor: '#1b2a1f',
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
  scene: [MatchScene],
});
```

- [ ] **Step 3: `src/scenes/MatchScene.ts` yaz**

```ts
import Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH, PATH, SLOT_SIZE } from '../data/level';
import { ELEMENT_INFO, HYBRID_INFO, type Unit } from '../data/units';
import { ENEMY_INFO } from '../data/enemies';
import { WAVES } from '../data/waves';
import { createMatch, currentSummonCost, dropUnit, enemyPosition, step, summon, type MatchState } from '../logic/match';
import { SLOT_COUNT, slotAt, slotCenter } from '../logic/layout';

const MAX_STEP_MS = 50;
const SHOT_MS = 120;

function unitColor(u: Unit): number {
  return u.kind === 'base' ? ELEMENT_INFO[u.element].color : HYBRID_INFO[u.hybrid].color;
}

function unitIcon(u: Unit): string {
  if (u.kind === 'base') return ELEMENT_INFO[u.element].icon;
  const [p, q] = HYBRID_INFO[u.hybrid].parents;
  return ELEMENT_INFO[p].icon + ELEMENT_INFO[q].icon;
}

export class MatchScene extends Phaser.Scene {
  private state!: MatchState;
  private dynamic!: Phaser.GameObjects.Graphics;
  private unitIcons: Phaser.GameObjects.Text[] = [];
  private unitLevels: Phaser.GameObjects.Text[] = [];
  private hud!: Phaser.GameObjects.Text;
  private phaseText!: Phaser.GameObjects.Text;
  private summonButton!: Phaser.GameObjects.Rectangle;
  private summonLabel!: Phaser.GameObjects.Text;
  private toast!: Phaser.GameObjects.Text;
  private dragIcon!: Phaser.GameObjects.Text;
  private dragFrom: number | null = null;
  private shots: { slot: number; targetIds: number[]; until: number }[] = [];
  private endShown = false;

  constructor() {
    super('match');
  }

  create(): void {
    this.state = createMatch();
    this.unitIcons = [];
    this.unitLevels = [];
    this.shots = [];
    this.dragFrom = null;
    this.endShown = false;

    this.drawStatic();
    this.dynamic = this.add.graphics();

    for (let i = 0; i < SLOT_COUNT; i++) {
      const c = slotCenter(i);
      this.unitIcons.push(this.add.text(c.x, c.y - 4, '', { fontSize: '28px' }).setOrigin(0.5));
      this.unitLevels.push(
        this.add.text(c.x + 30, c.y + 30, '', { fontSize: '14px', color: '#ffffff', fontStyle: 'bold' }).setOrigin(1),
      );
    }

    this.dragIcon = this.add.text(0, 0, '', { fontSize: '34px' }).setOrigin(0.5).setDepth(10).setVisible(false);
    this.hud = this.add.text(80, 20, '', { fontSize: '18px', color: '#ffffff' });
    this.phaseText = this.add.text(GAME_WIDTH / 2, 70, '', { fontSize: '16px', color: '#ffe082' }).setOrigin(0.5);
    this.toast = this.add
      .text(GAME_WIDTH / 2, 400, '', {
        fontSize: '20px',
        color: '#ffffff',
        backgroundColor: 'rgba(0,0,0,0.75)',
        padding: { x: 10, y: 6 },
      })
      .setOrigin(0.5)
      .setDepth(20)
      .setVisible(false);

    this.summonButton = this.add
      .rectangle(270, 735, 220, 60, 0x6a1b9a)
      .setStrokeStyle(2, 0xffffff)
      .setInteractive({ useHandCursor: true });
    this.summonLabel = this.add.text(270, 735, '', { fontSize: '20px', color: '#ffffff' }).setOrigin(0.5);
    this.summonButton.on('pointerdown', () => summon(this.state));

    this.input.on('pointerdown', this.onDown, this);
    this.input.on('pointermove', this.onMove, this);
    this.input.on('pointerup', this.onUp, this);
  }

  update(_time: number, delta: number): void {
    step(this.state, Math.min(delta, MAX_STEP_MS));

    for (const ev of this.state.events) {
      if (ev.type === 'attack') {
        this.shots.push({ slot: ev.slot, targetIds: ev.targetIds, until: this.state.time + SHOT_MS });
      } else {
        this.showToast(`Yeni melez keşfedildi: ${HYBRID_INFO[ev.hybrid].name}!`);
      }
    }
    this.state.events.length = 0;

    this.redraw();

    if ((this.state.phase === 'won' || this.state.phase === 'lost') && !this.endShown) this.showEnd();
  }

  private drawStatic(): void {
    const g = this.add.graphics();
    g.lineStyle(44, 0x5d4037, 1);
    g.beginPath();
    g.moveTo(PATH[0].x, PATH[0].y);
    for (const p of PATH.slice(1)) g.lineTo(p.x, p.y);
    g.strokePath();

    const gate = PATH[PATH.length - 1];
    g.fillStyle(0x455a64, 1);
    g.fillRect(gate.x - 30, GAME_HEIGHT - 40, 60, 40);

    g.fillStyle(0x263238, 1);
    for (let i = 0; i < SLOT_COUNT; i++) {
      const c = slotCenter(i);
      g.fillRoundedRect(c.x - SLOT_SIZE / 2, c.y - SLOT_SIZE / 2, SLOT_SIZE, SLOT_SIZE, 10);
    }
  }

  private redraw(): void {
    const s = this.state;
    const g = this.dynamic;
    g.clear();

    s.board.forEach((u, i) => {
      const icon = this.unitIcons[i];
      const lvl = this.unitLevels[i];
      if (!u || i === this.dragFrom) {
        icon.setText('');
        lvl.setText('');
        return;
      }
      const c = slotCenter(i);
      const x = c.x - SLOT_SIZE / 2 + 4;
      const y = c.y - SLOT_SIZE / 2 + 4;
      const size = SLOT_SIZE - 8;
      g.fillStyle(unitColor(u), 0.85);
      g.fillRoundedRect(x, y, size, size, 8);
      if (u.kind === 'hybrid') {
        g.lineStyle(3, 0xffffff, 1);
        g.strokeRoundedRect(x, y, size, size, 8);
      }
      icon.setText(unitIcon(u));
      lvl.setText(`${u.level}`);
    });

    const byId = new Map(s.enemies.map((e) => [e.id, e]));
    for (const e of s.enemies) {
      const p = enemyPosition(e);
      const info = ENEMY_INFO[e.type];
      g.fillStyle(info.color, 1);
      g.fillCircle(p.x, p.y, info.radius);
      if (e.slowUntil > s.time) {
        g.lineStyle(2, 0x5ac8ff, 1);
        g.strokeCircle(p.x, p.y, info.radius + 3);
      }
      if (e.poisonUntil > s.time) {
        g.lineStyle(2, 0x5ad16b, 1);
        g.strokeCircle(p.x, p.y, info.radius + 6);
      }
      const w = info.radius * 2;
      g.fillStyle(0x000000, 0.6);
      g.fillRect(p.x - w / 2, p.y - info.radius - 8, w, 4);
      g.fillStyle(0xff5252, 1);
      g.fillRect(p.x - w / 2, p.y - info.radius - 8, w * Math.max(0, e.hp / e.maxHp), 4);
    }

    this.shots = this.shots.filter((sh) => sh.until > s.time);
    for (const sh of this.shots) {
      const u = s.board[sh.slot];
      if (!u) continue;
      const c = slotCenter(sh.slot);
      g.lineStyle(3, unitColor(u), 1);
      for (const id of sh.targetIds) {
        const e = byId.get(id);
        if (!e) continue;
        const p = enemyPosition(e);
        g.lineBetween(c.x, c.y, p.x, p.y);
      }
    }

    this.hud.setText(`❤ ${s.lives}    💧 ${Math.floor(s.mana)}    Dalga ${s.wave}/${WAVES.length}`);
    this.phaseText.setText(s.phase === 'break' ? `Sonraki dalga: ${Math.ceil(s.breakLeft / 1000)} sn` : '');
    const cost = currentSummonCost(s);
    this.summonLabel.setText(`Çağır (${cost} 💧)`);
    this.summonButton.setFillStyle(s.mana >= cost && s.board.includes(null) ? 0x6a1b9a : 0x424242);
  }

  private onDown(p: Phaser.Input.Pointer): void {
    const i = slotAt(p.worldX, p.worldY);
    if (i === null) return;
    const u = this.state.board[i];
    if (!u) return;
    this.dragFrom = i;
    this.dragIcon.setText(unitIcon(u)).setPosition(p.worldX, p.worldY).setVisible(true);
  }

  private onMove(p: Phaser.Input.Pointer): void {
    if (this.dragFrom === null) return;
    this.dragIcon.setPosition(p.worldX, p.worldY);
  }

  private onUp(p: Phaser.Input.Pointer): void {
    if (this.dragFrom === null) return;
    const to = slotAt(p.worldX, p.worldY);
    if (to !== null) dropUnit(this.state, this.dragFrom, to);
    this.dragFrom = null;
    this.dragIcon.setVisible(false);
  }

  private showToast(text: string): void {
    this.toast.setText(text).setVisible(true);
    this.time.delayedCall(2000, () => this.toast.setVisible(false));
  }

  private showEnd(): void {
    this.endShown = true;
    const won = this.state.phase === 'won';
    this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0x000000, 0.7).setDepth(30).setInteractive();
    this.add
      .text(GAME_WIDTH / 2, 330, won ? 'Kazandın! 🏆' : 'Kale düştü 💀', { fontSize: '36px', color: '#ffffff' })
      .setOrigin(0.5)
      .setDepth(31);
    this.add
      .text(GAME_WIDTH / 2, 390, `Ulaşılan dalga: ${this.state.wave}/${WAVES.length}`, { fontSize: '18px', color: '#dddddd' })
      .setOrigin(0.5)
      .setDepth(31);
    const btn = this.add.rectangle(GAME_WIDTH / 2, 470, 200, 60, 0x2e7d32).setDepth(31).setInteractive({ useHandCursor: true });
    this.add.text(GAME_WIDTH / 2, 470, 'Tekrar Oyna', { fontSize: '22px', color: '#ffffff' }).setOrigin(0.5).setDepth(32);
    btn.on('pointerdown', () => this.scene.restart());
  }
}
```

- [ ] **Step 4: Derleme ve testler**

Run: `npm run build`
Expected: `tsc` hatasız, Vite `dist/` üretir (Phaser boyutu için "chunk larger than 500 kB" uyarısı normal).

Run: `npx vitest run`
Expected: PASS — tüm testler.

- [ ] **Step 5: Tarayıcıda doğrula**

Run: `npm run dev` → `http://localhost:5173` aç. Kontrol listesi:
1. Kahverengi yol tahtanın etrafını dolanıyor, 15 koyu yuva görünüyor, altta "Çağır (10 💧)" butonu.
2. Üstte "Sonraki dalga: 8 sn" geri sayımı; `❤ 20  💧 50  Dalga 0/15`.
3. Çağır'a 3 kez bas → 3 birim çıkar, mana 50 → 40 → 25 → 5, buton griye döner.
4. Aynı iki birimi sürükleyip üst üste bırak → seviye 2 olur. Farklı seviye 1'leri bırak → yerine döner.
5. Dalga başlayınca düşmanlar yoldan iner, birimler çizgiyle ateş eder, ölen düşman mana verir.
6. Seviye 2 ateş + seviye 2 buz birleşince "Yeni melez keşfedildi: Buhar Büyücüsü!" bildirimi.
7. Birim koymadan bekle → düşmanlar kaleye girer, can düşer, 0'da "Kale düştü 💀" + "Tekrar Oyna" yeni maç başlatır.
8. Tarayıcı konsolunda hata yok.

- [ ] **Step 6: Commit**

```bash
git add index.html src/main.ts src/scenes/MatchScene.ts
git commit -m "feat(element-kalesi): oynanabilir mac sahnesi"
```

---

### Task 7: Telefonda deneme + proje notu

**Files:**
- Create: `README.md`
- Modify: `C:\Users\Lenovo\Desktop\workspace\02_Areas\log.md` (sona bir satır ekle)

- [ ] **Step 1: Telefonda aç**

Run: `npm run dev`
Expected: Vite çıktısında `Network: http://192.168.x.x:5173/` satırı. Telefon aynı Wi-Fi'deyken bu adresi telefonun tarayıcısında aç. Windows Güvenlik Duvarı sorarsa Node.js için **özel ağ** iznini ver.

Kontrol: oyun ekranı dikey sığıyor, parmakla sürükle-bırak çalışıyor, emoji'ler görünüyor, bir maç akıcı oynanıyor.

- [ ] **Step 2: `README.md` yaz**

```markdown
---
title: Element Kalesi
tags: [proje/aktif, alan/oyun]
created: 2026-09-28
type: project
---

# Element Kalesi

Merge + Tower Defense hybrid-casual mobil oyun (Phaser 3 + TypeScript + Vite).
Tasarım: [[2026-09-28-element-kalesi-design]] · Prototip planı: [[2026-09-28-element-kalesi-prototip]]

## Çalıştırma

- `npm install`
- `npm run dev` — tarayıcıda `http://localhost:5173`, telefonda Vite'ın gösterdiği `Network` adresi
- `npm test` — `src/logic/` birim testleri
- `npm run build` — tip kontrolü + üretim paketi

## Yapı

- `src/data/` — tüm denge değerleri (birim, düşman, dalga, ekonomi)
- `src/logic/` — saf oyun kuralları ve simülasyon (Phaser'sız, testli)
- `src/scenes/` — Phaser çizim ve dokunma
```

- [ ] **Step 3: Vault günlüğüne ekle** — `02_Areas/log.md` sonuna:

```markdown
## [2026-09-28] yeni-proje | Element Kalesi (merge + tower defense mobil oyun) prototipi — `01_Projects/oyunlar/element-kalesi/`
```

- [ ] **Step 4: Commit**

```bash
git add README.md
git commit -m "docs(element-kalesi): README"
```

(`02_Areas/log.md` bu git deposunun dışında; commit gerektirmez.)
