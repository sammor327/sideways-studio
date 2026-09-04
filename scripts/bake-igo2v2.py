# Bake the IGO 2v2 plates from IGO-2v2-V1-Prepped.psd (SPEC "PSD-to-scene
# pipeline"): chrome to a WebP plate with all four player windows punched
# transparent; names, battlefields, team names, ticks, and the logo render
# live. Run: py scripts/bake-igo2v2.py
import sys
from pathlib import Path
from PIL import ImageDraw
from psd_tools import PSDImage

PSD = Path(r"C:\Users\sammo\source\repos\sammor327\flipdeck\overlaysoftware\OVERLAY-2V2\IGO-2v2-V1-Prepped.psd")
OUT = Path(__file__).resolve().parent.parent / "web" / "scenes" / "igo2v2"

# Chrome: background, the two team holder panels, the separator lines.
# Data-bearing (player images, type layers, tick marks, EVNET LOGO BAKED)
# renders live instead.
PLATE_LAYERS = {"BG", "Rectangle 1", "Line 1"}

# GREEN/BLUE PLAYERIMAGE1-4 bboxes (end-exclusive): punched so webcam mode
# shows OBS sources through; legend mode draws its own backdrop.
WINDOWS = [
    (1530, 19, 1717, 192),
    (1723, 19, 1910, 192),
    (1530, 887, 1717, 1060),
    (1723, 887, 1910, 1060),
]

def main():
    psd = PSDImage.open(PSD)
    OUT.mkdir(parents=True, exist_ok=True)

    plate = psd.composite(
        layer_filter=lambda l: l.is_group() or (l.is_visible() and l.name in PLATE_LAYERS)
    )
    alpha = plate.getchannel("A")
    d = ImageDraw.Draw(alpha)
    for rect in WINDOWS:
        d.rectangle(rect, fill=0)
    plate.putalpha(alpha)
    plate.save(OUT / "plate.webp", quality=95)

    for label, (x, y) in {
        "game area (800,540)": (800, 540),
        "window 1 (1600,100)": (1600, 100),
        "window 2 (1800,100)": (1800, 100),
        "window 3 (1600,970)": (1600, 970),
        "window 4 (1800,970)": (1800, 970),
        "sidebar (1750,540)": (1750, 540),
        "green panel edge (1522,150)": (1522, 150),
    }.items():
        print(label, "alpha:", plate.getpixel((x, y))[3])
    print("plate:", (OUT / "plate.webp").stat().st_size // 1024, "KB")

if __name__ == "__main__":
    sys.exit(main())
