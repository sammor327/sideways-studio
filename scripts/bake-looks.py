# Bake the overlay chrome into recolorable masks (the "looks" pipeline).
#
# The first bakes (bake-igo.py, bake-igo2v2.py, bake-pov.py) flattened each
# PSD's chrome into one WebP plate, so the designed green/blue and the POV's
# gold were fixed on air. This script splits the same layers by what colour
# they carry and writes one alpha mask per role:
#
#   ground      the dark grained sidebar (fill: the theme ground / background)
#   frame       the game-window border (fill: frame colour)
#   holder-a/b  the black holder bodies (fill: plate colour)
#   edge-a/b    the holder outlines and separator lines (fill: accent A / B)
#   shards      the arrow-shard art (fill: the accent gradient)
#   shards-shade / shards-glint
#               the shard art's own shading, kept as black and white overlays
#               so a flat fill still reads as the designed art
#   POV: trim (gold), trim-shade, trim-light, panel (navy), panel-shade, dark
#
# Every mask is a full 1920x1080 RGBA WebP whose alpha is the mask, so the
# scenes position them at inset: 0 and paint through them with CSS masks.
# Membership is soft (a pixel can be 70% shard, 30% glint) so class edges do
# not alias.
#
# Also written: a grain tile pair lifted from the 1v1 BG texture, and the
# arrow shards as a standalone pattern for the dual-column overlay.
#
# Run: py scripts/bake-looks.py   (psd-tools 1.11, PIL, numpy)
import sys
from pathlib import Path
import numpy as np
from PIL import Image
from psd_tools import PSDImage

OVERLAYS = Path(r"C:\Users\sammo\source\repos\sammor327\flipdeck\overlaysoftware")
WEB = Path(__file__).resolve().parent.parent / "web"
W, H = 1920, 1080


def rgba(img):
    return np.asarray(img.convert("RGBA")).astype(np.float32) / 255.0


def hsv(arr):
    r, g, b = arr[..., 0], arr[..., 1], arr[..., 2]
    v = arr[..., :3].max(axis=-1)
    mn = arr[..., :3].min(axis=-1)
    c = v - mn
    s = np.where(v > 0, c / np.maximum(v, 1e-6), 0)
    h = np.zeros_like(v)
    nz = c > 1e-6
    rr = np.where(nz & (v == r), ((g - b) / np.maximum(c, 1e-6)) % 6, 0)
    gg = np.where(nz & (v == g) & (v != r), ((b - r) / np.maximum(c, 1e-6)) + 2, 0)
    bb = np.where(nz & (v == b) & (v != r) & (v != g), ((r - g) / np.maximum(c, 1e-6)) + 4, 0)
    h = (rr + gg + bb) * 60.0
    return h, s, v


def clip01(x):
    return np.clip(x, 0.0, 1.0)


def smooth(x, lo, hi):
    """0 below lo, 1 above hi, linear between."""
    return clip01((x - lo) / max(hi - lo, 1e-6))


def classify(arr, hue_range=None, v_band=(0.12, 0.3), s_band=(0.18, 0.4)):
    """Soft class weights for one RGBA array.
    Returns dict of alpha-weighted masks: color, white, dark, plus the
    colour class's shade and light modulation (its own shading kept as
    black/white overlays over a flat fill). v_band and s_band are where a
    pixel starts and finishes counting as the colour class: a deep navy
    needs a lower brightness band than a bright shard."""
    a = arr[..., 3]
    h, s, v = hsv(arr)
    color = smooth(s, *s_band) * smooth(v, *v_band)
    if hue_range is not None:
        lo, hi = hue_range
        inband = (h >= lo) & (h <= hi)
        color = color * inband
    white = smooth(v, 0.72, 0.9) * smooth(0.4 - s, 0.0, 0.2) * (1 - color)
    dark = clip01(1.0 - color - white)
    # Shading of the colour class relative to its own typical brightness and
    # saturation, so a metallic gold or a blue-to-green shard keeps its folds
    # (darker than typical) and its glints (less saturated than typical,
    # which is how a highlight on a saturated colour reads; brightness alone
    # would call a pure bright cyan a highlight).
    weights = a * color
    if weights.sum() > 0:
        med = float(np.average(v, weights=weights))
        smed = float(np.average(s, weights=weights))
    else:
        med, smed = 0.5, 0.5
    shade = clip01((med - v) / max(med, 1e-6)) * color
    light = clip01((smed - s) / max(smed, 1e-6)) * color
    return {
        "color": a * color,
        "white": a * white,
        "dark": a * dark,
        "shade": a * shade,
        "light": a * light,
    }, med


def canvas():
    return np.zeros((H, W), dtype=np.float32)


def paste(dst, src, bbox):
    """Max-composite a mask array into the canvas at a layer bbox (clipped)."""
    x0, y0, x1, y1 = bbox
    sx0, sy0 = max(0, -x0), max(0, -y0)
    dx0, dy0 = max(0, x0), max(0, y0)
    dx1, dy1 = min(W, x1), min(H, y1)
    if dx1 <= dx0 or dy1 <= dy0:
        return
    sub = src[sy0:sy0 + (dy1 - dy0), sx0:sx0 + (dx1 - dx0)]
    dst[dy0:dy1, dx0:dx1] = np.maximum(dst[dy0:dy1, dx0:dx1], sub)


def punch(mask, rects):
    for (x0, y0, x1, y1) in rects:
        mask[y0:y1, x0:x1] = 0


def save_mask(mask, path, rgb=(255, 255, 255)):
    out = np.zeros((mask.shape[0], mask.shape[1], 4), dtype=np.uint8)
    out[..., 0], out[..., 1], out[..., 2] = rgb
    out[..., 3] = np.clip(mask * 255, 0, 255).astype(np.uint8)
    img = Image.fromarray(out, "RGBA")
    path.parent.mkdir(parents=True, exist_ok=True)
    img.save(path, lossless=True, quality=100)
    print(f"  {path.relative_to(WEB)}: {path.stat().st_size // 1024} KB, coverage {float((mask > 0.02).mean()) * 100:.1f}%")


def mean_rgb(arr, weight):
    w = weight * arr[..., 3]
    if w.sum() == 0:
        return (0, 0, 0)
    return tuple(int(round(float(np.average(arr[..., i], weights=w)) * 255)) for i in range(3))


def find_layers(psd):
    found = {}
    for layer in psd.descendants():
        found.setdefault(layer.name, []).append(layer)
    return found


def bake_igo1v1():
    print("IGO 1v1")
    psd = PSDImage.open(OVERLAYS / "OVERLAY-1V1" / "IGO-V2-PREPPED.psd")
    L = {k: v[0] for k, v in find_layers(psd).items()}
    out = WEB / "scenes" / "igo1v1"
    windows = [(1645, 17, 1906, 259), (1645, 822, 1906, 1064)]

    bg = rgba(L["BG"].composite())
    ground = canvas()
    paste(ground, bg[..., 3], L["BG"].bbox)
    punch(ground, windows)
    save_mask(ground, out / "m-ground.webp")

    border = rgba(L["GAMEBORDER"].composite())
    frame = canvas()
    paste(frame, border[..., 3], L["GAMEBORDER"].bbox)
    save_mask(frame, out / "m-frame.webp")
    print("  frame colour:", mean_rgb(border, np.ones(border.shape[:2])))

    for key, name in (("a", "GREENHOLDER"), ("b", "BLUEHOLDER")):
        arr = rgba(L[name].composite())
        cls, _ = classify(arr)
        body, edge = canvas(), canvas()
        paste(body, cls["dark"], L[name].bbox)
        paste(edge, cls["color"], L[name].bbox)
        punch(body, windows)
        punch(edge, windows)
        save_mask(body, out / f"m-holder-{key}.webp")
        save_mask(edge, out / f"m-edge-{key}.webp")
        print(f"  holder {key} body colour:", mean_rgb(arr, cls["dark"]))

    arrows = rgba(L["ARROWS"].composite())
    cls, med = classify(arrows)
    for role, key in (("shards", "color"), ("shards-shade", "shade"), ("shards-glint", "white")):
        m = canvas()
        paste(m, cls[key] if key != "white" else np.maximum(cls["white"], cls["light"]), L["ARROWS"].bbox)
        save_mask(m, out / f"m-{role}.webp", rgb=(0, 0, 0) if key == "shade" else (255, 255, 255))
    print(f"  shard median brightness {med:.2f}")

    # Standalone shard pattern (the layer's full extent, off-canvas part
    # included) for the dual-column overlay and any background that asks
    # for it.
    pat = WEB / "assets" / "patterns"
    save_mask(cls["color"], pat / "shards.webp")
    save_mask(cls["shade"], pat / "shards-shade.webp", rgb=(0, 0, 0))
    save_mask(np.maximum(cls["white"], cls["light"]), pat / "shards-glint.webp")

    # Grain tiles: fine per-pixel noise (the PSD's own grain is a coarse
    # clumped texture that reads as speckle at 1080p), split into a light
    # tile and a dark tile so no blend mode is needed. Seeded so a rebuild
    # is byte-stable.
    rng = np.random.default_rng(20260914)
    noise = rng.normal(0.0, 1.0, (256, 256)).astype(np.float32)
    light = clip01(noise * 0.16)
    dark = clip01(-noise * 0.16)
    tex = WEB / "assets" / "textures"
    save_mask(light, tex / "grain-light.png")
    save_mask(dark, tex / "grain-dark.png", rgb=(0, 0, 0))
    dev = noise * 0.16
    print(f"  grain deviation range {dev.min():.3f}..{dev.max():.3f}")


def bake_igo2v2():
    print("IGO 2v2")
    psd = PSDImage.open(OVERLAYS / "OVERLAY-2V2" / "IGO-2v2-V1-Prepped.psd")
    L = find_layers(psd)
    out = WEB / "scenes" / "igo2v2"
    windows = [(1530, 19, 1717, 192), (1723, 19, 1910, 192), (1530, 887, 1717, 1060), (1723, 887, 1910, 1060)]

    bg_layer = L["BG"][0]
    bg = rgba(bg_layer.composite())
    # The shards' black outer glow sits on the dark side of this band, so it
    # falls to the ground fill, as the design paints it.
    cls, med = classify(bg, v_band=(0.22, 0.42))
    # The ground is the whole BG silhouette, shards included: the shard
    # layers paint inside it, and a look with no shards gets the flat fill
    # where the art was rather than a hole.
    ground = canvas()
    paste(ground, bg[..., 3], bg_layer.bbox)
    punch(ground, windows)
    save_mask(ground, out / "m-ground.webp")
    for role, key in (("shards", "color"), ("shards-shade", "shade"), ("shards-glint", "white")):
        m = canvas()
        paste(m, cls[key] if key != "white" else np.maximum(cls["white"], cls["light"]), bg_layer.bbox)
        punch(m, windows)
        save_mask(m, out / f"m-{role}.webp", rgb=(0, 0, 0) if key == "shade" else (255, 255, 255))
    print(f"  shard median brightness {med:.2f}")

    # The two holder panels share a layer name; the top one is team A.
    rects = sorted(L["Rectangle 1"], key=lambda l: l.bbox[1])
    lines = sorted(L["Line 1"], key=lambda l: l.bbox[1])
    for key, rect, line in (("a", rects[0], lines[0]), ("b", rects[1], lines[1])):
        arr = rgba(rect.composite())
        c, _ = classify(arr)
        body, edge = canvas(), canvas()
        paste(body, c["dark"], rect.bbox)
        paste(edge, c["color"], rect.bbox)
        larr = rgba(line.composite())
        paste(edge, larr[..., 3], line.bbox)
        punch(body, windows)
        punch(edge, windows)
        save_mask(body, out / f"m-holder-{key}.webp")
        save_mask(edge, out / f"m-edge-{key}.webp")
        print(f"  holder {key} body colour:", mean_rgb(arr, c["dark"]))


def bake_pov():
    print("POV")
    psd = PSDImage.open(OVERLAYS / "OVERLAY-POV" / "POV-Overlay-1.psd")
    L = {k: v[0] for k, v in find_layers(psd).items()}
    out = WEB / "scenes" / "pov"
    masks = {k: canvas() for k in ("trim", "trim-shade", "trim-light", "panel", "panel-shade", "dark")}
    for name in ("LEFT-ART", "RIGHT-ART"):
        arr = rgba(L[name].composite())
        gold, gmed = classify(arr, hue_range=(15, 75))
        navy, nmed = classify(arr, hue_range=(180, 250), v_band=(0.05, 0.15), s_band=(0.3, 0.5))
        a = arr[..., 3]
        rest = clip01(a - gold["color"] - navy["color"])
        paste(masks["trim"], gold["color"], L[name].bbox)
        paste(masks["trim-shade"], gold["shade"], L[name].bbox)
        paste(masks["trim-light"], gold["light"], L[name].bbox)
        paste(masks["panel"], navy["color"], L[name].bbox)
        paste(masks["panel-shade"], navy["shade"], L[name].bbox)
        paste(masks["dark"], rest, L[name].bbox)
        print(f"  {name}: gold {mean_rgb(arr, gold['color'])} med {gmed:.2f}, navy {mean_rgb(arr, navy['color'])} med {nmed:.2f}")
    for k, m in masks.items():
        save_mask(m, out / f"m-{k}.webp", rgb=(0, 0, 0) if k.endswith("shade") else (255, 255, 255))


def main():
    bake_igo1v1()
    bake_igo2v2()
    bake_pov()


if __name__ == "__main__":
    sys.exit(main())
