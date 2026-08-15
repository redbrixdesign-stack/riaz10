import os
from PIL import Image

# Order of screenshots
files = [
    'today-mobile-seeded.png',
    'appointments-mobile-seeded.png',
    'route-mobile-seeded.png',
    'money-mobile-seeded.png',
    'talk-mobile-seeded.png',
    'measure-mobile-seeded.png',
    'ocr-mobile-seeded.png',
    'settings-mobile-seeded.png',
    'followups-mobile-seeded.png',
    'orders-mobile-seeded.png',
    'customer-mobile-seeded.png',
    'control-mobile-seeded.png',
    'companion-mobile-seeded.png',
]

src_dir = '/Users/muhammadasifriaz/Desktop/riaz10/screenshots-seeded'
output_path = '/Users/muhammadasifriaz/Desktop/riaz10/screenshots-seeded/collage-mobile-seeded.png'

images = []
max_w = 0
max_h = 0
for f in files:
    path = os.path.join(src_dir, f)
    if not os.path.exists(path):
        print(f'Missing {f}, skipping')
        continue
    im = Image.open(path).convert('RGB')
    images.append(im)
    max_w = max(max_w, im.width)
    max_h = max(max_h, im.height)

cols = 4
rows = (len(images) + cols - 1) // cols
canvas_w = cols * max_w + (cols - 1) * 20
canvas_h = rows * max_h + (rows - 1) * 20
canvas = Image.new('RGB', (canvas_w, canvas_h), (255, 255, 255))

for idx, im in enumerate(images):
    col = idx % cols
    row = idx // cols
    x = col * (max_w + 20)
    y = row * (max_h + 20)
    # Center image within cell if smaller
    offset_x = x + (max_w - im.width) // 2
    offset_y = y + (max_h - im.height) // 2
    canvas.paste(im, (offset_x, offset_y))

os.makedirs(os.path.dirname(output_path), exist_ok=True)
canvas.save(output_path)
print(f'Collage saved to {output_path}, size {canvas.size}')
