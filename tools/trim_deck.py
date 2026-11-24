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


def bands(flags):
    """Runs of True as (start, end) pairs."""
    out, s = [], None
    for i, f in enumerate(flags + [False]):
        if f and s is None: s = i
        if not f and s is not None: out.append((s, i)); s = None
    return out


def edges(fr, n):
    """First and last index of the art along one axis. Thin lines (plate marks, ruled borders)
    and sparse bands (pencil signatures, edition numbers) out in the margin are skipped."""
    runs = [(a, b, sum(fr[a:b]) / (b - a)) for a, b in bands([f > 0.02 for f in fr])]
    if not runs: return 0, n
    lo, hi = 0, len(runs) - 1
    fringe = lambda r: (r[1] - r[0]) <= max(2, n // 40) or ((r[1] - r[0]) <= n * 0.08 and r[2] < 0.2)
    for _ in range(4):
        if hi > lo and fringe(runs[lo]): lo += 1
        if hi > lo and fringe(runs[hi]): hi -= 1
    return runs[lo][0], runs[hi][1]


def measure(im):
    """The art's box as fractions of the picture [x0, y0, x1, y1], or None if there's nothing to crop."""
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
    y0, y1 = edges(rows, h)
    x0, x1 = edges(cols, w)
    p = 0.012   # a sliver of breathing room so the crop never touches the art
    c = [max(0, x0 / w - p), max(0, y0 / h - p), min(1, x1 / w + p), min(1, y1 / h + p)]
    cw, ch, hw = c[2] - c[0], c[3] - c[1], h / w
    if cw < 0.5 or ch < 0.5: return None   # found too little: do not guess
    # how much more it has to zoom than a plain 4:5 crop would
    if max(1 / cw, BOX / (ch * hw)) / max(1, BOX / hw) < 1.05: return None
    return [round(v, 3) for v in c]


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
        for k in ("zoom", "focus", "crop"): w.pop(k, None)
        if t: w["crop"] = t
    keep = {w["img"] for w in deck["items"]}
    cache = {k: v for k, v in cache.items() if k in keep}
    json.dump(cache, open(CACHE, "w"), separators=(",", ":"))
    json.dump(deck, open(DECK, "w"), ensure_ascii=False, indent=0)
    print(f"trim: {new} new, {sum(1 for w in deck['items'] if w.get('crop'))} of {len(deck['items'])} cropped")


if __name__ == "__main__":
    main()
