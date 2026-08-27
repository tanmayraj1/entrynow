"""
Home-page banner artwork.

    python3 scripts/make-banners.py

The carousel writes its own eyebrow, headline and CTA over the LEFT of every
slide, so a banner is a treated background rather than a finished poster. Two
things follow, and both were learned by getting them wrong:

  * **The subject has to sit right.** A source with its dancers on the left puts
    them directly under the headline. `mirror` flips those, which for a
    symmetrical illustration costs nothing and clears the copy area entirely.
  * **Cover-crop, never fit-and-extend.** Fitting a 16:9 source to height and
    stretching its edge column to fill the rest leaves a smear down the left
    third that reads as a rendering fault. Cropping vertically loses the top of
    the string lights and costs nothing anyone notices.
  * **The scrim is as light as legibility allows.** An earlier pass darkened
    the left 86% at 0.92 strength, which made the copy perfectly readable and
    the artwork almost invisible. These sources are already dark where the text
    lands, so a much lighter wash is enough.

Sources live in assets/banner-sources (not served) so this stays reproducible.
Outputs are baseline JPEG — resvg cannot decode progressive, and a banner may
later be reused as a cover, which would silently break the share card.
"""
from PIL import Image
import os

W, H = 1800, 600
NAVY = (14, 26, 56)

BANNERS = [
    # name,        source,                                     mirror, scrim, anchor
    ("dandiya",    "assets/banner-sources/dandiya-purple.jpg",    True,  0.42, 0.42),
    ("garba-night","assets/banner-sources/garba-night-flat.jpg",  False, 0.46, 0.48),
    # A third, from the licensed Wikimedia photography, was tried and dropped.
    # A bright daytime photograph needs a scrim heavy enough to make white copy
    # legible, and that scrim is precisely what these banners exist without —
    # the whole point is that the artwork stays visible. Illustrations carry
    # their own dark ground; photographs do not.
]


def build(name, src, mirror, scrim, anchor):
    im = Image.open(src).convert("RGB")
    if mirror:
        im = im.transpose(Image.FLIP_LEFT_RIGHT)

    # Cover: scale so the source fills the frame, then crop the overflow. The
    # anchor decides which slice of the height survives — dancers' feet and
    # faces are not in the same place in every source.
    r = max(W / im.width, H / im.height)
    art = im.resize((round(im.width * r), round(im.height * r)), Image.LANCZOS)
    x = (art.width - W) // 2
    y = round((art.height - H) * anchor)
    canvas = art.crop((x, y, x + W, y + H))

    px = canvas.load()
    for x in range(W):
        t = x / (W - 1)
        a = scrim * max(0.0, 1 - (t / 0.62)) ** 0.85
        if a <= 0:
            continue
        for y in range(H):
            r_, g_, b_ = px[x, y]
            px[x, y] = (
                round(r_ + (NAVY[0] - r_) * a),
                round(g_ + (NAVY[1] - g_) * a),
                round(b_ + (NAVY[2] - b_) * a),
            )

    out = f"public/images/banners/{name}.jpg"
    canvas.save(out, "JPEG", quality=86, progressive=False, optimize=True)
    print(f"  {out:<40} {os.path.getsize(out)//1024:>4}KB")


if __name__ == "__main__":
    os.makedirs("public/images/banners", exist_ok=True)
    # The previous set is replaced, not added to.
    for f in os.listdir("public/images/banners"):
        if f.endswith(".jpg") and f[:-4] not in {b[0] for b in BANNERS}:
            os.remove(f"public/images/banners/{f}")
            print(f"  removed old banner {f}")
    print("banner artwork:")
    for args in BANNERS:
        build(*args)
