"""Create original, maskable PWA icons with Pillow; no remote art dependencies."""

from pathlib import Path
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "client" / "public" / "icons"
OUT.mkdir(parents=True, exist_ok=True)

for size in (192, 512):
    scale = 3
    dim = size * scale
    im = Image.new("RGB", (dim, dim), "#17282a")
    draw = ImageDraw.Draw(im)

    def point(x, y):
        return (round(x * dim / 512), round(y * dim / 512))

    box = point(104, 104) + point(409, 409)
    draw.arc(box, 53, 307, fill="#a7e6ba", width=round(62 * dim / 512))
    center_x, center_y = 372, 166
    sparkle = [
        point(center_x, center_y - 49),
        point(center_x + 19, center_y - 19),
        point(center_x + 49, center_y),
        point(center_x + 19, center_y + 19),
        point(center_x, center_y + 49),
        point(center_x - 19, center_y + 19),
        point(center_x - 49, center_y),
        point(center_x - 19, center_y - 19),
    ]
    draw.polygon(sparkle, fill="#e6f5ee")
    draw.line((point(124, 418), point(388, 418)), fill="#6c8d84", width=round(11 * dim / 512))
    im.resize((size, size), Image.Resampling.LANCZOS).save(OUT / f"icon-{size}.png", optimize=True)
