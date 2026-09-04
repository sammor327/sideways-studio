# Bake the POV overlay plates from the designer PSD (SPEC "PSD-to-scene
# pipeline"): the gold frame chrome becomes a WebP plate, everything
# data-bearing (card, legend and battlefield art, all five text lines) stays
# live HTML. The two art COVER gradients ship as their own alpha WebPs so
# they can sit between the live art and the plate.
# Run: py scripts/bake-pov.py   (psd-tools 1.11, PIL)
import sys
from pathlib import Path
from psd_tools import PSDImage

PSD = Path(r"C:\Users\sammo\source\repos\sammor327\flipdeck\overlaysoftware\OVERLAY-POV\POV-Overlay-1.psd")
OUT = Path(__file__).resolve().parent.parent / "web" / "scenes" / "pov"

# Only the frame chrome is baked. The three ART layers are placeholder purple
# fills and the CARDART layer holds a placeholder card: never bake those.
PLATE_LAYERS = {"LEFT-ART", "RIGHT-ART"}

# Cover gradients: navy, transparent at the top, ~95% at the bottom, so the
# name lines read over the art beneath them. Each keeps its own bbox size
# (the battlefield cover is inset 3px from its art slot).
COVERS = {
    "LEFT-LEGENDARTCOVER": "cover-legend-left.webp",
    "RIGHT-LEGENDARTCOVER": "cover-legend-right.webp",
    "LEFT-BATTLEFIELDARTCOVER": "cover-battlefield-left.webp",
    "RIGHT-BATTLEFIELDARTCOVER": "cover-battlefield-right.webp",
}


def find_layers(psd):
    found = {}
    stack = list(psd)
    while stack:
        layer = stack.pop()
        found[layer.name] = layer
        if layer.is_group():
            stack.extend(list(layer))
    return found


def main():
    psd = PSDImage.open(PSD)
    OUT.mkdir(parents=True, exist_ok=True)
    print("canvas:", psd.width, "x", psd.height)

    plate = psd.composite(
        layer_filter=lambda l: l.is_group() or (l.is_visible() and l.name in PLATE_LAYERS)
    )
    plate.save(OUT / "plate.webp", quality=95)

    layers = find_layers(psd)
    for name, filename in COVERS.items():
        layer = layers.get(name)
        if layer is None:
            print("MISSING cover layer:", name)
            continue
        img = layer.composite()
        img.save(OUT / filename, quality=95, lossless=True)
        print(f"{filename}: {img.size} bbox={layer.bbox} {(OUT / filename).stat().st_size // 1024}KB")

    # Full composite for the scene's ?debug=psd overlay. Gitignored: it is a
    # development check, not a shipped asset, and the scene hides it if the
    # file is absent.
    psd.composite().save(OUT / "_psd-reference.png")

    # The three art slots and the whole center must be transparent in the
    # plate: gameplay capture and the live art layers show through them.
    for label, (x, y) in {
        "card slot (150,600)": (150, 600),
        "legend slot (150,928)": (150, 928),
        "battlefield slot (150,1033)": (150, 1033),
        "center (960,540)": (960, 540),
        "name band (150,825)": (150, 825),
    }.items():
        print(label, "alpha:", plate.getpixel((x, y))[3])
    print("plate:", (OUT / "plate.webp").stat().st_size // 1024, "KB")


if __name__ == "__main__":
    sys.exit(main())
