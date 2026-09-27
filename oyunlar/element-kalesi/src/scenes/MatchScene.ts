import Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH, PATH, SLOT_SIZE } from '../data/level';
import { ELEMENT_INFO, HYBRID_INFO, type Unit } from '../data/units';
import { WAVES } from '../data/waves';
import {
  BASE_TOPS,
  DEATH_ROW,
  DECORATIONS,
  ENEMY_ART,
  MAP_IMAGES,
  ROAD_STYLE,
  SHEETS,
  TOWER_ART,
  TOWER_SCALE,
  WALK_ROW,
  tierForLevel,
} from '../data/art';
import {
  createMatch,
  currentSummonCost,
  dropUnit,
  enemyPosition,
  step,
  summon,
  type Enemy,
  type MatchState,
} from '../logic/match';
import { SLOT_COUNT, slotAt, slotCenter } from '../logic/layout';

const MAX_STEP_MS = 50;
const SHOT_MS = 120;
const ENEMY_FRAME = 64;

const DEPTH = { road: 1, deco: 2, pad: 3, units: 10, bars: 2000, hud: 3000, drag: 3500, toast: 4000, end: 5000 };

function unitArtId(u: Unit) {
  return u.kind === 'base' ? u.element : u.hybrid;
}

function unitColor(u: Unit): number {
  return u.kind === 'base' ? ELEMENT_INFO[u.element].color : HYBRID_INFO[u.hybrid].color;
}

interface TowerView {
  key: string;
  base: Phaser.GameObjects.Image;
  weapon: Phaser.GameObjects.Sprite | null;
  weaponKey: string | null;
  badge: Phaser.GameObjects.Text;
}

interface EnemyView {
  sprite: Phaser.GameObjects.Sprite;
  dir: 'down' | 'up' | 'side';
  last: { x: number; y: number };
}

export class MatchScene extends Phaser.Scene {
  private state!: MatchState;
  private bars!: Phaser.GameObjects.Graphics;
  private towers: (TowerView | null)[] = [];
  private enemies = new Map<number, EnemyView>();
  private hud!: Phaser.GameObjects.Text;
  private phaseText!: Phaser.GameObjects.Text;
  private summonButton!: Phaser.GameObjects.Rectangle;
  private summonLabel!: Phaser.GameObjects.Text;
  private toast!: Phaser.GameObjects.Text;
  private dragGhost!: Phaser.GameObjects.Image;
  private dragFrom: number | null = null;
  private shots: { slot: number; targetIds: number[]; until: number }[] = [];
  private endShown = false;

  constructor() {
    super('match');
  }

  preload(): void {
    for (const img of MAP_IMAGES) this.load.image(img.key, img.url);
    for (const s of SHEETS) this.load.spritesheet(s.key, s.url, { frameWidth: s.frameWidth, frameHeight: s.frameHeight });
  }

  create(): void {
    this.state = createMatch();
    this.towers = Array.from({ length: SLOT_COUNT }, () => null);
    this.enemies = new Map();
    this.shots = [];
    this.dragFrom = null;
    this.endShown = false;

    // Piksel art sayfaları bulanıklaşmasın.
    for (const s of SHEETS) this.textures.get(s.key).setFilter(Phaser.Textures.FilterMode.NEAREST);
    this.createAnimations();
    this.drawMap();

    this.bars = this.add.graphics().setDepth(DEPTH.bars);
    this.dragGhost = this.add.image(0, 0, 't1_base').setOrigin(0.5, 1).setAlpha(0.85).setDepth(DEPTH.drag).setVisible(false);

    this.add.rectangle(0, 0, GAME_WIDTH, 40, 0x000000, 0.45).setOrigin(0).setDepth(DEPTH.hud);
    this.hud = this.add.text(12, 10, '', { fontSize: '18px', color: '#ffffff', fontStyle: 'bold' }).setDepth(DEPTH.hud);
    this.phaseText = this.add
      .text(GAME_WIDTH / 2, 58, '', { fontSize: '16px', color: '#fff3c4', stroke: '#3b2a14', strokeThickness: 4 })
      .setOrigin(0.5)
      .setDepth(DEPTH.hud);
    this.toast = this.add
      .text(GAME_WIDTH / 2, 420, '', {
        fontSize: '20px',
        color: '#ffffff',
        backgroundColor: 'rgba(0,0,0,0.75)',
        padding: { x: 10, y: 6 },
        align: 'center',
        wordWrap: { width: GAME_WIDTH - 60 },
      })
      .setOrigin(0.5)
      .setDepth(DEPTH.toast)
      .setVisible(false);

    this.summonButton = this.add
      .rectangle(320, 758, 200, 56, 0x6a1b9a)
      .setStrokeStyle(3, 0xffffff)
      .setDepth(DEPTH.hud)
      .setInteractive({ useHandCursor: true });
    this.summonLabel = this.add
      .text(320, 758, '', { fontSize: '20px', color: '#ffffff', fontStyle: 'bold' })
      .setOrigin(0.5)
      .setDepth(DEPTH.hud);
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
        this.aimAndFire(ev.slot, ev.targetIds[0]);
      } else {
        this.showToast(`Yeni melez keşfedildi!\n${HYBRID_INFO[ev.hybrid].name}`);
      }
    }
    this.state.events.length = 0;

    this.syncTowers();
    this.syncEnemies();
    this.drawOverlay();
    this.updateHud();

    if ((this.state.phase === 'won' || this.state.phase === 'lost') && !this.endShown) this.showEnd();
  }

  // ---------- kurulum ----------

  private createAnimations(): void {
    for (const art of Object.values(ENEMY_ART)) {
      const cols = this.textures.get(art.sheet).getSourceImage().width / ENEMY_FRAME;
      const rowAnim = (name: string, row: number, frameRate: number, repeat: number) => {
        const key = `${art.sheet}_${name}`;
        if (this.anims.exists(key)) return;
        const start = row * cols;
        this.anims.create({
          key,
          frames: this.anims.generateFrameNumbers(art.sheet, { start, end: start + art.rows[row] - 1 }),
          frameRate,
          repeat,
        });
      };
      rowAnim('walk_down', WALK_ROW.down, 10, -1);
      rowAnim('walk_up', WALK_ROW.up, 10, -1);
      rowAnim('walk_side', WALK_ROW.side, 10, -1);
      rowAnim('death', DEATH_ROW, 14, 0);
    }
    for (const s of SHEETS) {
      if (!/_l\d$/.test(s.key) || this.anims.exists(`${s.key}_fire`)) continue;
      this.anims.create({ key: `${s.key}_fire`, frames: this.anims.generateFrameNumbers(s.key), frameRate: 20, repeat: 0 });
    }
  }

  private drawMap(): void {
    this.add.tileSprite(0, 0, GAME_WIDTH, GAME_HEIGHT, 'map_grass').setOrigin(0);

    const road = this.add.graphics().setDepth(DEPTH.road);
    const strokeRoad = (width: number, color: number) => {
      road.lineStyle(width, color, 1);
      road.beginPath();
      road.moveTo(PATH[0].x, PATH[0].y);
      for (const p of PATH.slice(1)) road.lineTo(p.x, p.y);
      road.strokePath();
      road.fillStyle(color, 1);
      for (const p of PATH) road.fillCircle(p.x, p.y, width / 2);
    };
    strokeRoad(ROAD_STYLE.width + ROAD_STYLE.edgeWidth * 2, ROAD_STYLE.edge);
    strokeRoad(ROAD_STYLE.width, ROAD_STYLE.fill);

    for (const d of DECORATIONS) this.add.image(d.x, d.y, d.key).setScale(d.scale ?? 1).setDepth(DEPTH.deco);

    for (let i = 0; i < SLOT_COUNT; i++) {
      const c = slotCenter(i);
      this.add.image(c.x, c.y, 'map_pad').setDisplaySize(SLOT_SIZE, SLOT_SIZE).setDepth(DEPTH.pad);
    }

    const gate = PATH[PATH.length - 1];
    const castle = this.add.graphics().setDepth(DEPTH.units + GAME_HEIGHT);
    castle.fillStyle(0x5d6d7e, 1).fillRect(gate.x - 38, GAME_HEIGHT - 44, 76, 44);
    castle.fillStyle(0x3e4a56, 1).fillRect(gate.x - 16, GAME_HEIGHT - 30, 32, 30);
    castle.lineStyle(3, 0x2c3440, 1).strokeRect(gate.x - 38, GAME_HEIGHT - 44, 76, 44);
    for (let k = 0; k < 4; k++) castle.fillStyle(0x5d6d7e, 1).fillRect(gate.x - 38 + k * 22, GAME_HEIGHT - 54, 12, 10);
  }

  // ---------- kuleler ----------

  private towerKey(u: Unit): string {
    return `${unitArtId(u)}-${u.level}`;
  }

  private syncTowers(): void {
    for (let i = 0; i < SLOT_COUNT; i++) {
      const u = this.state.board[i];
      const view = this.towers[i];
      if (!u) {
        if (view) this.destroyTower(i);
        continue;
      }
      if (!view || view.key !== this.towerKey(u)) {
        if (view) this.destroyTower(i);
        this.towers[i] = this.buildTower(i, u);
      }
      const hidden = i === this.dragFrom;
      const v = this.towers[i]!;
      v.base.setVisible(!hidden);
      v.weapon?.setVisible(!hidden);
      v.badge.setVisible(!hidden);
    }
  }

  private buildTower(slot: number, u: Unit): TowerView {
    const art = TOWER_ART[unitArtId(u)];
    const tier = tierForLevel(u.level);
    const c = slotCenter(slot);
    const bottom = c.y + SLOT_SIZE / 2 - 4;
    const depth = DEPTH.units + c.y;

    const base = this.add.image(c.x, bottom, art.base, tier).setOrigin(0.5, 1).setScale(TOWER_SCALE).setDepth(depth);
    if (art.tint) base.setTint(art.tint);

    const frameH = this.textures.get(art.base).get(tier).height;
    const top = bottom - (frameH - BASE_TOPS[art.base][tier]) * TOWER_SCALE;
    const weaponKey = art.weapons[tier];
    const weapon = weaponKey
      ? this.add
          .sprite(c.x, top + 22 * TOWER_SCALE, weaponKey, 0)
          .setScale(TOWER_SCALE * (art.weaponScale ?? 1))
          .setDepth(depth + 0.5)
      : null;

    const badge = this.add
      .text(c.x + SLOT_SIZE / 2 - 2, bottom + 2, `${u.level}`, {
        fontSize: '15px',
        color: u.kind === 'hybrid' ? '#ffe066' : '#ffffff',
        fontStyle: 'bold',
        stroke: '#000000',
        strokeThickness: 4,
      })
      .setOrigin(1)
      .setDepth(depth + 0.6);

    return { key: this.towerKey(u), base, weapon, weaponKey, badge };
  }

  private destroyTower(slot: number): void {
    const v = this.towers[slot];
    if (!v) return;
    v.base.destroy();
    v.weapon?.destroy();
    v.badge.destroy();
    this.towers[slot] = null;
  }

  private aimAndFire(slot: number, targetId: number): void {
    const v = this.towers[slot];
    const target = this.state.enemies.find((e) => e.id === targetId);
    if (!v?.weapon || !v.weaponKey || !target) return;
    const p = enemyPosition(target);
    v.weapon.setRotation(Math.atan2(p.y - v.weapon.y, p.x - v.weapon.x) + Math.PI / 2);
    v.weapon.play(`${v.weaponKey}_fire`, true);
  }

  // ---------- düşmanlar ----------

  private syncEnemies(): void {
    const alive = new Set<number>();
    for (const e of this.state.enemies) {
      alive.add(e.id);
      const p = enemyPosition(e);
      let view = this.enemies.get(e.id);
      if (!view) {
        view = this.buildEnemy(e, p);
        this.enemies.set(e.id, view);
      }
      const dx = p.x - view.last.x;
      const dy = p.y - view.last.y;
      if (Math.abs(dx) + Math.abs(dy) > 0.01) {
        const dir = Math.abs(dx) > Math.abs(dy) ? 'side' : dy > 0 ? 'down' : 'up';
        if (dir !== view.dir) {
          view.dir = dir;
          view.sprite.play(`${ENEMY_ART[e.type].sheet}_walk_${dir}`);
        }
        view.sprite.setFlipX(dir === 'side' && dx < 0);
      }
      view.sprite.setPosition(p.x, p.y).setDepth(DEPTH.units + p.y);
      view.last = p;
    }

    for (const [id, view] of this.enemies) {
      if (alive.has(id)) continue;
      this.enemies.delete(id);
      if (this.nearGate(view.last)) {
        view.sprite.destroy();
      } else {
        const sheet = view.sprite.texture.key;
        view.sprite.play(`${sheet}_death`);
        view.sprite.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => view.sprite.destroy());
      }
    }
  }

  /** Kale kapısına ulaşıp kaybolan düşman sızmıştır; ölüm animasyonu oynatılmaz. */
  private nearGate(p: { x: number; y: number }): boolean {
    const gate = PATH[PATH.length - 1];
    return Math.hypot(p.x - gate.x, p.y - gate.y) < 12;
  }

  private buildEnemy(e: Enemy, p: { x: number; y: number }): EnemyView {
    const art = ENEMY_ART[e.type];
    const sprite = this.add.sprite(p.x, p.y, art.sheet).setScale(art.scale).setDepth(DEPTH.units + p.y);
    sprite.play(`${art.sheet}_walk_down`);
    return { sprite, dir: 'down', last: { ...p } };
  }

  // ---------- katmanlar ----------

  private drawOverlay(): void {
    const s = this.state;
    const g = this.bars;
    g.clear();

    for (const e of s.enemies) {
      const p = enemyPosition(e);
      const r = 12 * ENEMY_ART[e.type].scale;
      if (e.slowUntil > s.time) {
        g.lineStyle(2, 0x5ac8ff, 0.9);
        g.strokeEllipse(p.x, p.y + r * 0.6, r * 2.2, r * 0.9);
      }
      if (e.poisonUntil > s.time) {
        g.fillStyle(0x5ad16b, 0.35);
        g.fillEllipse(p.x, p.y + r * 0.6, r * 2, r * 0.8);
      }
      const w = Math.max(24, r * 2);
      const y = p.y - r - 10;
      g.fillStyle(0x000000, 0.6);
      g.fillRect(p.x - w / 2, y, w, 4);
      g.fillStyle(0xff5252, 1);
      g.fillRect(p.x - w / 2, y, w * Math.max(0, e.hp / e.maxHp), 4);
    }

    const byId = new Map(s.enemies.map((e) => [e.id, e]));
    this.shots = this.shots.filter((sh) => sh.until > s.time);
    for (const sh of this.shots) {
      const u = s.board[sh.slot];
      const v = this.towers[sh.slot];
      if (!u || !v) continue;
      const from = v.weapon ? { x: v.weapon.x, y: v.weapon.y } : slotCenter(sh.slot);
      g.lineStyle(2, unitColor(u), 0.9);
      for (const id of sh.targetIds) {
        const e = byId.get(id);
        if (!e) continue;
        const p = enemyPosition(e);
        g.lineBetween(from.x, from.y, p.x, p.y);
      }
    }
  }

  private updateHud(): void {
    const s = this.state;
    this.hud.setText(`❤ ${s.lives}    💧 ${Math.floor(s.mana)}    Dalga ${s.wave}/${WAVES.length}`);
    this.phaseText.setText(s.phase === 'break' ? `Sonraki dalga: ${Math.ceil(s.breakLeft / 1000)} sn` : '');
    const cost = currentSummonCost(s);
    this.summonLabel.setText(`Çağır (${cost} 💧)`);
    this.summonButton.setFillStyle(s.mana >= cost && s.board.includes(null) ? 0x6a1b9a : 0x424242);
  }

  // ---------- dokunma ----------

  private onDown(p: Phaser.Input.Pointer): void {
    const i = slotAt(p.worldX, p.worldY);
    if (i === null) return;
    const u = this.state.board[i];
    if (!u) return;
    this.dragFrom = i;
    const art = TOWER_ART[unitArtId(u)];
    this.dragGhost
      .setTexture(art.base, tierForLevel(u.level))
      .setScale(TOWER_SCALE)
      .setTint(art.tint ?? 0xffffff)
      .setPosition(p.worldX, p.worldY + 30)
      .setVisible(true);
  }

  private onMove(p: Phaser.Input.Pointer): void {
    if (this.dragFrom === null) return;
    this.dragGhost.setPosition(p.worldX, p.worldY + 30);
  }

  private onUp(p: Phaser.Input.Pointer): void {
    if (this.dragFrom === null) return;
    const to = slotAt(p.worldX, p.worldY);
    if (to !== null) dropUnit(this.state, this.dragFrom, to);
    this.dragFrom = null;
    this.dragGhost.setVisible(false);
  }

  // ---------- bildirim ve bitiş ----------

  private showToast(text: string): void {
    this.toast.setText(text).setVisible(true);
    this.time.delayedCall(2000, () => this.toast.setVisible(false));
  }

  private showEnd(): void {
    this.endShown = true;
    const won = this.state.phase === 'won';
    const d = DEPTH.end;
    this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0x000000, 0.7).setDepth(d).setInteractive();
    this.add
      .text(GAME_WIDTH / 2, 330, won ? 'Kazandın! 🏆' : 'Kale düştü 💀', { fontSize: '36px', color: '#ffffff' })
      .setOrigin(0.5)
      .setDepth(d + 1);
    this.add
      .text(GAME_WIDTH / 2, 390, `Ulaşılan dalga: ${this.state.wave}/${WAVES.length}`, { fontSize: '18px', color: '#dddddd' })
      .setOrigin(0.5)
      .setDepth(d + 1);
    const btn = this.add.rectangle(GAME_WIDTH / 2, 470, 200, 60, 0x2e7d32).setDepth(d + 1).setInteractive({ useHandCursor: true });
    this.add.text(GAME_WIDTH / 2, 470, 'Tekrar Oyna', { fontSize: '22px', color: '#ffffff' }).setOrigin(0.5).setDepth(d + 2);
    btn.on('pointerdown', () => this.scene.restart());
  }
}
