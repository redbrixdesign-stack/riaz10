#!/usr/bin/env python3
import json, os, glob
from PIL import Image, ImageDraw, ImageFont

BASE = '/Users/muhammadasifriaz/riaz10/screenshots/audit-journey'
OUT = os.path.join(BASE, 'collage')
os.makedirs(OUT, exist_ok=True)

manifest = json.load(open(os.path.join(BASE, 'manifest.json')))
shots = manifest['shots']  # [{file, description}]
by_num = {}
for s in shots:
    n = int(s['file'].split('-')[0])
    by_num[n] = s

def font(size, bold=False):
    for p in ['/System/Library/Fonts/Supplemental/Arial Bold.ttf', '/System/Library/Fonts/Supplemental/Arial.ttf',
              '/Library/Fonts/Arial.ttf', '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf']:
        if os.path.exists(p):
            return ImageFont.truetype(p, size)
    return ImageFont.load_default()

def wrap(draw, text, font, maxw):
    words = text.split()
    lines, cur = [], ''
    for w in words:
        t = (cur + ' ' + w).strip()
        if draw.textlength(t, font=font) <= maxw:
            cur = t
        else:
            lines.append(cur); cur = w
    if cur: lines.append(cur)
    return lines

def canvas(title, nums, outfile):
    BG = (10, 10, 10)
    GAP = 18
    TITLE_H = 72
    CAP_H = 44
    scale = 0.34
    imgs = [Image.open(os.path.join(BASE, by_num[n]['file'])).convert('RGB') for n in nums]
    W = 780
    for im in imgs:
        w, h = im.size
        W = max(W, int(w * scale))
    H = int(imgs[0].size[1] * scale)
    cols = 2 if len(imgs) > 2 else len(imgs)
    rows = (len(imgs) + cols - 1) // cols
    cw = W * cols + GAP * (cols + 1)
    ch = TITLE_H + rows * (H + CAP_H) + GAP * (rows + 1)
    canvas_img = Image.new('RGB', (cw, ch), BG)
    d = ImageDraw.Draw(canvas_img)
    f_title = font(34, bold=True)
    f_cap = font(20)
    d.text((GAP, 16), title, font=f_title, fill=(232, 184, 84))
    d.line([(GAP, TITLE_H - 8), (cw - GAP, TITLE_H - 8)], fill=(60, 60, 60), width=2)
    for i, im in enumerate(imgs):
        r, c = divmod(i, cols)
        x = GAP + c * (W + GAP)
        y = TITLE_H + GAP + r * (H + CAP_H + GAP)
        thumb = im.resize((W, H), Image.LANCZOS)
        canvas_img.paste(thumb, (x, y))
        cap = by_num[nums[i]]['description']
        lines = wrap(d, cap, f_cap, W)
        ty = y + H + 8
        for ln in lines[:2]:
            d.text((x, ty), ln, font=f_cap, fill=(200, 200, 200))
            ty += 24
    canvas_img.save(os.path.join(OUT, outfile))
    print('  ✓', outfile, f'({cw}x{ch}, {len(nums)} shots)')

print('Collage from', len(shots), 'screenshots:')
canvas('HOME — feed, weekly calendar, attention', [1, 2, 3], 'canvas-1-home.png')
canvas('VISIT DETAIL + CUSTOMER 360', [4, 5], 'canvas-2-visit-customer.png')
canvas('CONTACT SHEET — WhatsApp / Call / Copy', [6, 7, 8, 9], 'canvas-3-contact.png')
canvas('OUTCOMES — quoted → ordered + deposit', [10, 11, 12], 'canvas-4-outcomes.png')
canvas('ORDERS + MONEY + MILEAGE MODAL', [13, 14, 15], 'canvas-5-orders-money.png')
canvas('FOLLOW-UPS + MESSAGE PREVIEW', [16, 17], 'canvas-6-followups-messages.png')
canvas('LIVE MILEAGE TRIP — start → arrival', [18, 19], 'canvas-7-trip.png')
canvas('MY DAY + ASK BEELO', [20, 21, 22], 'canvas-8-myyday-beelo.png')
