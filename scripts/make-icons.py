"""
Raster brand icons, drawn from the same geometry as src/app/icon.svg.

    python3 scripts/make-icons.py

Run it after changing the mark. Writes:
    src/app/favicon.ico     16/32/48, simplified as it shrinks
    src/app/apple-icon.png  180x180, opaque navy tile for iOS
    src/lib/og/mark.png     the lockup mark embedded in every share card

There is no SVG rasteriser on this machine, so the shapes are re-drawn with
PIL rather than converted. The coordinates below are the logo's own 64x64
grid, so the two stay in step.

Supersampled 8x and downsampled with LANCZOS — the ticket's 6px corner radii
and 1.5px perforation dots alias badly at 32px otherwise.
"""
from PIL import Image, ImageDraw, ImageFont
import math

SS = 8
NAVY = (22, 38, 76, 255)
WHITE = (255, 255, 255, 255)
GRAD = [(0.00, (255, 122, 31)), (0.55, (242, 69, 78)), (1.00, (237, 44, 99))]
FONT = "src/lib/og/fonts/PlusJakartaSans-ExtraBold.ttf"


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


def gradient_image(w, h):
    """Bottom-left to top-right, matching the SVG's x1=0 y1=1 -> x2=1 y2=0."""
    img = Image.new("RGB", (w, h))
    px = img.load()
    for y in range(h):
        for x in range(w):
            # Project onto the diagonal.
            t = ((x / max(w - 1, 1)) + (1 - y / max(h - 1, 1))) / 2
            px[x, y] = grad_at(t)
    return img


def draw_mark(size, *, streaks=True, detail=True, tile=None, pad_ratio=0.0, on_dark=False):
    """
    `size` is the final square edge in px. Returns an RGBA image.

    `detail` off drops the perforation dots and the star — at 16px they are
    three grey pixels and a smudge, which reads as dirt rather than as a
    ticket. Dropping them is the whole point of a multi-size .ico.

    `on_dark` swaps the navy half for white and the counter-space for navy,
    exactly as `logo.tsx` does. Without it the navy half simply disappears
    against a dark card and the ticket loses one of its two halves.
    """
    body = WHITE if on_dark else NAVY
    counter = NAVY if on_dark else WHITE
    S = size * SS
    img = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)

    if tile is not None:
        r = int(S * 0.22)
        d.rounded_rectangle([0, 0, S - 1, S - 1], radius=r, fill=tile)

    # Fit the ticket (x 17.5..56.5, y 16.5..47.5 on the logo's 64 grid) into
    # the square, leaving room for the streaks when they are drawn.
    left = 5.5 if streaks else 17.5
    right = 56.5
    top, bottom = 16.5, 47.5
    inner = 1.0 - 2 * pad_ratio
    scale = (S * inner) / (right - left)
    ox = S * pad_ratio - left * scale
    oy = (S - (bottom - top) * scale) / 2 - top * scale

    def X(v):
        return ox + v * scale

    def Y(v):
        return oy + v * scale

    # --- gradient source, masked per shape --------------------------------
    grad = gradient_image(S, S).convert("RGBA")

    def paint_gradient(mask_draw_fn, opacity=1.0):
        mask = Image.new("L", (S, S), 0)
        mask_draw_fn(ImageDraw.Draw(mask))
        if opacity < 1.0:
            mask = mask.point(lambda v: int(v * opacity))
        img.paste(grad, (0, 0), mask)

    if streaks:
        for x, y, w, h, op in [
            (6.5, 41.5, 7, 3.6, 0.55),
            (5.5, 33.5, 13, 3.6, 0.80),
            (9.5, 25.5, 10, 3.6, 0.65),
        ]:
            paint_gradient(
                lambda md, x=x, y=y, w=w, h=h: md.rounded_rectangle(
                    [X(x), Y(y), X(x + w), Y(y + h)],
                    radius=(h / 2) * scale,
                    fill=255,
                ),
                op,
            )

    # --- left half: navy, rounded on the left only ------------------------
    r6 = 6 * scale
    d.rounded_rectangle([X(17.5), Y(16.5), X(34.7), Y(47.5)], radius=r6, fill=body)
    d.rectangle([X(28.0), Y(16.5), X(34.7), Y(47.5)], fill=body)

    # --- right half: gradient, rounded on the right only ------------------
    def right_half(md):
        md.rounded_rectangle([X(36.5), Y(16.5), X(56.5), Y(47.5)], radius=r6, fill=255)
        md.rectangle([X(36.5), Y(16.5), X(46.0), Y(47.5)], fill=255)

    paint_gradient(right_half)

    # --- the "e", set in the brand font and sheared into italic -----------
    #
    # The logo sets this glyph in italic, and the lean is a real brand detail:
    # it is what makes the letterform agree with the motion streaks. Plus
    # Jakarta Sans ships no italic cut here, so the upright glyph is sheared —
    # the same synthetic oblique a browser applies for `font-style: italic` on
    # a family with no true italic, which is exactly what logo.tsx gets.
    fs = int(26 * scale)
    font = ImageFont.truetype(FONT, fs)
    layer = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    ld = ImageDraw.Draw(layer)
    bbox = ld.textbbox((0, 0), "e", font=font)
    tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
    tx = X(26.1) - tw / 2 - bbox[0]
    ty = Y(34.5) - th / 2 - bbox[1]
    ld.text((tx, ty), "e", font=font, fill=counter)

    # AFFINE maps OUTPUT coords back to INPUT, so a negative y-coefficient on
    # x samples further left as you go down — which lands the glyph further
    # right at the top. `c` pins the baseline so the lean pivots there rather
    # than sliding the whole letter sideways.
    k = math.tan(math.radians(11))
    baseline = Y(41.0)
    layer = layer.transform(
        (S, S), Image.AFFINE, (1, -k, k * baseline, 0, 1, 0), resample=Image.BICUBIC
    )
    img.alpha_composite(layer)

    if detail:
        rr = 1.5 * scale
        for cy in (19.5, 24.5, 29.5, 34.5, 39.5, 44.5):
            d.ellipse([X(35.6) - rr, Y(cy) - rr, X(35.6) + rr, Y(cy) + rr], fill=counter)
        # Star stub.
        pts = []
        cx, cy, R, r = X(47.0), Y(31.6), 3.9 * scale, 1.7 * scale
        for i in range(10):
            ang = -math.pi / 2 + i * math.pi / 5
            rad = R if i % 2 == 0 else r
            pts.append((cx + rad * math.cos(ang), cy + rad * math.sin(ang)))
        d.polygon(pts, fill=counter)

    return img.resize((size, size), Image.LANCZOS)


# Favicon: three sizes, simplified as they shrink.
ico_layers = [
    draw_mark(16, streaks=False, detail=False),
    draw_mark(32, streaks=False, detail=True),
    draw_mark(48, streaks=True, detail=True),
]
ico_layers[2].save(
    "src/app/favicon.ico",
    format="ICO",
    sizes=[(16, 16), (32, 32), (48, 48)],
    append_images=ico_layers[:2],
)
print("wrote src/app/favicon.ico")

# Apple touch icon: opaque navy tile, iOS ignores transparency and rounds it.
apple = draw_mark(180, streaks=True, detail=True, tile=NAVY, pad_ratio=0.10, on_dark=True)
apple.convert("RGB").save("src/app/apple-icon.png", format="PNG")
print("wrote src/app/apple-icon.png")

# The lockup mark for the OG share card.
mark = draw_mark(160, streaks=True, detail=True, on_dark=True)
mark.save("src/lib/og/mark.png", format="PNG", optimize=True)
print("wrote src/lib/og/mark.png")
