"""Ham CC0 paketlerden (assets/_raw) oyunun kullandığı görselleri public/assets'e temiz isimlerle kopyalar.

Kullanım: python scripts/import_art.py
Paketleri yeniden indirmek için bkz. assets/CREDITS.md. Tasarımlar değişince bu listeyi ve
src/data/art.ts'i birlikte güncelle.
"""
import glob
import os
import shutil

from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RAW = os.path.join(ROOT, 'assets', '_raw')
OUT = os.path.join(ROOT, 'public', 'assets')

KENNEY = 'kenney_tower-defense-top-down/PNG/Default size/towerDefense_tile{:03d}.png'
MAP_TILES = {
    'grass': 24,
    'pad': 84,
    'bush_big': 130,
    'bush_small': 131,
    'plant': 132,
    'tree': 133,
    'star_plant': 134,
    'rock1': 135,
    'rock2': 136,
    'rock3': 137,
}

TOWERS = [1, 2, 3, 4, 5, 6, 7, 8]
ENEMIES = {
    'leafbug': 'Leafbug',
    'firebug': 'Firebug',
    'magma_crab': 'Magma Crab',
    'scorpion': 'Scorpion',
    'voidbutterfly': 'Voidbutterfly',
}


def find_one(pattern: str) -> str:
    hits = glob.glob(os.path.join(RAW, '**', pattern), recursive=True)
    if len(hits) != 1:
        raise SystemExit(f'{pattern}: {len(hits)} eşleşme bulundu, 1 bekleniyordu')
    return hits[0]


def copy(src: str, dst_rel: str) -> str:
    dst = os.path.join(OUT, dst_rel)
    os.makedirs(os.path.dirname(dst), exist_ok=True)
    shutil.copyfile(src, dst)
    return dst


def row_frame_counts(path: str, frame: int) -> list[int]:
    """Her satırda soldan itibaren dolu (tamamen saydam olmayan) kare sayısı."""
    im = Image.open(path).convert('RGBA')
    cols, rows = im.width // frame, im.height // frame
    counts = []
    for r in range(rows):
        n = 0
        for c in range(cols):
            if im.crop((c * frame, r * frame, (c + 1) * frame, (r + 1) * frame)).getbbox():
                n = c + 1
        counts.append(n)
    return counts


def main() -> None:
    for name, idx in MAP_TILES.items():
        copy(os.path.join(RAW, KENNEY.format(idx)), f'map/{name}.png')
    print('map: ok')

    for n in TOWERS:
        base = copy(find_one(f'Tower 0{n}.png'), f'towers/t{n}_base.png')
        w, h = Image.open(base).size
        print(f't{n}_base {w}x{h} -> kare {w // 3}x{h}')
        for lv in (1, 2, 3):
            hits = glob.glob(os.path.join(RAW, '**', f'Tower 0{n} - Level 0{lv} - Weapon.png'), recursive=True)
            hits = [p for p in hits if 'Previews' not in p and 'GIFs' not in p]
            if not hits:
                continue
            w, h = Image.open(hits[0]).size
            if w % h:
                print(f'  t{n}_l{lv}: {w}x{h} kare bölünmüyor, atlandı')
                continue
            copy(hits[0], f'towers/t{n}_l{lv}.png')
            print(f'  t{n}_l{lv}: {w}x{h} -> {w // h} kare, {h}px')

    for key, name in ENEMIES.items():
        dst = copy(find_one(f'{name}.png'), f'enemies/{key}.png')
        w, h = Image.open(dst).size
        frame = h // 9
        print(f'{key}: {w}x{h}, kare {frame}px, satırlar {row_frame_counts(dst, frame)}')


if __name__ == '__main__':
    main()
