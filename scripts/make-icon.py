# Build the Windows app icon for the packaged Sideways Studio.
# Drawn rather than borrowed: the mark is a card turned sideways (the brand's
# own idea) over the TES gradient, on the panel's dark ground. Rendered at 4x
# and downsampled so the small sizes stay clean.
# Run: py scripts/make-icon.py
import sys
from pathlib import Path
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "build" / "sideways-studio.ico"
SIZES = [256, 128, 64, 48, 32, 16]
# The same mark as the browser tab icon. It lives under web/ so the packaged
# build bundles it with the pages, and is committed so a source checkout has
# it without running this script.
FAVICON = ROOT / "web" / "assets" / "favicon.ico"
FAVICON_SIZES = [48, 32, 16]

INK = (12, 15, 18, 255)        # --tes-ink
BLUE = (17, 182, 251, 255)     # --tes-blue
GREEN = (27, 239, 25, 255)     # --tes-green


def lerp(a, b, t):
    return tuple(round(a[i] + (b[i] - a[i]) * t) for i in range(4))


def render(size):
    S = size * 4
    img = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)

    # Dark rounded ground.
    pad = S * 0.03
    d.rounded_rectangle([pad, pad, S - pad, S - pad], radius=S * 0.19, fill=INK)

    # The card, rotated a quarter turn: a rounded rect on its own layer so it
    # can be rotated with clean edges, filled with the brand gradient.
    cw, ch = int(S * 0.60), int(S * 0.42)
    card = Image.new("RGBA", (cw, ch), (0, 0, 0, 0))
    grad = Image.new("RGBA", (cw, ch))
    gd = ImageDraw.Draw(grad)
    for x in range(cw):
        gd.line([(x, 0), (x, ch)], fill=lerp(BLUE, GREEN, x / max(cw - 1, 1)))
    mask = Image.new("L", (cw, ch), 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, cw - 1, ch - 1], radius=int(ch * 0.16), fill=255)
    card.paste(grad, (0, 0), mask)

    # Knock a slot out of the card so it still reads as a card, not a blob.
    slot = Image.new("L", (cw, ch), 255)
    ImageDraw.Draw(slot).rounded_rectangle(
        [cw * 0.12, ch * 0.20, cw * 0.88, ch * 0.52], radius=int(ch * 0.08), fill=0)
    card.putalpha(Image.composite(card.getchannel("A"), Image.new("L", (cw, ch), 0), slot))

    card = card.rotate(-22, resample=Image.BICUBIC, expand=True)
    img.alpha_composite(card, ((S - card.width) // 2, (S - card.height) // 2))

    return img.resize((size, size), Image.LANCZOS)


def main():
    OUT.parent.mkdir(parents=True, exist_ok=True)
    frames = [render(s) for s in SIZES]
    frames[0].save(OUT, format="ICO", sizes=[(s, s) for s in SIZES])
    print("icon:", OUT, OUT.stat().st_size // 1024, "KB", SIZES)
    # A PNG preview so the mark can be eyeballed without opening the ico.
    render(256).save(OUT.with_suffix(".png"))
    fav = [render(s) for s in FAVICON_SIZES]
    fav[0].save(FAVICON, format="ICO", sizes=[(s, s) for s in FAVICON_SIZES])
    print("favicon:", FAVICON, FAVICON.stat().st_size // 1024, "KB", FAVICON_SIZES)


if __name__ == "__main__":
    sys.exit(main())
