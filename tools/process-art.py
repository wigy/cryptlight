#!/usr/bin/env python3
"""Turns assets/raw/*.png (Gemini output) into game-ready files in assets/game/.

Gemini returns opaque JPEG data, so cutouts are painted on magenta and keyed here.
  tile   -> seamless square JPEG (edges cross-faded so neighbouring wall cells join up)
  face   -> square JPEG
  image  -> JPEG at a sensible size
  sprite -> trimmed RGBA PNG/WebP with the magenta removed; its bottom edge is the subject's feet
  sheet  -> one RGBA icon per grid cell

Usage: python3 tools/process-art.py   (reads the manifest as JSON from stdin via tools/process-art.mjs)
"""
import json
import os
import sys

import numpy as np
from PIL import Image

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
RAW = os.path.join(ROOT, 'assets', 'raw')
OUT = os.path.join(ROOT, 'assets', 'game')

TILE_SIZE = 1024
SPRITE_MAX = 768
ICON_SIZE = 128
PORTRAIT_SIZE = 256


def magenta_alpha(rgb):
    """Alpha from how magenta a pixel is: both red and blue well above green.

    Measured rather than matched to #FF00FF because Gemini's backgrounds drift toward purple.
    """
    r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    amount = np.minimum(r, b) - g
    low, high = 35.0, 95.0
    return 1.0 - np.clip((amount - low) / (high - low), 0.0, 1.0)


def erode_alpha(alpha):
    """Shrinks the matte by a pixel to remove the fringe JPEG leaves around edges."""
    a = alpha.copy()
    a[1:, :] = np.minimum(a[1:, :], alpha[:-1, :])
    a[:-1, :] = np.minimum(a[:-1, :], alpha[1:, :])
    a[:, 1:] = np.minimum(a[:, 1:], alpha[:, :-1])
    a[:, :-1] = np.minimum(a[:, :-1], alpha[:, 1:])
    return a


def despill(rgb):
    """Pulls leftover magenta tint out of red and blue."""
    out = rgb.copy()
    excess = np.clip(np.minimum(rgb[..., 0], rgb[..., 2]) - rgb[..., 1], 0, None)
    out[..., 0] = rgb[..., 0] - excess
    out[..., 2] = rgb[..., 2] - excess
    return out


def key_out(img):
    rgb = np.asarray(img.convert('RGB'), dtype=np.float32)
    alpha = erode_alpha(magenta_alpha(rgb))
    clean = despill(rgb)
    # Keep only despilled colour where the matte is soft; solid pixels stay untouched.
    mix = (alpha[..., None] < 0.999)
    out_rgb = np.where(mix, clean, rgb)
    rgba = np.dstack([out_rgb, alpha * 255.0])
    return Image.fromarray(np.clip(rgba, 0, 255).astype(np.uint8), 'RGBA')


def flood_key(img, tolerance=38.0):
    """For when Gemini ignored the magenta request: removes the flat colour connected to the corners."""
    rgba = np.asarray(img.convert('RGBA'), dtype=np.float32).copy()
    h, w, _ = rgba.shape
    bg = np.median(np.array([rgba[0, 0, :3], rgba[0, w - 1, :3], rgba[h - 1, 0, :3], rgba[h - 1, w - 1, :3]]), axis=0)
    close = np.linalg.norm(rgba[..., :3] - bg, axis=2) < tolerance
    seen = np.zeros((h, w), dtype=bool)
    stack = [(0, 0), (0, w - 1), (h - 1, 0), (h - 1, w - 1)]
    while stack:
        y, x = stack.pop()
        if y < 0 or x < 0 or y >= h or x >= w or seen[y, x] or not close[y, x]:
            continue
        seen[y, x] = True
        stack.extend([(y + 1, x), (y - 1, x), (y, x + 1), (y, x - 1)])
    rgba[seen, 3] = 0
    return Image.fromarray(rgba.astype(np.uint8), 'RGBA')


def keep_main_subject(img, min_share=0.12):
    """Drops pieces not attached to the subject, such as torches Gemini floated beside it.

    Keeps the largest connected region of the matte and any region at least min_share of its size.
    """
    rgba = np.asarray(img).copy()
    solid = rgba[..., 3] > 40
    h, w = solid.shape
    labels = np.zeros((h, w), dtype=np.int32)
    sizes = [0]
    for sy in range(h):
        for sx in np.flatnonzero(solid[sy] & (labels[sy] == 0)):
            if labels[sy, sx]:
                continue
            label = len(sizes)
            labels[sy, sx] = label
            stack = [(sy, sx)]
            count = 0
            while stack:
                y, x = stack.pop()
                count += 1
                for ny, nx in ((y + 1, x), (y - 1, x), (y, x + 1), (y, x - 1)):
                    if 0 <= ny < h and 0 <= nx < w and solid[ny, nx] and not labels[ny, nx]:
                        labels[ny, nx] = label
                        stack.append((ny, nx))
            sizes.append(count)
    if len(sizes) <= 2:
        return img
    biggest = max(sizes)
    keep = np.array([s >= biggest * min_share for s in sizes])
    keep[0] = False
    mask = keep[labels]
    # Soft edge pixels sit outside `solid`; keep those only next to a kept region.
    grown = mask.copy()
    for _ in range(2):
        g = grown.copy()
        g[1:, :] |= grown[:-1, :]
        g[:-1, :] |= grown[1:, :]
        g[:, 1:] |= grown[:, :-1]
        g[:, :-1] |= grown[:, 1:]
        grown = g
    rgba[..., 3] = np.where(grown, rgba[..., 3], 0)
    return Image.fromarray(rgba, 'RGBA')


def trim(img, margin=2):
    alpha = np.asarray(img)[..., 3]
    ys, xs = np.where(alpha > 24)
    if len(xs) == 0:
        raise ValueError('image keyed to nothing')
    box = (max(0, xs.min() - margin), max(0, ys.min() - margin), min(img.width, xs.max() + margin + 1), min(img.height, ys.max() + margin + 1))
    return img.crop(box)


def fit(img, longest):
    scale = longest / max(img.size)
    if scale >= 1:
        return img
    return img.resize((round(img.width * scale), round(img.height * scale)), Image.LANCZOS)


def make_seamless(img, blend=0.14):
    """Rolls the image half way and cross-fades the seams, then rolls back, so it tiles both ways."""
    a = np.asarray(img.convert('RGB'), dtype=np.float32)
    h, w, _ = a.shape
    band = int(w * blend)
    out = a.copy()
    ramp = np.linspace(0, 1, band, dtype=np.float32)
    # Blend each edge with the pixels just beyond the opposite edge.
    for i in range(band):
        t = ramp[i]
        out[:, i] = a[:, i] * t + a[:, w - band + i] * (1 - t)
    a2 = out.copy()
    for i in range(band):
        t = ramp[i]
        out[i, :] = a2[i, :] * t + a2[h - band + i, :] * (1 - t)
    # The source bands are now duplicated at the far edges, so crop them away.
    cropped = out[: h - band, : w - band]
    return Image.fromarray(np.clip(cropped, 0, 255).astype(np.uint8), 'RGB')


def main():
    manifest = json.load(sys.stdin)
    os.makedirs(OUT, exist_ok=True)
    sizes = {}
    missing = []
    for art_id, d in manifest['art'].items():
        src = os.path.join(RAW, f'{art_id}.png')
        if not os.path.exists(src):
            missing.append(art_id)
            continue
        img = Image.open(src)
        kind = d['kind']
        if kind == 'tile':
            tile = make_seamless(img).resize((TILE_SIZE, TILE_SIZE), Image.LANCZOS)
            if 'gain' in d:  # Darkens textures Gemini painted too pale for torchlight.
                tile = Image.fromarray(np.clip(np.asarray(tile, dtype=np.float32) * d['gain'], 0, 255).astype(np.uint8), 'RGB')
            tile.save(os.path.join(OUT, f'{art_id}.jpg'), quality=88)
        elif kind == 'face':
            img.convert('RGB').resize((TILE_SIZE, TILE_SIZE), Image.LANCZOS).save(os.path.join(OUT, f'{art_id}.jpg'), quality=88)
        elif kind == 'image':
            target = PORTRAIT_SIZE if art_id.startswith('portrait') else 1600
            fit(img.convert('RGB'), target).save(os.path.join(OUT, f'{art_id}.jpg'), quality=88)
        elif kind == 'sprite':
            cut = key_out(img)
            if d.get('floodKey'):
                cut = flood_key(cut)
            if not d.get('noTrim'):
                # Loose pieces are usually stray torches, but `loose` keeps ones that belong, such as sparks.
                cut = trim(cut if d.get('loose') else keep_main_subject(cut))
            fit(cut, d.get('size', SPRITE_MAX)).save(os.path.join(OUT, f'{art_id}.webp'), quality=90, method=6)
            sizes[art_id] = cut.size
        elif kind == 'sheet':
            grid = d['grid']
            cw, ch = img.width / grid, img.height / grid
            # Inset each cell to lose the grid lines Gemini sometimes draws.
            inset = int(cw * 0.025)
            for i, name in enumerate(manifest['icons']):
                col, row = i % grid, i // grid
                box = (int(col * cw) + inset, int(row * ch) + inset, int((col + 1) * cw) - inset, int((row + 1) * ch) - inset)
                icon = trim(key_out(img.crop(box)))
                icon = fit(icon, ICON_SIZE)
                canvas = Image.new('RGBA', (ICON_SIZE, ICON_SIZE), (0, 0, 0, 0))
                canvas.paste(icon, ((ICON_SIZE - icon.width) // 2, (ICON_SIZE - icon.height) // 2))
                canvas.save(os.path.join(OUT, f'icon-{name}.webp'), quality=90, method=6)
        print('ok', art_id)
    # The engine looks images up by name in this index, so it needn't know formats.
    index = {os.path.splitext(f)[0]: f for f in sorted(os.listdir(OUT)) if f != 'index.json'}
    with open(os.path.join(OUT, 'index.json'), 'w') as fh:
        json.dump(index, fh, indent=0)
    if missing:
        print('missing:', ', '.join(missing))


if __name__ == '__main__':
    main()
