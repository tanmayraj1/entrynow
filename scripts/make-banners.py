"""
Home-page banner artwork, composed from the licensed event photography.

The carousel draws its own title, subtitle and CTA over the left of each slide,
so a banner image must NOT carry baked-in copy — a finished poster with its own
date and price fights the live text on top of it and contradicts whatever the
banner actually links to. What these need to be is a *treated background*: brand
colour on the left where the copy sits, the photograph readable on the right.

Source photos are the Wikimedia Commons files already in public/images/events,
so the attribution at /legal/image-credits continues to cover them (D-026).

    python3 scripts/make-banners.py
"""
from PIL import Image, ImageEnhance, ImageFilter
import json, os

W, H = 1800, 600           # authoring size named in the admin CMS hint
NAVY = (14, 26, 56)
GRAD = [(0.00, (255, 122, 31)), (0.55, (242, 69, 78)), (1.00, (237, 44, 99))]

# The third number is scrim strength at the left edge. It is tuned per photo
# rather than shared: a bright daytime Garba shot needs far more help than a
# night concert to keep white copy legible, and a single value made the first
# banner's headline vanish into a pink saree.
BANNERS = [
    ("navratri", "garba-navratri-1.jpg", 0.92),
    ("diwali", "diwali-2.jpg", 0.74),
    ("concerts", "concerts-1.jpg", 0.80),
]


def lerp(a, b, t):
    return tuple(round(a[i] + (b[i] - a[i]) * t) for i in range(3))


def grad_at(t):
    t = max(0.0, min(1.0, t))
    for i in range(len(GRAD) - 1):
        p0, c0 = GRAD[i]
        p1, c1 = GRAD[i + 1]
        if p0 <= t <= p1:
            return lerp(c0, c1, (t - p0) / (p1 - p0))
    return GRAD[-1][1]


def cover(im, w, h):
    """Crop to fill, anchored slightly above centre — faces sit high in these."""
    sr, tr = im.width / im.height, w / h
    if sr > tr:
        nw = round(im.height * tr)
        x = (im.width - nw) // 2
        im = im.crop((x, 0, x + nw, im.height))
    else:
        nh = round(im.width / tr)
        y = round((im.height - nh) * 0.35)
        im = im.crop((0, y, im.width, y + nh))
    return im.resize((w, h), Image.LANCZOS)


def build(name, src, scrim_strength):
    photo = cover(Image.open(f"public/images/events/{src}").convert("RGB"), W, H)

    # A touch more contrast and saturation: these are documentary photographs
    # and the carousel is a promotional slot.
    photo = ImageEnhance.Color(photo).enhance(1.22)
    photo = ImageEnhance.Contrast(photo).enhance(1.10)

    out = photo.copy()
    px = out.load()

    # Left-to-right navy scrim so the carousel's own copy always has contrast,
    # plus a warm brand wash bled in from the right edge.
    for x in range(W):
        t = x / (W - 1)
        # Scrim: strong at the left, gone by ~82% across. The exponent below 1
        # holds it near full strength across the copy area instead of decaying
        # immediately, which is what the first pass got wrong.
        a = scrim_strength * max(0.0, 1 - (t / 0.86)) ** 0.62
        # Brand wash: absent until ~55%, strongest at the right edge.
        g = 0.30 * max(0.0, (t - 0.55) / 0.45) ** 1.5
        gc = grad_at(t)
        for y in range(H):
            r, gg, b = px[x, y]
            if a > 0:
                r = round(r + (NAVY[0] - r) * a)
                gg = round(gg + (NAVY[1] - gg) * a)
                b = round(b + (NAVY[2] - b) * a)
            if g > 0:
                r = round(r + (gc[0] - r) * g)
                gg = round(gg + (gc[1] - gg) * g)
                b = round(b + (gc[2] - b) * g)
            px[x, y] = (r, gg, b)

    # A soft vignette at the bottom, so the dot indicators keep their contrast.
    for y in range(H - 120, H):
        a = 0.42 * ((y - (H - 120)) / 120) ** 1.4
        for x in range(W):
            r, gg, b = px[x, y]
            px[x, y] = (round(r * (1 - a)), round(gg * (1 - a)), round(b * (1 - a)))

    path = f"public/images/banners/{name}.jpg"
    # Baseline, not progressive: the same constraint the share cards live under,
    # so a banner can be reused as a cover without breaking the OG renderer.
    out.save(path, "JPEG", quality=86, progressive=False, optimize=True)
    print(f"  {path}  {os.path.getsize(path)//1024}KB  (from {src})")
    return src


if __name__ == "__main__":
    print("banner artwork:")
    used = [build(n, s, a) for n, s, a in BANNERS]

    # Carry the credits across so /legal/image-credits still covers these.
    credits = json.load(open("public/images/events/credits.json"))
    rows = credits if isinstance(credits, list) else next(iter(credits.values()))
    by_file = {os.path.basename(r["file"]): r for r in rows}
    out = []
    for (name, src, _), _s in zip(BANNERS, used):
        r = dict(by_file[src])
        r["file"] = f"/images/banners/{name}.jpg"
        r["note"] = f"Cropped and colour-graded from {src} for the home banner."
        out.append(r)
    json.dump(out, open("public/images/banners/credits.json", "w"), indent=2)
    print(f"  wrote credits for {len(out)} banners")
