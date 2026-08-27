"""
Recompress everything under public/images, in place.

    python3 scripts/optimize-images.py [--check]

Next already re-encodes on delivery — `/_next/image` serves AVIF or WebP sized
to the layout — so this is not about what a visitor downloads. It is about what
the repository carries and what the serverless bundle has to ship: a 1.7MB PNG
costs every clone, every build and every cold start, forever, to serve one
1200px slot.

Two rules, and they are not stylistic:

  * **Baseline JPEG, never progressive.** resvg cannot decode a progressive
    JPEG, so a progressive cover makes the Open Graph card fail mid-stream and
    the crawler gets nothing (see `isDecodable` in src/lib/og/card.tsx).
  * **Nothing wider than it is ever displayed.** Posters render at most 1024
    wide on a 2x screen; banners at most 1800.

`--check` reports without writing, which is what the audit calls.
"""
from PIL import Image
import os, sys, json

# Longest edge each kind is ever rendered at, times two for retina.
MAX_EDGE = {"posters": 1536, "banners": 1800, "events": 1600}
QUALITY = 82
# Per kind, because a full-bleed poster and a banner strip have no business
# sharing a budget. These are ceilings on the SOURCE file; what a visitor
# downloads is whatever /_next/image re-encodes it to, which is far smaller.
BUDGET_KB = {"posters": 400, "banners": 250, "events": 520}
DEFAULT_BUDGET_KB = 300

ROOT = "public/images"


def targets():
    for dirpath, _, files in os.walk(ROOT):
        for f in sorted(files):
            if f.lower().endswith((".jpg", ".jpeg", ".png")):
                yield os.path.join(dirpath, f)


def optimise(path, check=False):
    kind = os.path.basename(os.path.dirname(path))
    before = os.path.getsize(path)
    im = Image.open(path)
    was_progressive = im.info.get("progressive") or im.info.get("progression")

    limit = MAX_EDGE.get(kind, 1600)
    needs_resize = max(im.size) > limit
    if check:
        return before, before, needs_resize or bool(was_progressive)

    im = im.convert("RGB")
    if needs_resize:
        r = limit / max(im.size)
        im = im.resize((round(im.width * r), round(im.height * r)), Image.LANCZOS)

    out = os.path.splitext(path)[0] + ".jpg"
    im.save(out, "JPEG", quality=QUALITY, progressive=False, optimize=True)
    if out != path:
        os.remove(path)
    return before, os.path.getsize(out), needs_resize


if __name__ == "__main__":
    check = "--check" in sys.argv
    total_before = total_after = 0
    over = []
    for p in targets():
        b, a, resized = optimise(p, check)
        total_before += b
        total_after += a
        kb = a // 1024
        budget = BUDGET_KB.get(os.path.basename(os.path.dirname(p)), DEFAULT_BUDGET_KB)
        if kb > budget:
            over.append((p, kb, budget))
        if not check:
            note = " (resized)" if resized else ""
            print(f"  {p:<48} {b//1024:>5}KB -> {a//1024:>4}KB{note}")
    if check:
        print(json.dumps({"overBudget": over, "budgetKb": BUDGET_KB}))
    else:
        print(f"\n  total {total_before//1024}KB -> {total_after//1024}KB "
              f"({100 - round(100*total_after/total_before)}% smaller)")
        if over:
            print("\n  still over budget:")
            for p, kb, budget in over:
                print(f"    {p}  {kb}KB (budget {budget}KB)")
