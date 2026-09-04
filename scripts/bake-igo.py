# Bake the IGO 1v1 plates from the designer PSD (SPEC "PSD-to-scene
# pipeline"): non-data chrome becomes a WebP plate, everything data-bearing
# (holder images, names, battlefields, ticks, logo) stays live HTML.
# Run: py scripts/bake-igo.py   (psd-tools 1.11, PIL)
import sys
from pathlib import Path
from PIL import ImageDraw
from psd_tools import PSDImage

PSD = Path(r"C:\Users\sammo\source\repos\sammor327\flipdeck\overlaysoftware\OVERLAY-1V1\IGO-V2-PREPPED.psd")
OUT = Path(__file__).resolve().parent.parent / "web" / "scenes" / "igo1v1"

# Chrome baked into the plate. Data-bearing layers (GREEN/BLUEIMAGE, type
# layers, tick ellipses, Center Logo) render live in the scene instead.
PLATE_LAYERS = {"BG", "ARROWS", "GAMEBORDER", "GREENHOLDER", "BLUEHOLDER"}

def main():
    psd = PSDImage.open(PSD)
    OUT.mkdir(parents=True, exist_ok=True)

    plate = psd.composite(
        layer_filter=lambda l: l.is_group() or (l.is_visible() and l.name in PLATE_LAYERS)
    )
    # Punch the holder image windows to transparent: webcam mode shows the
    # OBS source behind them; legend mode draws its own backdrop in HTML.
    # Rects are the GREEN/BLUEIMAGE layer bboxes (end-exclusive).
    alpha = plate.getchannel("A")
    d = ImageDraw.Draw(alpha)
    d.rectangle((1645, 17, 1905, 258), fill=0)
    d.rectangle((1645, 822, 1905, 1063), fill=0)
    plate.putalpha(alpha)
    plate.save(OUT / "plate.webp", quality=95)

    # Checks: the game window and both holder windows must be transparent in
    # the plate (webcam mode shows OBS sources through them).
    for label, (x, y) in {
        "game area (800,540)": (800, 540),
        "green holder (1775,138)": (1775, 138),
        "blue holder (1775,943)": (1775, 943),
        "sidebar (1780,540)": (1780, 540),
    }.items():
        print(label, "alpha:", plate.getpixel((x, y))[3])
    print("plate:", (OUT / "plate.webp").stat().st_size // 1024, "KB")

if __name__ == "__main__":
    sys.exit(main())
