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
        align: 'center',
        wordWrap: { width: GAME_WIDTH - 60 },
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
        this.showToast(`Yeni melez keşfedildi!\n${HYBRID_INFO[ev.hybrid].name}`);
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
