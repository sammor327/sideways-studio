# Bake the Sideways Showdown head-to-head (HEAD2HEAD-PREPPED.psd, the CN vs
# World broadcast package) into the two pieces Sideways Studio draws live
# (2026-09-19, Sam: "use the background from this head to head ... on more
# graphics, and recreate this version of a head to head").
#
#   web/assets/backgrounds/showdown.webp
#       the ground: the smoke plate, both glowing arrow clusters and the faint
#       left wash (layers BG, ARROWLEFT, ARROWRIGHT, "Layer 4 copy"), with the
#       VS, the event logo, the cards and the text left out. Any graphic can
#       paint it: it is the look model's "arrows" background.
#   web/scenes/vscard/vs.webp
#       the VS glyph with its glow, cropped to the layer (841 x 690 at
#       539, 91), for the VS head-to-head.
#
# The PSD is a PREPPED file: its glows are baked into the pixel layers (no
# layer effects), so psd-tools composites it exactly. Checked against the
# designer's BG.jpg export: mean difference 0.6 of 255 outside the VS and
# logo boxes. The player names, the round and the tournament name stay live
# text; the cards come from each player's legend card.
#
# Run: py scripts/bake-showdown.py   (psd-tools 1.11, PIL)
from pathlib import Path
from psd_tools import PSDImage

PSD = Path(r"C:\Users\sammo\source\repos\sammor327\flipdeck\overlaysoftware\HEADTOHEAD\HEAD2HEAD-PREPPED.psd")
WEB = Path(__file__).resolve().parent.parent / "web"

GROUND = {"BG", "ARROWLEFT", "ARROWRIGHT", "Layer 4 copy"}


def main():
    psd = PSDImage.open(PSD)
    names = [layer.name for layer in psd]
    for want in GROUND | {"VS"}:
        if want not in names:
            raise SystemExit(f"layer {want!r} not in {PSD.name}: {names}")

    for layer in psd:
        layer.visible = layer.name in GROUND
    ground = psd.composite(force=True).convert("RGB")
    out = WEB / "assets" / "backgrounds" / "showdown.webp"
    out.parent.mkdir(parents=True, exist_ok=True)
    ground.save(out, "WEBP", quality=95, method=6)  # 95 keeps the smoke plate's grain
    print(out, ground.size, out.stat().st_size)

    vs = next(layer for layer in psd if layer.name == "VS")
    glyph = vs.topil().convert("RGBA")
    out = WEB / "scenes" / "vscard" / "vs.webp"
    out.parent.mkdir(parents=True, exist_ok=True)
    glyph.save(out, "WEBP", quality=92, alpha_quality=100, method=6)
    print(out, glyph.size, "at", vs.bbox[:2], out.stat().st_size)


if __name__ == "__main__":
    main()
