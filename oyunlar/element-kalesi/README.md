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

> [!info] Geliştirme ipucu
> Dev modunda oyun `window.game` olarak açıktır; tarayıcı paneli gizliyken döngü durursa
> `game.step(zaman, 16)` ile kare kare ilerletilebilir.
