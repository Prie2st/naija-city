"""Pack immutable architectural PNG masters; no runtime geometry authoring.

Run from the repository root with Python + Pillow. Source metadata is in art/.
This script only trims transparent margins, downsamples and packs atlas pages.
"""
from pathlib import Path
import json
import math
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'public/assets/architecture'
DOC = ROOT / 'docs/art-pass-2'
TIERS = (2, 6, 9, 12)


def build():
  # Small concrete driveway culverts are authored offline, then composed as sprites.
  for variant in (0, 1):
    bridge = Image.new('RGBA', (240, 156))
    pen = ImageDraw.Draw(bridge)
    points = [(20, 72), (140, 12), (220, 52), (100, 112)]
    if variant:
      points = [(240-x, y) for x, y in points]
    pen.polygon([(x+7, y+18) for x, y in points], fill='#34443844')
    pen.polygon([(x, y+10) for x, y in points], fill='#8a8d82')
    pen.polygon(points, fill='#c5c2b3')
    for n in range(1, 5):
      x = 20 + n * 24
      line = [(x, 72-n*12), (x+80, 112-n*12)]
      if variant:
        line = [(240-x, y) for x, y in line]
      pen.line(line, fill='#9b9f92', width=2)
    bridge.save(ROOT / f'art/masters/driveway-bridge-{variant}.png')
  source = json.loads((ROOT / 'art/benchmark-source.json').read_text(encoding='utf-8-sig'))
  assets, pictures, sheets = [], {}, {}
  OUT.mkdir(parents=True, exist_ok=True)
  DOC.mkdir(parents=True, exist_ok=True)
  for item in source:
    original = Image.open(ROOT / 'art/masters' / (item['id'] + '.png')).convert('RGBA')
    bounds = original.getbbox()
    if not bounds or original.getextrema()[3][0] != 0:
      raise ValueError(f"{item['id']} needs genuine transparency")
    picture = original.crop(bounds)
    pixels_per_world = picture.width / item['worldWidth']
    # Property ground front reaches y=24; standalone props anchor at their feet.
    ground_front = item.get('groundFront', 24 if item['type'] != 'prop' else 0)
    anchor_y = picture.height - ground_front * pixels_per_world
    anchor = [item.get('anchorX', .5), anchor_y / picture.height]
    meta = dict(item, anchor=anchor, visualHeight=round(max(0, anchor_y / pixels_per_world) + 2, 2),
                masterSize=list(original.size), lod=list(TIERS))
    assets.append(meta)
    pictures[item['id']] = picture
  for tier in TIERS:
    page_size = 512 if tier == 2 else 2048
    frames = []
    for item in assets:
      picture = pictures[item['id']]
      width = math.floor(item['worldWidth'] * tier + .5)
      height = math.floor(width * picture.height / picture.width + .5)
      if width > picture.width or height > picture.height:
        raise ValueError(f"{item['id']}: cannot upscale a master at {tier} samples/world unit")
      frames.append((item, picture.resize((width, height), Image.Resampling.LANCZOS)))
    pages = []
    for item, picture in sorted(frames, key=lambda pair: pair[1].height, reverse=True):
      w, h = picture.size
      if max(w + 4, h + 4) > page_size:
        raise ValueError(f"Oversized frame: {item['id']}")
      selected = None
      for page in pages:
        px, py, rh = page['x'], page['y'], page['row']
        if px + w + 4 > page_size:
          px, py, rh = 0, py + rh, 0
        if py + h + 4 <= page_size:
          selected = page
          page['x'], page['y'], page['row'] = px, py, rh
          break
      if selected is None:
        selected = {'image': Image.new('RGBA', (page_size, page_size)), 'frames': {}, 'x': 0, 'y': 0, 'row': 0}
        pages.append(selected)
      px, py = selected['x'] + 2, selected['y'] + 2
      selected['image'].paste(picture, (px, py))
      selected['frames']['benchmark-' + item['id']] = {
        'frame': {'x': px, 'y': py, 'w': w, 'h': h}, 'rotated': False, 'trimmed': False,
        'spriteSourceSize': {'x': 0, 'y': 0, 'w': w, 'h': h}, 'sourceSize': {'w': w, 'h': h}
      }
      selected['x'] += w + 4
      selected['row'] = max(selected['row'], h + 4)
    sheets[tier] = []
    for n, page in enumerate(pages):
      name = f'benchmark-{tier}-{n}'
      page['image'].save(OUT / (name + '.png'), optimize=True)
      (OUT / (name + '.json')).write_text(json.dumps({'frames': page['frames'], 'meta': {
        'image': name + '.png', 'scale': str(tier), 'size': {'w': page_size, 'h': page_size}
      }}, separators=(',', ':')), encoding='utf-8')
      sheets[tier].append({'key': name, 'width': page_size, 'height': page_size})
    print(f'{tier} samples/world unit: {len(pages)} pages, {len(frames)} frames')
  (OUT / 'manifest.json').write_text(json.dumps({'assets': assets, 'sheets': sheets}, indent=2), encoding='utf-8')
  retained = {p['key'] + suffix for pages in sheets.values() for p in pages for suffix in ('.json', '.png')}
  for old in OUT.glob('benchmark-*'):
    if old.is_file() and old.suffix in ('.json', '.png') and old.name not in retained:
      if old.resolve().parent != OUT.resolve():
        raise ValueError('Refusing to clean a file outside the generated atlas directory')
      old.unlink()
  (ROOT / 'client/game/architecture-catalog.ts').write_text(
    '// Generated by tools/art/build_atlases.py; edit art/benchmark-source.json instead.\n'
    + 'export const architectureCatalog = ' + json.dumps(assets, separators=(',', ':')) + ' as const;\n'
    + 'export const architectureSheets = ' + json.dumps(sheets, separators=(',', ':')) + ' as const;\n', encoding='utf-8')
  # Contact sheets include actual alpha silhouettes, not unrelated concept artwork.
  for silhouette in (False, True):
    cell_w, cell_h, cols = 340, 355, 4
    sheet = Image.new('RGB', (cols * cell_w, math.ceil(len(assets) / cols) * cell_h), '#ede8dc')
    draw = ImageDraw.Draw(sheet)
    for n, item in enumerate(assets):
      picture = pictures[item['id']].copy()
      picture.thumbnail((320, 315), Image.Resampling.LANCZOS)
      if silhouette:
        ink = Image.new('RGBA', picture.size, '#18211d')
        ink.putalpha(picture.getchannel('A'))
        picture = ink
      x, y = n % cols * cell_w, n // cols * cell_h
      sheet.paste(picture, (x + (cell_w - picture.width) // 2, y + 315 - picture.height), picture)
      draw.text((x + 10, y + 326), item['id'], fill='#243f33')
    sheet.save(DOC / ('silhouettes.jpg' if silhouette else 'benchmark-library.jpg'), quality=94)


if __name__ == '__main__':
  build()
