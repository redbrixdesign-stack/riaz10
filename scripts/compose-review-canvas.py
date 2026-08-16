#!/usr/bin/env python3
"""Compose the review screenshots into labelled grid canvases.

Pure image compositing (Pillow): each screenshot is scaled to a ~500px
cell width, labelled with its filename + short description, and laid out
in a 3-column grid with 20px gutters on a light-grey background. The
tall full-page captures get their own single-column canvas. Originals
are untouched.

Run: python3 scripts/compose-review-canvas.py
Output: screenshots/review/review-canvas-*.png
"""
import json
import os

from PIL import Image, ImageDraw, ImageFont

OUT = os.path.join(os.path.dirname(__file__), '..', 'screenshots', 'review')
OUT = os.path.abspath(OUT)

# ---- layout ----
CELL_W = 500          # target width of each scaled screenshot
PAD = 20              # gutter between cells / canvas margin
BG = (240, 240, 240)  # neutral light grey so nothing looks broken
LABEL_BG = (255, 255, 255)
INK = (40, 40, 40)
MUTED = (120, 120, 120)

FONT_PATHS = {
    'bold': '/System/Library/Fonts/Supplemental/Arial Bold.ttf',
    'regular': '/System/Library/Fonts/Supplemental/Arial.ttf',
}
FONT_BOLD = ImageFont.truetype(FONT_PATHS['bold'], 26)
FONT_REG = ImageFont.truetype(FONT_PATHS['regular'], 19)

# ---- group the 42 shots into logical canvases ----
CANVASES = [
    ('review-canvas-01-home.png', 'Home & Companion', [
        '01-home.png', '01-home-scrolled.png', '01-home-next-tomorrow.png',
        '27-chat-answer.png',
        '19-modal-my-day.png', '18-modal-end-of-day.png', '28-home-empty.png',
        '32-offline-banner.png', '36-loading-skeleton.png',
        '33-home-320px.png', '34-home-430px.png', '17-onboarding.png',
    ]),
    ('review-canvas-02-visits.png', 'Visits', [
        '06-visits-diary.png', '23-modal-visit-outcome.png',
        '07-visits-upcoming.png', '08-visits-pipeline.png',
        '09-visits-area.png', '10-visits-past.png', '31-visits-empty.png',
        '24-modal-add-visit.png',
    ]),
    ('review-canvas-03-followups-orders.png', 'Follow-ups & Orders', [
        '02-followups.png', '22-modal-message-preview.png',
        '29-followups-empty.png', '03-orders.png',
        '20-modal-order-sheet.png', '30-orders-empty.png',
    ]),
    ('review-canvas-04-money-tools-route.png', 'Money, Tools, Route, Talk, Measure, Scan', [
        '04-money.png', '21-modal-expense.png', '05-tools.png',
        '11-route.png', '12-talk.png', '13-measure.png', '14-scan.png',
    ]),
    ('review-canvas-05-settings-customer.png', 'Settings & Customer', [
        '15-settings.png', '16-customer-360.png',
        '25-modal-customer-edit.png', '26-modal-photo-viewer.png',
    ]),
    ('review-canvas-06-fullpage.png', 'Full-page variants', [
        '01-home-full.png', '02-followups-full.png', '06-visits-diary-full.png',
        '11-route-full.png', '15-settings-full.png', '16-customer-360-full.png',
    ]),
]

COLS = 3
DESC_MAX = 60  # description chars before truncation


def load_manifest():
    with open(os.path.join(OUT, 'manifest.json'), 'r', encoding='utf-8') as fh:
        return {e['file']: e['description'] for e in json.load(fh)}


def fit_text(draw, text, font, max_w):
    """Truncate text with an ellipsis so it fits max_w pixels."""
    if draw.textlength(text, font=font) <= max_w:
        return text
    while text and draw.textlength(text + '…', font=font) > max_w:
        text = text[:-1]
    return text + '…'


def label_block(draw, x, y, width, filename, description, fullpage=False):
    """Draw the filename + description label. Returns the block height."""
    lh1 = 30
    lh2 = 24
    h = (lh1 + lh2) if description else lh1
    draw.rectangle([x, y, x + width, y + h], fill=LABEL_BG)
    draw.text((x + 6, y), filename, font=FONT_BOLD, fill=INK)
    if description:
        draw.text((x + 6, y + lh1), fit_text(draw, description, FONT_REG, width - 12),
                  font=FONT_REG, fill=MUTED)
    return h


def compose_grid(files, manifest, cols):
    """Lay out screenshots in a labelled grid. Returns the canvas image."""
    cells = []
    for name in files:
        im = Image.open(os.path.join(OUT, name)).convert('RGB')
        w = CELL_W
        h = round(im.height * (w / im.width))
        cells.append((name, im.resize((w, h), Image.LANCZOS)))

    rows = (len(cells) + cols - 1) // cols
    cell_h = max((c[1].height for c in cells), default=1)
    label_h = 60
    grid_w = cols * CELL_W + (cols + 1) * PAD
    grid_h = rows * (cell_h + label_h) + (rows + 1) * PAD

    canvas = Image.new('RGB', (grid_w, grid_h), BG)
    draw = ImageDraw.Draw(canvas)

    for idx, (name, im) in enumerate(cells):
        r, c = divmod(idx, cols)
        x = PAD + c * (CELL_W + PAD)
        y = PAD + r * (cell_h + label_h + PAD)
        desc = manifest.get(name, '')
        label_h_actual = label_block(draw, x, y, CELL_W, name, desc)
        y += label_h_actual + 6
        canvas.paste(im, (x, y))
    return canvas


def compose_fullpage(files, manifest):
    """Single-column canvas for the tall full-page captures."""
    cells = []
    for name in files:
        im = Image.open(os.path.join(OUT, name)).convert('RGB')
        w = CELL_W
        h = round(im.height * (w / im.width))
        cells.append((name, im.resize((w, h), Image.LANCZOS)))

    label_h = 60
    col_w = CELL_W + 2 * PAD
    col_h = PAD + sum(label_h + 6 + im.height + PAD for _, im in cells)

    canvas = Image.new('RGB', (col_w, col_h), BG)
    draw = ImageDraw.Draw(canvas)
    y = PAD
    for name, im in cells:
        x = PAD
        desc = manifest.get(name, '')
        label_h_actual = label_block(draw, x, y, CELL_W, name, desc)
        y += label_h_actual + 6
        canvas.paste(im, (x, y))
        y += im.height + PAD
    return canvas


def main():
    manifest = load_manifest()
    total = 0
    for fname, title, files in CANVASES:
        missing = [f for f in files if not os.path.exists(os.path.join(OUT, f))]
        if missing:
            print(f'!! {fname}: missing {missing} — skipping')
            continue
        canvas = compose_fullpage(files, manifest) if fname.endswith('fullpage.png') \
            else compose_grid(files, manifest, COLS)
        dest = os.path.join(OUT, fname)
        canvas.save(dest, 'PNG')
        total += len(files)
        print(f'✓ {fname} — {len(files)} shots, {canvas.size[0]}×{canvas.size[1]}px')
    print(f'DONE — {total} shots composed across {len(CANVASES)} canvases → {OUT}')


if __name__ == '__main__':
    main()
