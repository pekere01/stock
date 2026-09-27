import Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH } from './data/level';
import { MatchScene } from './scenes/MatchScene';

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  width: GAME_WIDTH,
  height: GAME_HEIGHT,
  backgroundColor: '#1b2a1f',
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
  scene: [MatchScene],
});

// Geliştirme sırasında konsoldan/otomasyondan oyuna erişim (üretim paketine girmez).
if (import.meta.env.DEV) (window as unknown as { game: Phaser.Game }).game = game;
