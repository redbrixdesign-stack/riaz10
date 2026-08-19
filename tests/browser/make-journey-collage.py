#!/usr/bin/env python3
import json, os
from PIL import Image, ImageDraw, ImageFont

BASE = '/Users/muhammadasifriaz/riaz10/screenshots/audit-journey'
OUT = os.path.join(BASE, 'collage')
os.makedirs(OUT, exist_ok=True)

manifest = json.load(open(os.path.join(BASE, 'manifest.json')))
shots = manifest['shots']
by_num = {}
for s in shots:
    by_num[int(s['file'].split('-')[0])] = s

def font(size, bold=False):
    for p in ['/System/Library/Fonts/Supplemental/Arial Bold.ttf', '/System/Library/Fonts/Supplemental/Arial.ttf',
              '/Library/Fonts/Arial.ttf', '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf']:
        if os.path.exists(p):
            return ImageFont.truetype(p, size)
    return ImageFont.load_default()

def wrap(draw, text, f, maxw):
    words, lines, cur = text.split(), [], ''
    for w in words:
        t = (cur + ' ' + w).strip()
        if draw.textlength(t, font=f) <= maxw: cur = t
        else: lines.append(cur); cur = w
    if cur: lines.append(cur)
    return lines

def canvas(title, subtitle, nums, outfile):
    SCALE = 1.0   # native resolution — every shot crisp and readable
    GAP = 26
    TITLE_H = 150
    CAP_H = 96
    W = 780
    imgs = [Image.open(os.path.join(BASE, by_num[n]['file'])).convert('RGB') for n in nums]
    H = imgs[0].size[1]
    cols = 2
    rows = (len(imgs) + cols - 1) // cols
    cw = cols * W + GAP * (cols + 1)
    ch = TITLE_H + rows * (H + CAP_H) + GAP * (rows + 1)
    c = Image.new('RGB', (cw, ch), (10, 10, 10))
    d = ImageDraw.Draw(c)
    ft = font(46, bold=True)
    fs = font(26)
    fc = font(26)
    fi = font(24, bold=True)
    d.text((GAP, 18), title, font=ft, fill=(232, 184, 84))
    if subtitle:
        d.text((GAP, 84), subtitle, font=fs, fill=(190, 190, 190))
    d.line([(GAP, TITLE_H - 18), (cw - GAP, TITLE_H - 18)], fill=(70, 70, 70), width=3)
    for i, im in enumerate(imgs):
        r, cc = divmod(i, cols)
        x = GAP + cc * (W + GAP)
        y = TITLE_H + GAP + r * (H + CAP_H + GAP)
        c.paste(im, (x, y))
        num = nums[i]
        d.ellipse([x + 10, y + 10, x + 54, y + 54], fill=(232, 184, 84))
        d.text((x + 22, y + 14), str(num), font=fi, fill=(10, 10, 10))
        cap = f"{num}. {by_num[num]['description']}"
        lines = wrap(d, cap, fc, W)
        ty = y + H + 14
        for ln in lines[:2]:
            d.text((x, ty), ln, font=fc, fill=(220, 220, 220))
            ty += 32
    c.save(os.path.join(OUT, outfile))
    print(f'  ✓ {outfile} ({cw}x{ch}, shots {nums[0]}-{nums[-1]})')

print('Regenerating into 3 canvases (native 1:1):')
canvas('BEELO — THE JOURNEY  ·  PART 1: DISCOVER & CONNECT',
       'Home feed · visit detail · customer 360 · contact sheet (WhatsApp / Call / Copy)',
       [1, 2, 3, 4, 5, 6, 7, 8, 9], 'canvas-1-discover-connect.png')
canvas('BEELO — THE JOURNEY  ·  PART 2: SELL & DELIVER',
       'Outcomes (quoted → ordered + deposit) · kanban · money · mileage modal · follow-ups · message preview',
       [10, 11, 12, 13, 14, 15, 16, 17], 'canvas-2-sell-deliver.png')
canvas('BEELO — THE JOURNEY  ·  PART 3: ON THE ROAD & WRAP-UP',
       'Live mileage trip · My Day · Ask Beelo · back to home',
       [18, 19, 20, 21, 22], 'canvas-3-road-wrapup.png')
