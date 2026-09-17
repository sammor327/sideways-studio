# Bake the full legend cutouts: the large legend art tier.
#
# The hero tier (IGO-LEGENDS, 261x242 face crops) is sized for the IGO
# holders and the camera windows. The match card and the player profile draw
# a legend a thousand pixels across, where that crop turns to mush. The
# source for those is the high-resolution transparent figure art in FlipDeck
# (public/legends, up to 9379x11477 PNG, 700 MB for 49 legends), far too big
# to ship, so this writes one WebP per legend, trimmed to the figure and
# sized to cover the largest placement (1100x1080) at 1:1.
#
# Output names follow the hero tier's rule so server/legends.js matches both
# the same way: the champion's letters, upper case, plus a variant digit for
# champions with two legends in catalog order (MASTERYI1 = Wuju Bladesman,
# OGS-019; MASTERYI2 = Wuju Master, UNL-191).
#
# Like the hero art, the output lives outside this repo (the repo is public)
# and is embedded into the exe at build time (scripts/build-exe.mjs).
#
# Run: py scripts/bake-legend-full.py [--src DIR] [--out DIR]
import argparse
import re
import sys
from pathlib import Path
from PIL import Image

Image.MAX_IMAGE_PIXELS = None

FLIPDECK = Path(r"C:\Users\sammo\source\repos\sammor327\flipdeck")
SRC = FLIPDECK / "public" / "legends"
OUT = FLIPDECK / "overlaysoftware" / "RESOURCES" / "LEGENDS-FULL"

# The largest box a full cutout fills (the player profile's art column). The
# bake keeps enough pixels to cover it with no upscaling on either axis.
COVER_W, COVER_H = 1100, 1080
MAX_SIDE = 2400

# Source names that do not reduce to the catalog's champion key on their own.
# The "(2)" copy of Master Yi is the Unleashed legend (glowing blade held
# level, as on UNL-191); the plain file is the Proving Grounds one.
ALIASES = {
    "LILIA": "LILLIA1",
    "RENATA": "RENATAGLASC1",
    "MASTERYI (2)": "MASTERYI2",
}


def out_name(src_name):
    stem = Path(src_name).stem
    stem = re.sub(r"_Base_Riftbound_Final$", "", stem, flags=re.I)
    if stem.upper() in ALIASES:
        return ALIASES[stem.upper()]
    key = re.sub(r"[^A-Z]", "", stem.upper())
    return ALIASES.get(key, f"{key}1")


def bake(src, dest):
    im = Image.open(src).convert("RGBA")
    # Trim to the figure. Near-transparent fringe pixels do not count, or a
    # stray speck at a corner keeps the whole canvas.
    alpha = im.getchannel("A").point(lambda a: 255 if a > 8 else 0)
    box = alpha.getbbox()
    if box:
        im = im.crop(box)
    w, h = im.size
    scale = min(1.0, max(COVER_W / w, COVER_H / h), MAX_SIDE / max(w, h))
    if scale < 1.0:
        im = im.resize((round(w * scale), round(h * scale)), Image.LANCZOS)
    im.save(dest, "WEBP", quality=86, alpha_quality=90, method=6)
    return im.size


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--src", type=Path, default=SRC)
    ap.add_argument("--out", type=Path, default=OUT)
    args = ap.parse_args()
    args.out.mkdir(parents=True, exist_ok=True)
    seen = {}
    total = 0
    for src in sorted(args.src.glob("*.png")):
        name = out_name(src.name)
        if name in seen:
            sys.exit(f"{src.name} and {seen[name]} both bake to {name}.webp: add an alias")
        seen[name] = src.name
        dest = args.out / f"{name}.webp"
        size = bake(src, dest)
        kb = dest.stat().st_size // 1024
        total += kb
        print(f"{src.name:40} -> {dest.name:22} {size[0]}x{size[1]} {kb} KB")
    print(f"{len(seen)} legends, {total // 1024} MB in {args.out}")


if __name__ == "__main__":
    main()
