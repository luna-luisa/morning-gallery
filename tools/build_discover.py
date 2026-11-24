"""Builds the Swipe deck, run by GitHub (costs no Claude credits).

Collects well-known works by artists who don't have a topic in the app yet, from the
museums' own open collections (Art Institute of Chicago, The Met, Cleveland Museum of Art),
opens every picture to make sure it loads and is sharp enough, measures its shape,
and writes content/discover.json:
  {"built": "YYYY-MM-DD", "items": [{"id", "artist", "title", "year", "img", "hw", "link", "museum"}]}
At most two works per artist, a broad mix of periods, about half from 1880 onwards.
Small labelled contact sheets go to sheets/discover-NN.jpg so they can be looked over privately.
"""
import io, json, os, re, time, random, datetime, unicodedata, concurrent.futures as cf
import requests
from PIL import Image, ImageDraw

UA = {"User-Agent": "MorningGalleryDeck/1.0 (https://github.com/luna-luisa/morning-gallery)",
      "AIC-User-Agent": "MorningGalleryDeck (https://github.com/luna-luisa/morning-gallery)"}
TARGET, PER_ARTIST = 1400, 2
random.seed(int(datetime.date.today().strftime("%Y%W")))

def fold(s):
    s = unicodedata.normalize("NFKD", s or "").encode("ascii", "ignore").decode().lower()
    return re.sub(r"[^a-z ]", "", s).strip()

def clean_artist(a):
    a = re.sub(r"\s*\(.*?\)\s*", " ", a or "").strip()
    a = re.split(r"\s*[;|]\s*", a)[0]
    return re.sub(r"^(attributed to|workshop of|circle of|follower of|after)\s+", "", a, flags=re.I).strip()

# artists who already have a topic, or works, in the app: the deck is for discovering new ones
topics = json.load(open("content/topics.json"))
topics = topics.get("topics", topics)
known = {fold(t.get("name")) for t in topics.values() if t.get("kind") == "artist"}
works = json.load(open("content/works.json"))["works"]
known |= {fold(clean_artist(w.get("artist"))) for w in works if w.get("artist")}
known.discard("")
ANON = re.compile(r"unknown|anonymous|unidentified|^(the )?(master of|workshop)|culture|period|dynasty|school", re.I)

def get(url, **kw):
    for attempt in range(4):
        try:
            r = requests.get(url, headers=UA, timeout=40, **kw)
            if r.status_code == 429: time.sleep(4 * (attempt + 1)); continue
            if r.status_code == 200: return r
            return None
        except Exception:
            time.sleep(2)
    return None

cands = []
def add(museum, oid, artist, title, year, imgs, link):
    artist = clean_artist(artist)
    artist = artist.strip(" ,.")
    # a person, not a culture or region ("Netherlandish", "Ancient Etruscan"): at least two names
    if not artist or ANON.search(artist) or len(artist.split()) < 2 or re.match(r"(ancient|old|early|late)\b", artist, re.I): return
    if fold(artist) in known or not imgs: return
    try: year = int(year)
    except Exception: return
    cands.append({"id": f"d-{museum.lower()[:3]}-{oid}", "artist": artist, "title": (title or "Untitled").strip(),
                  "year": year, "imgs": imgs, "link": link, "museum": museum})

# ---- Art Institute of Chicago: works on view, public domain and modern
def aic():
    fields = ["id", "title", "artist_title", "date_end", "image_id", "artwork_type_title"]
    kinds = ["Painting", "Print", "Photograph", "Sculpture", "Drawing and Watercolor", "Textile"]
    for pd in (True, False):
        for frm in range(0, 4000, 100):
            body = {"query": {"bool": {"must": [{"term": {"is_on_view": True}}, {"term": {"is_public_domain": pd}},
                     {"exists": {"field": "image_id"}}, {"terms": {"artwork_type_title.keyword": kinds}}]}},
                    "fields": fields, "limit": 100, "from": frm}
            try:
                r = requests.post("https://api.artic.edu/api/v1/artworks/search", json=body, headers=UA, timeout=40)
                data = r.json().get("data", [])
            except Exception:
                break
            if not data: break
            for x in data:
                base = f"https://www.artic.edu/iiif/2/{x['image_id']}/full/"
                add("Art Institute of Chicago", x["id"], x.get("artist_title"), x.get("title"), x.get("date_end"),
                    [base + "843,/0/default.jpg", base + "!600,600/0/default.jpg"], f"https://www.artic.edu/artworks/{x['id']}")
            time.sleep(0.3)

# ---- The Met: highlights with open-access pictures
def met():
    r = get("https://collectionapi.metmuseum.org/public/collection/v1/search", params={"isHighlight": "true", "hasImages": "true", "q": "*"})
    ids = (r.json().get("objectIDs") or []) if r else []
    random.shuffle(ids)
    def one(i):
        o = get(f"https://collectionapi.metmuseum.org/public/collection/v1/objects/{i}")
        return o.json() if o else None
    with cf.ThreadPoolExecutor(4) as ex:
        for o in ex.map(one, ids[:1500]):
            if not o or not o.get("primaryImageSmall"): continue
            add("The Met", o["objectID"], o.get("artistDisplayName"), o.get("title"), o.get("objectEndDate"),
                [o["primaryImageSmall"]], o.get("objectURL"))

# ---- Cleveland Museum of Art: highlights, all periods
def cleveland():
    for skip in range(0, 4000, 1000):
        r = get("https://openaccess-api.clevelandart.org/api/artworks/", params={"has_image": 1, "highlight": 1, "limit": 1000, "skip": skip})
        data = r.json().get("data", []) if r else []
        if not data: break
        for x in data:
            web = ((x.get("images") or {}).get("web") or {}).get("url")
            cr = x.get("creators") or []
            add("Cleveland Museum of Art", x["id"], cr[0].get("description") if cr else None, x.get("title"),
                x.get("creation_date_latest"), [web] if web else [], x.get("url"))


# ---- Tate: contemporary art (artists born from 1925, works from 1955) whose pictures Tate shows on its own pages
def tate():
    import csv
    base = "https://raw.githubusercontent.com/tategallery/collection/master/"
    a = get(base + "artist_data.csv"); w = get(base + "artwork_data.csv")
    if not a or not w: print("tate: no data"); return
    born = {}
    for r in csv.DictReader(io.StringIO(a.content.decode("utf-8-sig"))):
        try: born[r["id"]] = int(r["yearOfBirth"])
        except Exception: pass
    skip = re.compile(r"print|etching|lithograph|intaglio|woodcut|aquatint|engraving|graphite|pencil|ink on paper|book|letterpress|offset", re.I)
    rows = []
    for r in csv.DictReader(io.StringIO(w.content.decode("utf-8-sig"))):
        try: yr = int(r["year"])
        except Exception: continue
        if born.get(r["artistId"], 0) < 1925 or yr < 1955 or not r["thumbnailUrl"] or skip.search(r["medium"] or ""): continue
        if r["artistRole"] != "artist": continue
        last, _, first = (r["artist"] or "").partition(", ")
        name = f"{first} {last}".strip()
        if fold(name) in known: continue
        rows.append((name, r, yr))
    random.shuffle(rows)
    per, chosen = {}, []
    for name, r, yr in rows:
        if per.get(fold(name), 0) >= PER_ARTIST: continue
        per[fold(name)] = per.get(fold(name), 0) + 1; chosen.append((name, r, yr))
        if len(chosen) >= 700: break
    def page(item):
        name, r, yr = item
        url = r["url"].replace("http://", "https://")
        p = get(url)
        if not p: return None
        m = re.search(r'<meta[^>]+property="og:image"[^>]+content="([^"]+)"', p.text) or re.search(r'content="([^"]+)"[^>]+property="og:image"', p.text)
        return (name, r, yr, url, m.group(1)) if m else None
    n = 0
    with cf.ThreadPoolExecutor(6) as ex:
        for res in ex.map(page, chosen):
            if not res: continue
            name, r, yr, url, img = res
            # Tate's page preview can be small; its larger copies sit beside it with a higher number (_10)
            bigger = re.sub(r"_(\d+)(\.jpg)$", r"_10\2", img)
            add("Tate", r["accession_number"], name, r["title"], yr, list(dict.fromkeys([bigger, img])), url); n += 1
            if n <= 3: print("tate sample picture:", img)
    print("tate:", len(chosen), "pages tried,", n, "with pictures")

for f in (aic, met, cleveland, tate):
    try: f()
    except Exception as e: print("source failed:", f.__name__, e)
print(len(cands), "candidates")

# at most two per artist, then a mix of periods: about half from 1880 on
random.shuffle(cands)
per, pool = {}, []
for c in cands:
    k = fold(c["artist"])
    if per.get(k, 0) >= PER_ARTIST: continue
    per[k] = per.get(k, 0) + 1; pool.append(c)
modern = [c for c in pool if c["year"] >= 1880]; older = [c for c in pool if c["year"] < 1880]
order = []
while modern or older:
    if modern: order.append(modern.pop())
    if older: order.append(older.pop())

small = []
def verify(c):
    for u in c["imgs"]:
        r = get(u)
        if not r: continue
        try:
            im = Image.open(io.BytesIO(r.content)); im.load()
        except Exception:
            continue
        if max(im.width, im.height) < 800 or min(im.width, im.height) < 450:  # sharp enough for a phone screen
            if c["museum"] == "Tate" and len(small) < 5: small.append((u, im.size))
            continue
        hw = im.height / im.width
        if not 0.55 <= hw <= 2.0: return None
        return c, u, round(hw, 3), im
    return None

items, thumbs = [], []
with cf.ThreadPoolExecutor(8) as ex:
    for res in ex.map(verify, order[:int(TARGET * 1.6)]):
        if not res or len(items) >= TARGET: continue
        c, u, hw, im = res
        items.append({"id": c["id"], "artist": c["artist"], "title": c["title"], "year": c["year"],
                      "img": u, "hw": hw, "link": c["link"], "museum": c["museum"]})
        t = im.convert("RGB"); t.thumbnail((240, 240)); thumbs.append((c["id"], c["artist"], t))

json.dump({"built": datetime.date.today().isoformat(), "items": items}, open("content/discover.json", "w"), ensure_ascii=False, indent=0)

os.makedirs("sheets", exist_ok=True)
for n in range(0, len(thumbs), 36):
    sheet = Image.new("RGB", (6 * 250, 6 * 270), "white"); d = ImageDraw.Draw(sheet)
    for k, (wid, artist, t) in enumerate(thumbs[n:n + 36]):
        x, y = (k % 6) * 250, (k // 6) * 270
        sheet.paste(t, (x + 5 + (240 - t.width) // 2, y + 5 + (240 - t.height) // 2))
        d.text((x + 5, y + 250), f"{wid[:20]} {artist[:18]}", fill="black")
    sheet.save(f"sheets/discover-{n // 36 + 1:02d}.jpg", quality=80)

print("too small (Tate samples):", small)
m = sum(1 for i in items if i["year"] >= 1880)
print(f"{len(items)} works by {len({fold(i['artist']) for i in items})} artists, {m} from 1880 on")
for mu in ("Art Institute of Chicago", "The Met", "Cleveland Museum of Art", "Tate"):
    print(" ", mu, sum(1 for i in items if i["museum"] == mu))
