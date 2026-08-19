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

def canvas(title, nums, outfile):
    # NATIVE resolution — every screenshot at 1:1 (crisp phone-size shots)
    SCALE = 1.0
    GAP = 26
    TITLE_H = 92
    CAP_H = 96
    COL_W = 780
    imgs = [Image.open(os.path.join(BASE, by_num[n]['file'])).convert('RGB') for n in nums]
    W = int(COL_W * SCALE)
    H = int(imgs[0].size[1] * SCALE)
    cols = 2
    rows = (len(imgs) + cols - 1) // cols
    cw = cols * W + GAP * (cols + 1)
    ch = TITLE_H + rows * (H + CAP_H) + GAP * (rows + 1)
    c = Image.new('RGB', (cw, ch), (10, 10, 10))
    d = ImageDraw.Draw(c)
    ft = font(42, bold=True)
    fc = font(26)
    fi = font(24, bold=True)
    d.text((GAP, 20), title, font=ft, fill=(232, 184, 84))
    d.line([(GAP, TITLE_H - 14), (cw - GAP, TITLE_H - 14)], fill=(70, 70, 70), width=3)
    for i, im in enumerate(imgs):
        r, cc = divmod(i, cols)
        x = GAP + cc * (W + GAP)
        y = TITLE_H + GAP + r * (H + CAP_H + GAP)
        thumb = im.resize((W, H), Image.LANCZOS) if SCALE != 1.0 else im
        c.paste(thumb, (x, y))
        num = nums[i]
        # index badge
        d.ellipse([x + 10, y + 10, x + 54, y + 54], fill=(232, 184, 84))
        d.text((x + 22, y + 14), str(num), font=fi, fill=(10, 10, 10))
        cap = f"{num}. {by_num[num]['description']}"
        lines = wrap(d, cap, fc, W)
        ty = y + H + 14
        for ln in lines[:2]:
            d.text((x, ty), ln, font=fc, fill=(220, 220, 220))
            ty += 32
    c.save(os.path.join(OUT, outfile))
    print(f'  ✓ {outfile} ({cw}x{ch}, {len(nums)} shots, 1:1 native)')

print('Regenerating collages at NATIVE resolution:')
canvas('HOME — feed, weekly calendar, attention', [1, 2, 3], 'canvas-1-home.png')
canvas('VISIT DETAIL + CUSTOMER 360', [4, 5], 'canvas-2-visit-customer.png')
canvas('CONTACT SHEET — WhatsApp / Call / Copy', [6, 7, 8, 9], 'canvas-3-contact.png')
canvas('OUTCOMES — quoted → ordered + deposit', [10, 11, 12], 'canvas-4-outcomes.png')
canvas('ORDERS + MONEY + MILEAGE MODAL', [13, 14, 15], 'canvas-5-orders-money.png')
canvas('FOLLOW-UPS + MESSAGE PREVIEW', [16, 17], 'canvas-6-followups-messages.png')
canvas('LIVE MILEAGE TRIP — start → arrival', [18, 19], 'canvas-7-trip.png')
canvas('MY DAY + ASK BEELO', [20, 21, 22], 'canvas-8-myyday-beelo.png')
