"""Build lobby thumbnails from screenshots of Crown / Strike's own live maps.

Run after the browser smoke captures. Use --modes duel squads to refresh only
the competitive cards. No third-party game artwork is used.
"""

import argparse
from pathlib import Path
import os
import tempfile

from PIL import Image, ImageEnhance, ImageOps


ROOT = Path(__file__).resolve().parent.parent
OUTPUT = ROOT / "client" / "public" / "menu"
# The Codex sandbox can redirect tempfile.gettempdir() to a private directory
# while Chrome's screenshot output is saved to the ordinary Windows Temp path.
SOURCE_DIRS = [
    ROOT / ".research",
    Path.home() / "AppData" / "Local" / "Temp",
    Path(os.environ.get("LOCALAPPDATA", "")) / "Temp",
    Path(tempfile.gettempdir()),
]

# Crop to the world view to keep gameplay HUD elements and weapon-selection
# overlays out of the small lobby tiles. Coordinates use the smoke suite's
# 1418 x 802 desktop screenshots.
MODES = {
    "duel": ("own-duel-foundry-gameplay.png", (130, 263, 1380, 782)),
    "squads": ("own-squads-gameplay.png", (150, 265, 1355, 793)),
    "boreas": ("arena-fps-surf-desktop.png", (355, 216, 1346, 641)),
    "utopia": ("arena-fps-utopia-desktop.png", (345, 178, 1350, 610)),
    "practice": ("arena-fps-practice-desktop.png", (410, 283, 1293, 684)),
}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--modes", nargs="+", choices=MODES, default=list(MODES))
    args = parser.parse_args()
    OUTPUT.mkdir(parents=True, exist_ok=True)
    for mode in args.modes:
        filename, region = MODES[mode]
        source = next((folder / filename for folder in SOURCE_DIRS if (folder / filename).is_file()), None)
        if source is None:
            raise FileNotFoundError(
                f"Missing {filename} in {SOURCE_DIRS}; generate screenshots with npm run smoke:menu"
            )
        with Image.open(source) as original:
            frame = original.convert("RGB").crop(region)
            thumbnail = ImageOps.fit(frame, (800, 350), method=Image.Resampling.LANCZOS)
            thumbnail = ImageEnhance.Contrast(thumbnail).enhance(1.12)
            thumbnail = ImageEnhance.Color(thumbnail).enhance(1.08)
            thumbnail = ImageEnhance.Sharpness(thumbnail).enhance(1.15)
            if mode == "duel":
                thumbnail = ImageEnhance.Brightness(thumbnail).enhance(1.16)
            output = OUTPUT / f"{mode}-gameplay.webp"
            thumbnail.save(output, "WEBP", quality=88, method=6)
            print(f"{mode}: {output.relative_to(ROOT)} ({output.stat().st_size} bytes)")


if __name__ == "__main__":
    main()
