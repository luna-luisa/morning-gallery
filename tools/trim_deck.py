"""Find paper margins, mounts and ruled frame lines around the Swipe deck's pictures,
and save a "zoom" and "focus" for each so the app can crop in on the art itself.

Runs in the daily picture check. Results are cached in content/trim.json by picture URL,
so only new pictures are downloaded.
"""
import io, json, os, sys
import requests
from PIL import Image, ImageOps

ROOT = os.path.join(os.path.dirname(__file__), "..")
DECK = os.path.join(ROOT, "content", "discover.json")
CACHE = os.path.join(ROOT, "content", "trim.json")
BOX = 1.25        # the app's picture boxes are about 4:5 (height / width)
MAXZ = 1.8


def bands(flags):
    """Runs of True as (start, end) pairs."""
    out, s = [], None
    for i, f in enumerate(flags + [False]):
        if f and s is None: s = i
        if not f and s is not None: out.append((s, i)); s = None
    return out


def edges(fr, n, thin):
    """First and last index of the art along one axis, skipping thin lines in the margin."""
    on = [f > 0.03 for f in fr]
    runs = bands(on)
    if not runs: return 0, n
    lo, hi = 0, len(runs) - 1
    for _ in range(3):   # plate mark, ruled line, mount edge
        if hi > lo and runs[lo][1] - runs[lo][0] <= thin: lo += 1
        if hi > lo and runs[hi][1] - runs[hi][0] <= thin: hi -= 1
    return runs[lo][0], runs[hi][1]


def measure(im):
    g = ImageOps.grayscale(im)
    g.thumbnail((240, 240))
    w, h = g.size
    px = g.load()
    ring = sorted([px[x, y] for x in range(w) for y in (0, 1, h - 2, h - 1)] +
                  [px[x, y] for y in range(h) for x in (0, 1, w - 2, w - 1)])
    bg = ring[len(ring) // 2]
    if ring[len(ring) // 10] < bg - 40 or ring[len(ring) * 9 // 10] > bg + 40:
        return None                      # busy edges: the art runs to the edge
    on = lambda v: abs(v - bg) > 30
    rows = [sum(on(px[x, y]) for x in range(w)) / w for y in range(h)]
    cols = [sum(on(px[x, y]) for y in range(h)) / h for x in range(w)]
    y0, y1 = edges(rows, h, max(2, h // 40))
    x0, x1 = edges(cols, w, max(2, w // 40))
    pad = 0.01
    bx0, bx1 = max(0, x0 / w - pad), min(1, x1 / w + pad)
    by0, by1 = max(0, y0 / h - pad), min(1, y1 / h + pad)
    hw = h / w
    # how much of the picture a 4:5 box shows before any zoom ("cover")
    visw, vish = (1, BOX / hw) if hw > BOX else (hw / BOX, 1)
    visw, vish = min(1, visw), min(1, vish)
    bw, bh = (bx1 - bx0) / visw, (by1 - by0) / vish
    z = min(MAXZ, 1 / max(bw, bh, 1 / MAXZ))
    if z < 1.05: return None
    cx, cy = (bx0 + bx1) / 2, (by0 + by1) / 2
    clamp = lambda v: round(min(70, max(30, v * 100)))
    return {"zoom": round(z, 2), "focus": f"{clamp(cx)}% {clamp(cy)}%"}


def main():
    deck = json.load(open(DECK))
    cache = json.load(open(CACHE)) if os.path.exists(CACHE) else {}
    s = requests.Session(); s.headers["User-Agent"] = "MorningGallery/1.0 (private quiz; picture check)"
    new = 0
    for w in deck["items"]:
        u = w["img"]
        if u not in cache:
            try:
                r = s.get(u, timeout=20); r.raise_for_status()
                cache[u] = measure(Image.open(io.BytesIO(r.content)).convert("RGB")) or 0
            except Exception as e:
                print("skip", w["id"], e, file=sys.stderr); continue
            new += 1
        t = cache.get(u)
        w.pop("zoom", None); w.pop("focus", None)
        if t: w.update(t)
    keep = {w["img"] for w in deck["items"]}
    cache = {k: v for k, v in cache.items() if k in keep}
    json.dump(cache, open(CACHE, "w"), separators=(",", ":"))
    json.dump(deck, open(DECK, "w"), ensure_ascii=False, indent=0)
    print(f"trim: {new} new, {sum(1 for w in deck['items'] if w.get('zoom'))} of {len(deck['items'])} cropped")


if __name__ == "__main__":
    main()
