"""Make reviewable labeled contact sheets from dual-Chrome arsenal captures.

Usage: python scripts/build-arsenal-contact-sheet.py 2026-10-31T05-00-20-416Z
Requires Pillow. Reads existing screenshots and never edits them.
"""

from pathlib import Path
import argparse
from PIL import Image, ImageDraw, ImageFont, ImageOps


def build_sheet(folder: Path, capture: str, browser: str, state: str) -> Path | None:
    prefix = f"two-chrome-{capture}-{browser}-"
    files = sorted(folder.glob(f"{prefix}*.jpg"))
    files = [p for p in files if "contact" not in p.name and
             p.name.endswith("-reload.jpg") == (state == "reload")]
    if not files:
        return None

    columns, width, height, heading = 4, 352, 220, 31
    rows = (len(files) + columns - 1) // columns
    sheet = Image.new("RGB", (columns * width, rows * (height + heading)), "#101923")
    draw = ImageDraw.Draw(sheet)
    font = ImageFont.load_default()
    for index, path in enumerate(files):
        label = path.name.removeprefix(prefix).removesuffix(".jpg").removesuffix("-reload")
        x = (index % columns) * width
        y = (index // columns) * (height + heading)
        with Image.open(path) as source:
            thumb = ImageOps.contain(source.convert("RGB"), (width, height))
        sheet.paste(thumb, (x + (width - thumb.width) // 2, y))
        draw.rectangle((x, y + height, x + width - 1, y + height + heading - 1), fill="#182736")
        draw.text((x + 12, y + height + 9), label, font=font, fill="#eff6fa")
    output = folder / f"{prefix}{state}-skinned-contact.jpg"
    sheet.save(output, quality=86, optimize=True)
    return output


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("capture", help="Timestamp segment of a two-chrome-*.json report")
    args = parser.parse_args()
    folder = Path(__file__).resolve().parent.parent / "docs" / "benchmarks"
    for browser in ("host", "guest"):
        for state in ("idle", "reload"):
            output = build_sheet(folder, args.capture, browser, state)
            print(output if output else f"missing {browser} {state} captures")


if __name__ == "__main__":
    main()
