"""Daily picture check, run by GitHub (costs no Claude credits).

Opens every picture in content/works.json and writes content/imagecheck.json:
  {"checked": "YYYY-MM-DD", "broken": {"<work id>": "<reason>"}, "hw": {"<work id>": <height/width>}}
It also makes contact sheets (pages of small labelled thumbnails), kept only on
the separate "picture-sheets" branch and replaced each run, so the pictures can
be looked at without a browser. They are never on main or the website.
"""
import io, json, os, time, datetime, concurrent.futures as cf
import requests
from PIL import Image, ImageDraw

UA = {"User-Agent": "MorningGalleryImageCheck/1.0 (https://github.com/luna-luisa/morning-gallery)"}
works = json.load(open("content/works.json"))["works"]

def check(w):
    u, err = w.get("img") or "", "unknown"
    if u and not u.startswith("http"):  # pictures kept on the app's own site
        u = "https://teal-alligator-442575.hostingersite.com/morning-gallery/" + u.lstrip("/")
    if not u.startswith("https://"):
        return w["id"], "no image address", None, None
    for attempt in range(3):
        try:
            r = requests.get(u, headers=UA, timeout=30)
            if r.status_code == 429:
                time.sleep(5 * (attempt + 1)); continue
            if r.status_code != 200:
                return w["id"], f"HTTP {r.status_code}", None, None
            ct = r.headers.get("content-type", "")
            try:  # some museums send pictures without saying so; what counts is whether it opens as a picture
                im = Image.open(io.BytesIO(r.content)); im.load()
            except Exception:
                return w["id"], f"not a picture ({ct or 'no type'})", None, None
            return w["id"], None, round(im.height / im.width, 3), im
        except Exception as e:
            err = str(e)[:80] or type(e).__name__; time.sleep(2)
    return w["id"], f"failed ({err})", None, None

broken, hw, thumbs = {}, {}, []
with cf.ThreadPoolExecutor(6) as ex:
    for wid, err, ratio, im in ex.map(check, works):
        if err:
            broken[wid] = err
        else:
            hw[wid] = ratio
            t = im.convert("RGB"); t.thumbnail((240, 240)); thumbs.append((wid, t))

json.dump({"checked": datetime.date.today().isoformat(), "broken": broken, "hw": hw},
          open("content/imagecheck.json", "w"), ensure_ascii=False, indent=1)

os.makedirs("sheets", exist_ok=True)
thumbs.sort()
for n in range(0, len(thumbs), 36):
    sheet = Image.new("RGB", (6 * 250, 6 * 270), "white"); d = ImageDraw.Draw(sheet)
    for k, (wid, t) in enumerate(thumbs[n:n + 36]):
        x, y = (k % 6) * 250, (k // 6) * 270
        sheet.paste(t, (x + 5 + (240 - t.width) // 2, y + 5 + (240 - t.height) // 2))
        d.text((x + 5, y + 250), wid[:38], fill="black")
    sheet.save(f"sheets/sheet-{n // 36 + 1:02d}.jpg", quality=80)

print(f"{len(works)} works, {len(broken)} broken")
for k, v in sorted(broken.items()):
    print(" ", k, v)
