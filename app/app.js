/* Morning Gallery v3 */
"use strict";
const BUILD_AT = "14 Nov"; // shown as a small footnote on the Me page
const CFG = window.MG_CONFIG || {};
const LEVELS = ["Visitor", "Regular", "Enthusiast", "Connoisseur", "Curator"];
const GROUPS = [["start", "Start here"], ["now", "Art now"], ["next", "Next steps"], ["specialist", "Specialist"]];
const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const view = $("#view");
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`; };
const DAY = 86400000;
const COLORS = ["#1f3fd1","#f19cb8","#e8452c","#f2b53a","#1e7a5a","#7a4fd6","#0f8a8a","#1a1a1a"];
function onColor(c){ const n = parseInt(String(c || "#1a1a1a").slice(1), 16); return (0.299 * (n >> 16) + 0.587 * (n >> 8 & 255) + 0.114 * (n & 255)) > 150 ? "#1a1a1a" : "#fff"; }
function dotStyle(p){ return `background:${esc(p.color)};color:${onColor(p.color)}`; }
async function hashPin(id, pin){ const b = await crypto.subtle.digest("SHA-256", new TextEncoder().encode("mg:" + id + ":" + pin)); return [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, "0")).join(""); }
const an = w => /^[AEIOU]/.test(w) ? "an" : "a";

/* random helpers: Math.random for variety, seeded when a question is rebuilt from its key */
function hash(s){ let h = 2166136261; for (const c of s){ h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }
function rng(seed){ let a = typeof seed === "string" ? hash(seed) : seed; return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const shuffle = (a, r = Math.random) => { a = a.slice(); for (let i = a.length - 1; i > 0; i--){ const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const pick = (a, r = Math.random) => a[Math.floor(r() * a.length)];

/* ---------------- content ---------------- */
let WORKS = [], W = {}, TOPICS = {}, NEWS = null, ART = [], CLEARED = {}, VENUES = {};
const venue = t => VENUES[String(t || "").trim().toLowerCase()] || null;
/* questions anyone has flagged stay hidden for everyone until they're checked and listed in cleared.json */
let HIDDEN = new Set();
function computeHidden(){
  HIDDEN = new Set();
  Object.values(profiles).forEach(p => Object.entries((p && p.flags) || {}).forEach(([k, d]) => { if (!(CLEARED[k] && CLEARED[k] >= d)) HIDDEN.add(k); }));
  Object.keys(qcache).forEach(k => delete qcache[k]);
}
async function getJSON(name){
  if (CFG.CONTENT_URL){
    const base = CFG.CONTENT_URL.replace(/\/?$/, "/");
    try { const r = await fetch(base + name + "?t=" + Math.floor(Date.now() / 300000), {cache:"no-store"}); if (r.ok) return await r.json(); } catch(e){}
  }
  const r = await fetch("content/" + name + "?d=" + today()); return r.json();
}
async function loadContent(){
  const [w, t, n, c, pl] = await Promise.all([getJSON("works.json"), getJSON("topics.json"), getJSON("news.json").catch(() => null), getJSON("cleared.json").catch(() => null), getJSON("places.json").catch(() => null)]);
  WORKS = w.works; TOPICS = t.topics; NEWS = n; CLEARED = (c && c.cleared) || {};
  VENUES = {}; Object.entries((pl && pl.places) || {}).forEach(([k, v]) => [k, ...(v.aliases || [])].forEach(a => VENUES[a.toLowerCase()] = Object.assign({name: k}, v)));
  W = Object.fromEntries(WORKS.map(x => [x.id, x]));
  ART = WORKS.filter(x => !x.photo && x.artist && TOPICS[x.topic]);
}
const yearText = w => (w.approx ? "c." : "") + w.year;
const tName = id => (TOPICS[id] && TOPICS[id].name) || "";

/* ---------------- storage ---------------- */
const remote = !!(CFG.SUPABASE_URL && CFG.SUPABASE_ANON_KEY);
const local = {
  get(k){ try { return JSON.parse(localStorage.getItem("mg:" + k)); } catch(e){ return null; } },
  set(k, v){ try { localStorage.setItem("mg:" + k, JSON.stringify(v)); } catch(e){} }
};
async function sb(path, opts = {}){
  const key = CFG.SUPABASE_ANON_KEY;
  const r = await fetch(CFG.SUPABASE_URL.replace(/\/$/, "") + "/rest/v1/" + path, Object.assign({}, opts, {
    headers: Object.assign({apikey: key, "Content-Type": "application/json"}, key.startsWith("eyJ") ? {Authorization: "Bearer " + key} : {}, opts.headers || {})
  }));
  if (!r.ok) throw new Error("Supabase " + r.status);
  const txt = await r.text(); return txt ? JSON.parse(txt) : null;
}
const store = {
  online: remote,
  async listProfiles(){
    if (this.online){
      try { const rows = await sb("kv?select=id,data&id=like.profile:*"); const out = {}; rows.forEach(r => { if (r.data && r.data.name && !r.data.removed) out[r.id.slice(8)] = r.data; }); local.set("profiles", out); return out; }
      catch(e){ this.online = false; }
    }
    return local.get("profiles") || {};
  },
  async put(id, data){
    local.set(id, data);
    if (!this.online) return;
    try { await sb("kv", {method:"POST", headers:{Prefer:"resolution=merge-duplicates,return=minimal"}, body: JSON.stringify([{id, data, updated_at: new Date().toISOString()}])}); } catch(e){}
  },
  async get(id){
    if (this.online){ try { const rows = await sb("kv?select=data&id=eq." + encodeURIComponent(id)); if (rows.length){ local.set(id, rows[0].data); return rows[0].data; } return null; } catch(e){} }
    return local.get(id);
  },
  async feedback(row){
    if (!this.online) throw new Error("offline");
    await sb("feedback", {method:"POST", headers:{Prefer:"return=minimal"}, body: JSON.stringify([row])});
  }
};

let profiles = {}, pid = null, state = null;
let saveTimer = null, saving = false, again = false;
function save(){ clearTimeout(saveTimer); saveTimer = setTimeout(flush, 1500); }
async function flush(){
  if (!pid || !state) return;
  if (saving){ again = true; return; }
  saving = true; await store.put("progress:" + pid, JSON.parse(JSON.stringify(state))); saving = false;
  if (again){ again = false; flush(); }
}
document.addEventListener("visibilitychange", () => { if (document.hidden){ clearTimeout(saveTimer); flush(); } });
function fresh(old){
  const s = {v:3, topics:{}, srs:{}, seen:{}, today:null, asked:{}, seenNews:{}, stats:{answered:0, correct:0, rounds:0, learned:0, lastRound:null}};
  if (old && old.stats) Object.assign(s.stats, old.stats);
  return s;
}

/* ---------------- levels ---------------- */
function T(tid){ return state.topics[tid] || (state.topics[tid] = {lv:1, hits:{}, n:0, c:0, intro:false}); }
const lvlOf = tid => T(tid).lv;
function levelStatus(tid){
  const t = T(tid), L = t.lv, all = allQuestions(tid);
  const at = all.filter(q => q.level === L);
  const right = at.filter(q => t.hits[q.key]);
  const days = new Set(right.flatMap(q => t.hits[q.key]).filter(d => !t.since || d >= t.since));
  const need = at.length ? Math.min(at.length, Math.max(5, Math.min(8, Math.ceil(at.length * 0.7)))) : 0;
  const hasNext = L < 5 && all.some(q => q.level === L + 1);
  return {L, have: right.length, need, total: at.length, days: days.size, hasNext, ready: at.length > 0 && right.length >= need && days.size >= 2 && L < 5};
}
function maybeLevelUp(tid){
  const s = levelStatus(tid);
  if (!s.ready) return null;
  if (!s.hasNext){ if (!state.asked["cap:" + tid + s.L]){ state.asked["cap:" + tid + s.L] = today(); requestMore(tid, "level-cap", `Ready for ${LEVELS[s.L]} level in ${tName(tid)} but there are no questions yet`).catch(() => {}); } return null; }
  T(tid).lv = s.L + 1; T(tid).since = today(); save();
  return s.L + 1;
}
function dots(L, cls = ""){ return `<span class="dots ${cls}" role="img" aria-label="Level ${L} of 5, ${LEVELS[L-1]}">${[1,2,3,4,5].map(i => `<i class="${i <= L ? "on" : ""}"></i>`).join("")}</span>`; }
function nextText(tid){
  const s = levelStatus(tid);
  if (s.L >= 5) return "Top level reached.";
  if (!s.total) return `More ${LEVELS[s.L-1]} questions are on the way.`;
  if (s.have < s.need) return `${s.have} of ${s.need} right to become ${an(LEVELS[s.L])} ${LEVELS[s.L]}.`;
  if (s.days < 2) return `Come back another day to become ${an(LEVELS[s.L])} ${LEVELS[s.L]}.`;
  return `${LEVELS[s.L]} questions are on the way.`;
}

/* ---------------- spaced review ---------------- */
const BOX = [1, 3, 7, 21];
function srs(q, ok){
  const k = q.key, it = state.srs[k];
  if (!ok){ state.srs[k] = {box:0, due: Date.now() + DAY * 0.9, topic: q.topic}; return "This one will come back in a later round."; }
  if (it){ it.box++; if (it.box >= BOX.length){ delete state.srs[k]; state.stats.learned++; return "You've learned this one for good."; } it.due = Date.now() + BOX[it.box] * DAY; return `You'll see it again in ${BOX[it.box]} days.`; }
  return "";
}
const seenToday = k => (state.lastSeen || {})[k] === today();
const daysSince = d => d ? Math.round((Date.parse(today()) - Date.parse(d)) / 864e5) : 999;
/* questions you got right rest for 2 to 6 weeks (spread per question, so they don't all return at once) */
const restDays = k => { let h = 0; for (const ch of k) h = (h * 31 + ch.charCodeAt(0)) >>> 0; return 14 + h % 29; };
const restingRight = k => state.seen[k] === "right" && daysSince((state.lastSeen || {})[k]) < restDays(k);
const oldOne = k => state.seen[k] === "right" && !restingRight(k);
const due = () => Object.entries(state.srs).filter(([k, v]) => v.due <= Date.now() && !seenToday(k)).map(([k]) => k);

/* ---------------- questions ---------------- */
function nearArtists(w, n, r){
  const others = [...new Set(ART.map(a => a.artist))].filter(a => a !== w.artist && !/attributed/.test(a));
  const yr = a => (ART.find(x => x.artist === a) || {}).year || 1800;
  const pool = others.sort((a, b) => Math.abs(yr(a) - w.year) - Math.abs(yr(b) - w.year)).slice(0, 10);
  return shuffle(pool, r).slice(0, n);
}
function mc(o){ const opts = shuffle(o.options); return Object.assign({}, o, {type:"mc", options:opts, answer:opts.indexOf(o.options[0])}); }
const CONFUSE = [["romanticism","british18c"],["rococo","british18c"],["rococo","baroque"],["realism","impressionism"],["popart","modern-british"],["yba","modern-british"],["bloomsbury","modern-british"],["abstraction","cubism"],["abstraction","expressionism"],["expressionism","vienna-1900"],["surrealism","dada"],["renaissance","van-eyck"],["expressionism","postimpressionism"],["modern-british","expressionism"],["modern-british","abstraction"]];
const clash = (a, b) => a === b || CONFUSE.some(([x, y]) => (x === a && y === b) || (x === b && y === a));
const qName = t => t.as || "from " + t.name.replace(/:.*$/, "").replace(/^The /, "the ");
const BUILD = {
  Q(key){ const [, tid, i] = key.split(":"); const t = TOPICS[tid]; const x = t && t.questions[+i]; if (!x) return null;
    if (x.correct > 1){ const opts = shuffle(x.options); return {key, topic:tid, level:x.level, type:"mc", multi:true, prompt:x.q, options:opts, answers:x.options.slice(0, x.correct).map(o => opts.indexOf(o)), answer:opts.indexOf(x.options[0]), explain:x.explain, art:x.art}; }
    const aw = W[x.art], gives = aw && x.level >= 2 && x.options.some(o => o.toLowerCase().includes(aw.title.toLowerCase()));
    return mc({key, topic:tid, level:x.level, prompt:x.q, options:x.options, explain:x.explain, art: gives ? null : x.art, reveal: gives ? x.art : x.reveal}); },
  P(key){ // which of these is <topic>
    const [, tid, wid] = key.split(":"), t = TOPICS[tid], right = W[wid]; if (!t || !right) return null;
    const r = rng(key);
    const others = ART.filter(w => !clash(w.topic, tid) && !(t.kind === "artist" && w.artist === right.artist)).sort((a, b) => Math.abs(a.year - right.year) - Math.abs(b.year - right.year)).slice(0, 16);
    const chosen = shuffle(others, r).slice(0, 3), set = shuffle([right, ...chosen]);
    return {key, topic:tid, level:1, type:"pick", prompt:`Which of these is ${t.kind === "artist" ? "by *" + t.name.replace(/^.*: /, "") + "*" : "*" + qName(t) + "*"}?`, images:set.map(w => w.id), answer:set.indexOf(right), art:right.id, explain:right.hook, spare:others.filter(o => !chosen.includes(o)).map(w => w.id)};
  },
  I(key){ // which one isn't
    const [, tid, odd] = key.split(":"), t = TOPICS[tid], oddW = W[odd]; if (!t || !oddW) return null;
    const r = rng(key), pool = shuffle(ART.filter(w => w.topic === tid), r), mine = pool.slice(0, 3); if (mine.length < 3) return null;
    const set = shuffle([oddW, ...mine]);
    return {key, topic:tid, level:3, type:"pick", odd:true, prompt:`Which one is NOT ${t.kind === "artist" ? "by *" + t.name.replace(/^.*: /, "") + "*" : "*" + qName(t) + "*"}?`, images:set.map(w => w.id), answer:set.indexOf(oddW), art:oddW.id, explain:`The odd one out is ${oddW.artist}, ${oddW.title} (${yearText(oddW)}).`, spare:pool.slice(3).map(w => w.id)};
  },
  M(){ return null; }, // retired: "which movement is this?" gave itself away, because the topic name is always on screen
  A(key){ // which of these are <topic>: four pictures, two or three right
    const [, tid, n] = key.split(":"), t = TOPICS[tid]; if (!t) return null;
    const r = rng(key), mine = shuffle(ART.filter(w => w.topic === tid), r), k = r() < .5 ? 2 : 3; if (mine.length < k + 1) return null;
    const right = mine.slice(0, k), yr = right.reduce((s, w) => s + w.year, 0) / k;
    const others = ART.filter(w => !clash(w.topic, tid) && !(t.kind === "artist" && right.some(x => x.artist === w.artist))).sort((a, b) => Math.abs(a.year - yr) - Math.abs(b.year - yr)).slice(0, 16);
    const wrong = shuffle(others, r).slice(0, 4 - k), set = shuffle([...right, ...wrong], r);
    const what = t.kind === "artist" ? "by *" + t.name.replace(/^.*: /, "") + "*" : "*" + qName(t) + "*";
    const names = right.map(w => `${w.artist}'s ${w.title}`);
    return {key, topic:tid, level:2, type:"pick", multi:true, prompt:`Which of these are ${what}?`, images:set.map(w => w.id), answers:right.map(w => set.indexOf(w)), answer:set.indexOf(right[0]), art:right[0].id,
      explain:`The ${k === 2 ? "two" : "three"} that fit: ${names.slice(0, -1).join(", ")} and ${names[k - 1]}.`, spare:others.filter(o => !wrong.includes(o)).map(w => w.id), spareRight:mine.slice(k).map(w => w.id)};
  },
  W(key){
    const wid = key.split(":")[1], w = W[wid]; if (!w || !TOPICS[w.topic]) return null;
    return mc({key, topic:w.topic, level:3, prompt:"Who made this?", options:[w.artist, ...nearArtists(w, 3, rng(key))], art:w.id, explain:w.hook, needsArt:true});
  },
  H(key){
    const wid = key.split(":")[1], w = W[wid]; if (!w || !w.place || /Private|Destroyed/.test(w.place) || !TOPICS[w.topic]) return null;
    const places = [...new Set(WORKS.map(x => x.place).filter(p => p && p !== w.place && !/Private|Destroyed|^Tate, London$/.test(p) && (!venue(w.place) || venue(p)) && !(/Vatican/.test(p) && /Vatican/.test(w.place))))];
    return mc({key, topic:w.topic, level:3, prompt:"Where can you see this?", options:[w.place, ...shuffle(places, rng(key)).slice(0, 3)], art:w.id, explain:w.hook, needsArt:true, long:true});
  },
  T(key){
    const wid = key.split(":")[1], w = W[wid]; if (!w || !TOPICS[w.topic]) return null;
    const mine = ART.filter(x => x.topic === w.topic && x.title !== w.title); if (mine.length < 3) return null;
    return mc({key, topic:w.topic, level:4, prompt:"Which work is this?", options:[w.title, ...shuffle(mine, rng(key)).slice(0, 3).map(x => x.title)], art:w.id, explain:w.hook, needsArt:true, long:true});
  },
  O(key){
    const set = key.slice(2).split(","); if (!set.every(x => TOPICS[x])) return null;
    return {key, topic:set[0], level:2, type:"order", prompt:"Put these in order, oldest first.", topics:set, items: shuffle(set.map(x => ({label:TOPICS[x].name, sub:TOPICS[x].span, year:TOPICS[x].year, art:(ART.find(w => w.topic === x) || {}).id})))};
  },
  N(key){ const id = key.slice(2), it = newsItems().find(n => n.id === id); if (!it) return null; const a = it.answer || 0; return mc({key, topic:TOPICS[it.topic] ? it.topic : null, level:0, prompt:it.question, options:[it.options[a], ...it.options.filter((_, i) => i !== a)], explain:it.explain, source:it.source, reveal: it.reveal || (W[it.art] ? it.art : null), news:true, long:true}); }
};
function fromKey(k){ if (HIDDEN.has(k)) return null; try { const b = BUILD[k[0]]; return b ? b(k) : null; } catch(e){ return null; } }
const qcache = {};
function allQuestions(tid){
  if (qcache[tid]) return qcache[tid];
  const t = TOPICS[tid], keys = [];
  t.questions.forEach((_, i) => keys.push(`Q:${tid}:${i}`));
  const mine = ART.filter(w => w.topic === tid);
  mine.forEach(w => {
    if (t.kind === "movement" || t.kind === "artist") keys.push(`P:${tid}:${w.id}`);
    if (t.kind === "movement") keys.push(`W:${w.id}`);
    if (t.kind === "artist") keys.push(`T:${w.id}`);
    if (w.place && !/Tate|Private|Destroyed/.test(w.place)) keys.push(`H:${w.id}`);
  });
  if (mine.length >= 3 && (t.kind === "movement" || t.kind === "artist")){
    const r = rng("odd" + tid);
    shuffle(ART.filter(w => !clash(w.topic, tid)), r).slice(0, Math.min(6, mine.length)).forEach(o => keys.push(`I:${tid}:${o.id}`));
    for (let n = 0; n < Math.min(4, mine.length - 1); n++) keys.push(`A:${tid}:${n}`);
  }
  if (t.kind === "movement" && t.timeline){
    const tl = Object.keys(TOPICS).filter(k => TOPICS[k].kind === "movement" && TOPICS[k].timeline && k !== tid), r = rng("tl" + tid);
    for (let n = 0, made = 0; n < 60 && made < 2; n++){
      const set = [tid, ...shuffle(tl, r).slice(0, 3)], ys = set.map(x => TOPICS[x].year).sort((a, b) => a - b);
      if (ys.every((y, i) => !i || y - ys[i - 1] >= 10)){ keys.push("O:" + set.join(",")); made++; }
    }
  }
  return qcache[tid] = keys.map(fromKey).filter(Boolean);
}
const newsItems = () => (NEWS && Array.isArray(NEWS.items)) ? NEWS.items.filter(i => i && i.id && Array.isArray(i.options) && i.options.length > 1) : [];
const featured = () => ((NEWS && NEWS.featuredTopics) || []).filter(t => TOPICS[t]);

/* questions for a topic: mostly at your level, one look back, one stretch */
function topicSet(tid, n = 6, exclude = new Set()){
  const t = T(tid), L = t.lv, avail = allQuestions(tid).filter(q => !exclude.has(q.key));
  // new or missed questions first, plus at most one older one you got right a while ago
  const olds = shuffle(avail.filter(q => !seenToday(q.key) && oldOne(q.key)));
  const fresh = avail.filter(q => !seenToday(q.key) && !restingRight(q.key) && !oldOne(q.key)).concat(olds.slice(0, 1));
  const notToday = fresh.concat(olds.slice(1), avail.filter(q => !seenToday(q.key) && restingRight(q.key)));
  const all = fresh.length >= n ? fresh : notToday.length >= n ? notToday : avail; // fresh first; never today's again unless nothing else
  const score = q => (t.hits[q.key] ? 2 : state.seen[q.key] === "wrong" ? 0 : 1) + Math.random() * 0.9;
  const out = [];
  let cap = 2; // at most 2 of the same kind of question, so a round feels varied
  const take = (lv, k) => all.filter(q => q.level === lv && !out.some(o => o.key === q.key) && out.filter(o => o.key[0] === q.key[0]).length < cap).sort((a, b) => score(a) - score(b))
    .reduce((acc, q) => (acc.length < k && acc.filter(o => o.key[0] === q.key[0]).length + out.filter(o => o.key[0] === q.key[0]).length < cap ? acc.concat(q) : acc), []);
  if (L > 1 && n > 2) out.push(...take(L - 1, 1));
  out.push(...take(L, n - out.length - (n > 2 ? 1 : 0)));
  if (n > 2) out.push(...take(L + 1, 1).map(q => Object.assign({}, q, {stretch:true})));
  for (let lv = L; out.length < n && lv >= 1; lv--) out.push(...take(lv, n - out.length));
  for (let lv = L + 1; out.length < n && lv <= 5; lv++) out.push(...take(lv, n - out.length).map(q => Object.assign({}, q, {stretch:true})));
  cap = 99; // not enough variety: allow repeats of a kind
  for (let lv = L + 1; out.length < n && lv <= 5; lv++) out.push(...take(lv, n - out.length).map(q => Object.assign({}, q, {stretch:true})));
  return out.slice(0, n).sort((a, b) => a.level - b.level);
}

/* ---------------- topic of the day ---------------- */
function nextTopic(cur){
  const open = id => id !== cur && lvlOf(id) < 3;
  const nf = featured().filter(open), rel = cur ? TOPICS[cur].related.filter(r => TOPICS[r] && open(r)) : [];
  const start = Object.keys(TOPICS).filter(t => TOPICS[t].group === "start" && open(t));
  return rel.find(r => nf.includes(r)) || nf[0] || rel[0] || start[0] || Object.keys(TOPICS).filter(open)[0] || cur || Object.keys(TOPICS)[0];
}
function topicOfDay(){
  const d = today();
  if (state.today && state.today.date === d && TOPICS[state.today.topic]) return state.today;
  const prev = state.today && TOPICS[state.today.topic] ? state.today.topic : null;
  const stay = prev && state.today.startLv === lvlOf(prev); // stay until you've climbed a level
  const t = stay ? prev : nextTopic(prev);
  state.today = {date: d, topic: t, startLv: lvlOf(t)}; save();
  return state.today;
}

/* ---------------- images: check before showing, swap failures ---------------- */
const imgOK = {};
function loadImg(url){
  if (!url) return Promise.resolve(false);
  if (url in imgOK) return Promise.resolve(imgOK[url]);
  return imgOK[url + "#p"] || (imgOK[url + "#p"] = new Promise(res => {
    const i = new Image(); let done = false;
    const fin = ok => { if (done) return; done = true; imgOK[url] = ok; res(ok); };
    const tm = setTimeout(() => fin(false), 9000);
    i.onload = () => { clearTimeout(tm); fin(i.naturalWidth > 40); };
    i.onerror = () => { clearTimeout(tm); fin(false); };
    i.referrerPolicy = "no-referrer"; i.src = url;
  }));
}
async function prepare(q){
  if (!q || q.type === "divider") return q;
  if (q.type === "pick"){
    const imgs = q.images.slice(), spare = (q.spare || []).filter(id => !imgs.includes(id)), spareR = (q.spareRight || []).filter(id => !imgs.includes(id));
    const oks = await Promise.all(imgs.map(id => loadImg(W[id].img)));
    for (let i = 0; i < imgs.length; i++){
      if (oks[i]) continue;
      const isR = q.multi ? q.answers.includes(i) : i === q.answer;
      if (isR && !q.multi) return null;
      const from = isR ? spareR : spare;
      let rep = null; while (from.length && !rep){ const c = from.shift(); if (await loadImg(W[c].img)) rep = c; }
      if (!rep) return null; imgs[i] = rep;
    }
    if (q.multi && imgs.some((id, i) => id !== q.images[i])){ // a picture was swapped: keep the explanation in step
      const right = q.answers.map(i => W[imgs[i]]), names = right.map(w => `${w.artist}'s ${w.title}`);
      return Object.assign({}, q, {images: imgs, art: right[0].id, explain: `The ${right.length === 2 ? "two" : "three"} that fit: ${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}.`});
    }
    return Object.assign({}, q, {images: imgs});
  }
  if (q.type === "order"){ await Promise.all(q.items.map(it => it.art && W[it.art] ? loadImg(W[it.art].img) : true)); return q; }
  if (q.art && W[q.art] && !(await loadImg(W[q.art].img))) return q.needsArt ? null : Object.assign({}, q, {art:null});
  if (q.type === "mc" && q.options.every(venue)){
    const ok = await Promise.all(q.options.map(o => loadImg(venue(o).img)));
    if (ok.every(Boolean)) return Object.assign({}, q, {venues:true});
  }
  return q;
}
function prefetch(q){ if (!q) return; if (q.type === "pick") q.images.forEach(id => loadImg(W[id].img)); else if (q.art && W[q.art]) loadImg(W[q.art].img); }

/* ---------------- sessions ---------------- */
let S = null;
function buildRound(){
  const tid = topicOfDay().topic, q = [], used = new Set();
  topicSet(tid, 6).forEach(x => { q.push(Object.assign({}, x, {section:"topic"})); used.add(x.key); });
  // quick fire: 2 news (not about today's topic, if possible) + 2 from other topics (due reviews first)
  const news = newsItems().filter(n => !HIDDEN.has("N:" + n.id));
  const fresh = news.filter(n => !state.seenNews[n.id]), off = l => l.filter(n => n.topic !== tid);
  const pool = off(fresh).length >= 2 ? off(fresh) : fresh.length >= 2 ? fresh : off(news).length >= 2 ? off(news) : news;
  const quick = shuffle(pool).slice(0, 2).map(n => fromKey("N:" + n.id)).filter(Boolean).map(x => Object.assign(x, {section:"news"}));
  const other = shuffle(due()).map(fromKey).filter(x => x && !used.has(x.key) && x.topic !== tid && x.level).slice(0, 2).map(x => Object.assign(x, {section:"quick"}));
  other.forEach(e => used.add(e.key));
  const studied = Object.keys(state.topics).filter(t => t !== tid && TOPICS[t] && T(t).n > 0);
  const tp = studied.length ? studied : Object.keys(TOPICS).filter(t => TOPICS[t].group === "start" && t !== tid);
  for (let i = 0; i < 10 && other.length < 2; i++){ const c = topicSet(pick(tp), 1, used)[0]; if (c){ other.push(Object.assign({}, c, {section:"quick", stretch:false})); used.add(c.key); } }
  const rest = shuffle([...quick, ...other]);
  if (rest.length){ q.push({type:"divider", key:"divider", count: rest.length}); q.push(...rest); }
  return q;
}
function startRound(){
  const td = topicOfDay();
  const t = TOPICS[td.topic], fresh = !T(td.topic).intro;
  const round = buildRound(), nq = round.filter(x => x.section === "topic").length;
  const begin = () => { S = {mode:"round", q: round, i:0, score:0, results:[]}; next(0); };
  setTab("today"); scrollTo(0, 0); inRound(true);
  const w = W[(t.intro[0] || {}).art], dv = round.find(x => x.type === "divider"), quick = round.slice(round.indexOf(dv) + 1);
  const thumbs = quick.filter(x => !x.news).map(x => x.type === "pick" ? W[x.images[0]] && W[x.images[0]].img : x.art && W[x.art] ? W[x.art].img : null).filter(Boolean).slice(0, 3);
  view.innerHTML = `<div class="rooms">
      <div class="room r1"><div class="sign"><span class="n">1</span><span class="v">Today's topic</span></div>
        <div class="rbody">${w ? `<div class="roomimg" style="background-image:url('${esc(w.img)}')"></div>` : ""}
          <div class="rtext"><b>${esc(t.name)}</b><span class="muted">${fresh ? `A short introduction, then ${nq} questions.` : `${nq} questions, a little deeper each time.`}</span></div></div></div>
      ${dv ? `<div class="room r2"><div class="sign"><span class="n">2</span></div>
        <div class="rtext"><b>Quick <span class="serif">fire</span></b><span class="muted">${dv.count} on art news and other topics</span>
          <div class="thumbs">${thumbs.map(u => `<span style="background-image:url('${esc(u)}')"></span>`).join("")}<span class="news">News</span></div></div></div>` : ""}
    </div><div class="dock row"><button class="btn ghost" id="back">Back</button><button class="btn" id="go">Let's go</button></div>`;
  $("#back").onclick = () => go("today");
  $("#go").onclick = () => fresh ? showIntro(td.topic, () => { T(td.topic).intro = true; save(); begin(); }, "Start the questions") : begin();
}
function startTopic(tid){ T(tid).intro = true; S = {mode:"topic", topic:tid, q: topicSet(tid, 6).map(x => Object.assign({}, x, {section:"topic"})), i:0, score:0, results:[]}; next(0); }
function startEndless(){ S = {mode:"endless", q:[], i:0, score:0, results:[], used:new Set()}; next(0); }
function pushEndless(){
  const tid = topicOfDay().topic; let x = null;
  const d = due().filter(k => !S.used.has(k));
  if (d.length && Math.random() < .25){ x = fromKey(d[0]); if (x) x.section = "review"; }
  if (!x && S.q.length % 8 === 7){ const n = newsItems().filter(n => !S.used.has("N:" + n.id) && !state.seenNews[n.id] && !HIDDEN.has("N:" + n.id)); if (n.length){ x = fromKey("N:" + pick(n).id); if (x) x.section = "news"; } }
  for (let tries = 0; !x && tries < 10; tries++){ // never repeat what you've already answered today
    const t = tries === 0 && Math.random() < .55 ? tid : pick(Object.keys(TOPICS).filter(k => TOPICS[k].group !== "specialist" || T(k).n > 0));
    const c = topicSet(t, 3, S.used).find(q => !seenToday(q.key) && !restingRight(q.key)); if (c) x = Object.assign({}, c, {section: t === tid ? "topic" : "mixed", stretch: c.stretch && t === tid});
  }
  if (!x) x = Object.assign({}, topicSet(tid, 6)[0], {section:"topic"});
  S.used.add(x.key); S.q.push(x);
}
let loadingToken = 0;
async function next(delta){
  if (!S) return;
  S.i += delta;
  if (S.mode === "endless" && S.i >= S.q.length) pushEndless();
  if (S.i >= S.q.length) return finish();
  const tok = ++loadingToken, raw = S.q[S.i];
  const slow = setTimeout(() => { if (tok === loadingToken) view.innerHTML = `<p class="muted hang">Hanging the next picture…</p>`; }, 300);
  let q = await prepare(raw);
  for (let tries = 0; !q && raw.section !== "news" && tries < 4; tries++){
    const alt = topicSet(raw.topic || topicOfDay().topic, 6, new Set(S.q.map(x => x.key)))[tries];
    if (!alt) break; q = await prepare(Object.assign({}, alt, {section: raw.section}));
  }
  clearTimeout(slow);
  if (tok !== loadingToken || !S) return;
  if (!q){ S.q.splice(S.i, 1); return next(0); }
  S.q[S.i] = q; render(); prefetch(S.q[S.i + 1]);
}

/* ---------------- rendering ---------------- */
function setTab(t){ $$("nav.tabs button").forEach(b => b.classList.toggle("on", b.dataset.tab === t)); }
$$("nav.tabs button").forEach(b => b.onclick = () => { S = null; go(b.dataset.tab); });
function go(t, a){ inRound(false); setTab(t === "topic" ? "topics" : t); scrollTo(0, 0); view.ontouchstart = view.ontouchend = null; ({today:renderToday, topics:renderTopics, me:renderMe, topic:renderTopic})[t](a); }
function figure(w, cls = ""){ return w ? `<figure class="spot ${cls}" data-src="${esc(w.img)}"><img src="${esc(w.img)}" alt="${w.photo ? esc(w.title) : "The artwork for this question"}" referrerpolicy="no-referrer" onerror="this.closest('figure').classList.add('gone')"></figure>` : ""; }
function label(w){
  if (!w) return "";
  if (w.photo) return `<div class="label"><span>${esc(w.title)}</span></div>`;
  return `<div class="label"><b>${esc(w.artist)}</b><span><i>${esc(w.title)}</i>${w.year ? ", " + yearText(w) : ""}</span>${w.place ? `<span class="muted">${esc(w.place)}</span>` : ""}${w.credit ? `<span class="small muted">Image: ${w.page ? `<a href="${esc(w.page)}" target="_blank" rel="noopener">${esc(w.credit)}</a>` : esc(w.credit)}</span>` : ""}</div>`;
}
const SECTION = {topic: x => tName(x.topic), review: x => "Review · " + tName(x.topic), mixed: x => "Something different · " + tName(x.topic), quick: x => "Quick fire · " + tName(x.topic), news: () => (S && S.mode === "round" ? "Quick fire · " : "") + "In the news"};

function showIntro(tid, done, finishLabel){
  const t = TOPICS[tid], cards = t.intro; let i = 0; inRound(true);
  const draw = () => {
    const c = cards[i], w = W[c.art];
    view.innerHTML = `
      <div class="line"><i style="width:${(i + 1) / cards.length * 100}%"></i></div>
      <div class="qhead"><span class="eyebrow">${esc(t.name)} · introduction</span><button class="btn link" id="x">Close</button></div>
      <div class="introbody">${figure(w, "big")}${label(w)}
      <h2>${esc(c.title)}</h2><p class="lead">${esc(c.text)}</p></div>
      <div class="dock row"><button class="btn ghost" id="prev" ${i ? "" : "disabled"}>Previous</button><button class="btn" id="nxt">${i === cards.length - 1 ? finishLabel : "Next"}</button></div>`;
    wireHold(view);
    $("#x").onclick = () => go("today");
    $("#prev").onclick = () => { i--; draw(); };
    $("#nxt").onclick = () => { if (i < cards.length - 1){ i++; draw(); scrollTo(0, 0); } else done(); };
  };
  let sx = null;
  view.ontouchstart = e => { sx = e.touches[0].clientX; };
  view.ontouchend = e => { if (sx === null) return; const dx = e.changedTouches[0].clientX - sx; sx = null; if (Math.abs(dx) > 70){ if (dx < 0 && i < cards.length - 1){ i++; draw(); } else if (dx > 0 && i > 0){ i--; draw(); } } };
  setTab("today"); draw();
}

function closeSheet(){ const s = $("#sheet"); if (s) s.remove(); document.body.classList.remove("sheetopen"); view.style.paddingBottom = ""; }
/* the answer panel covers the bottom of the screen: nudge the page up so the question stays readable */
function keepPromptVisible(){
  const sh = $("#sheet .sheetin"), p = $("#view .order") || $(".prompt"); if (!sh || !p) return; // for sorting, keep the right order in view
  const top = sh.getBoundingClientRect().top, r = p.getBoundingClientRect();
  if (r.bottom <= top - 12) return;
  view.style.paddingBottom = (innerHeight - top + 40) + "px";
  scrollBy({top: Math.min(r.bottom - top + 16, Math.max(0, r.top - 16)), behavior: "smooth"});
}
/* make a question fit on one screen so Check never drops out of view: shrink the picture first, then the question text */
function fitScreen(){
  if (!document.body.classList.contains("inround")) return;
  const img = $("#view > .spot img"), pr = $("#view > .prompt"), over = () => document.documentElement.scrollHeight > innerHeight + 1;
  if (img) img.style.maxHeight = ""; if (pr) pr.style.fontSize = "";
  for (let h = 26; over() && img && h >= 12; h -= 2) img.style.maxHeight = h + "svh";
  for (let f = 28; over() && pr && f >= 21; f -= 1) pr.style.fontSize = f + "px";
}
function inRound(on){ document.body.classList.toggle("inround", on); if (!on){ closeSheet(); delete document.body.dataset.room; } }
function render(){
  view.ontouchstart = view.ontouchend = null; closeSheet(); inRound(true);
  const x = S.q[S.i];
  setTab(S.mode === "topic" ? "topics" : "today");
  document.body.dataset.room = x.type === "divider" || (x.section && x.section !== "topic") ? "2" : "1";
  const real = S.q.filter(y => y.type !== "divider"), pos = real.indexOf(x);
  const progress = (pos / Math.max(1, real.length)) * 100;
  if (x.type === "divider"){
    view.innerHTML = `<div class="line"><i style="width:${progress}%"></i></div>
      <div class="rooms one"><div class="room r2 tallroom"><div class="sign"><span class="n">2</span></div>
        <div class="rtext"><span class="eyebrow">Part 2</span><b class="big">Quick <span class="serif">fire</span></b><span class="muted">${x.count || 4} quick ones: this week's art news and a mix from other topics.</span></div></div></div>
      <div class="dock"><button class="btn" id="go">Go</button></div>`;
    $("#go").onclick = () => next(1); return;
  }
  const w = x.art && x.type !== "pick" ? W[x.art] : null;
  const L = x.topic && TOPICS[x.topic] && !x.news ? lvlOf(x.topic) : 0;
  const pics = x.type === "pick" || x.venues, hint = pics && (state.hints || 0) < 3;
  if (hint){ state.hints = (state.hints || 0) + 1; }
  view.innerHTML = `
    ${S.mode === "endless" ? `<div class="line"></div>` : `<div class="line"><i style="width:${progress}%"></i></div>`}
    <div class="qhead">
      <span class="eyebrow ${x.news ? "gold" : ""}">${esc(SECTION[x.section || "topic"](x))}${L ? ` ${dots(L)} <span class="lvword">${LEVELS[L-1]}</span>` : ""}</span>
      <button class="btn link" id="quit">Stop</button></div>
    ${w ? figure(w) : ""}
    <div class="prompt">${esc(x.prompt).replace(/\*(.+?)\*/g, '<span class="serif">$1</span>')}</div>
    ${x.multi ? `<p class="small muted hint">More than one is right. Pick all you think fit.</p>` : hint ? `<p class="small muted hint">Hold a picture to see it bigger.</p>` : ""}
    ${x.stretch && x.level ? `<div class="stretch"><span class="tag">Stretch</span><span>${an(LEVELS[x.level-1])} ${LEVELS[x.level-1]}-level question</span></div>` : ""}
    <div id="ans" class="ansarea ${w ? "" : "tall"}"></div>
    <div class="dock"><button class="btn" id="check" disabled>Check</button></div>
    ${S.mode === "endless" ? `<p class="small muted center tally">${S.score} right so far</p>` : ""}`;
  $("#quit").onclick = () => { S = null; go("today"); };
  if (x.type === "mc") renderMC(x); else if (x.type === "pick") renderPick(x); else renderOrder(x);
  wireHold(view);
  fitScreen(); const fi = $("#view > .spot img"); if (fi && !fi.complete) fi.addEventListener("load", fitScreen, {once: true});
}
const tileText = o => `<span class="tt${o.length > 22 ? " long" : ""}">${esc(o)}</span>`;
function renderMC(x){
  $("#ans").innerHTML = `<div class="tiles${x.venues ? "" : " text"}">${x.options.map((o, i) => x.venues
    ? `<button class="tile venue" data-i="${i}" data-src="${esc(venue(o).img)}"><span class="ph" style="background-image:url('${esc(venue(o).img)}')"></span>${tileText(o)}</button>`
    : `<button class="tile" data-i="${i}">${tileText(o)}</button>`).join("")}</div>`;
  choose(x, i => x.multi ? x.answers.includes(i) : i === x.answer);
}
function renderPick(x){
  $("#ans").innerHTML = `<div class="tiles">${x.images.map((id, i) => `<button class="tile pic" data-i="${i}" data-src="${esc(W[id].img)}" aria-label="Picture ${i + 1}"><span class="ph" style="background-image:url('${esc(W[id].img)}')"></span></button>`).join("")}</div>`;
  choose(x, i => x.multi ? x.answers.includes(i) : i === x.answer, true);
}
/* tap to select (tap again or another to change), then Check */
function choose(x, isRight, caps){
  const picked = new Set(), tiles = $$(".tile"), check = $("#check");
  tiles.forEach(b => b.addEventListener("click", () => {
    if (b.disabled) return;
    const i = +b.dataset.i;
    if (x.multi) picked.has(i) ? picked.delete(i) : picked.add(i);
    else { const had = picked.has(i); picked.clear(); if (!had) picked.add(i); }
    tiles.forEach(t => { const on = picked.has(+t.dataset.i); t.classList.toggle("sel", on); t.setAttribute("aria-pressed", String(on)); });
    check.disabled = !picked.size;
  }));
  check.onclick = () => {
    const right = tiles.map(t => +t.dataset.i).filter(isRight), found = [...picked].filter(i => right.includes(i)).length;
    const ok = found === right.length && picked.size === right.length;
    tiles.forEach(t => { const i = +t.dataset.i; t.disabled = true; t.classList.remove("sel");
      if (right.includes(i)) t.classList.add(picked.has(i) || !x.multi ? "right" : "missed"); else if (picked.has(i)) t.classList.add("wrong"); else t.classList.add("dim");
      if (caps){ const w = W[x.images[i]]; t.insertAdjacentHTML("beforeend", `<span class="cap">${esc(w.artist)}, ${yearText(w)}</span>`); } });
    $(".dock").classList.add("gone");
    if (x.multi) x.tally = `You found ${found} of ${right.length}${picked.size > found ? `, plus ${picked.size - found} that ${picked.size - found === 1 ? "isn't" : "aren't"} right` : ""}.`;
    answered(x, ok);
  };
}
/* drag the rows into order (oldest at the top), then Check; years only appear once checked */
function renderOrder(x){
  $("#ans").innerHTML = `<p class="small muted">Drag them into order, oldest at the top.</p><div class="order">${x.items.map((it, i) => `<div class="oitem" data-i="${i}" role="listitem"><span class="n"></span>${it.art && W[it.art] && imgOK[W[it.art].img] ? `<img class="mini" src="${esc(W[it.art].img)}" alt="" referrerpolicy="no-referrer" draggable="false">` : ""}<span class="ol"><span>${esc(it.label)}</span><span class="small muted sub hidden">${esc(it.sub || "")}</span></span><span class="grip" aria-hidden="true"><i></i><i></i><i></i></span></div>`).join("")}</div>`;
  const list = $(".order"), check = $("#check"), rows = () => $$(".oitem");
  let moved = false, done = false;
  const paint = () => rows().forEach((b, k) => { b.classList.toggle("placed", moved); b.querySelector(".n").textContent = moved ? k + 1 : ""; });
  const gap = () => parseFloat(getComputedStyle(list).rowGap) || 10;
  /* slide a row that just swapped places, so the list feels physical */
  const slide = (el, from) => { const d = from - el.getBoundingClientRect().top; if (!d) return; el.style.transition = "none"; el.style.transform = `translateY(${d}px)`; requestAnimationFrame(() => { el.style.transition = "transform .16s ease"; el.style.transform = ""; }); };
  rows().forEach(b => b.addEventListener("pointerdown", e => {
    if (done || (e.pointerType === "mouse" && e.button !== 0)) return;
    e.preventDefault();
    try { b.setPointerCapture(e.pointerId); } catch(err){}
    let y0 = e.clientY, started = false;
    const move = ev => {
      let dy = ev.clientY - y0;
      if (!started){ if (Math.abs(dy) < 4) return; started = true; b.classList.add("drag"); if (!moved){ moved = true; check.disabled = false; } }
      for (;;){
        const nx = b.nextElementSibling, pv = b.previousElementSibling;
        if (nx && dy > (nx.offsetHeight + gap()) / 2){ const t = nx.getBoundingClientRect().top; list.insertBefore(nx, b); y0 += nx.offsetHeight + gap(); dy = ev.clientY - y0; slide(nx, t); }
        else if (pv && dy < -(pv.offsetHeight + gap()) / 2){ const t = pv.getBoundingClientRect().top; list.insertBefore(b, pv); y0 -= pv.offsetHeight + gap(); dy = ev.clientY - y0; slide(pv, t); }
        else break;
      }
      b.style.transition = "none"; b.style.transform = `translateY(${dy}px)`;
      paint();
    };
    const up = () => {
      b.removeEventListener("pointermove", move); b.removeEventListener("pointerup", up); b.removeEventListener("pointercancel", up);
      b.classList.remove("drag"); b.style.transition = "transform .16s ease"; b.style.transform = "";
      paint();
    };
    b.addEventListener("pointermove", move); b.addEventListener("pointerup", up); b.addEventListener("pointercancel", up);
  }));
  check.onclick = () => {
    if (done) return; done = true;
    const now = rows(), order = now.map(b => +b.dataset.i);
    const sorted = x.items.map((_, j) => j).sort((a, b) => x.items[a].year - x.items[b].year);
    const ys = order.map(j => x.items[j].year), ok = ys.every((y, k) => !k || y >= ys[k - 1]);
    moved = true; paint();
    now.forEach((b, k) => { const j = +b.dataset.i; b.classList.add("locked", x.items[sorted[k]].year === x.items[j].year ? "right" : "wrong"); b.querySelector(".sub").classList.remove("hidden"); });
    if (!ok){ const tops = new Map(now.map(b => [b, b.getBoundingClientRect().top])); sorted.forEach(j => list.appendChild(now.find(b => +b.dataset.i === j))); rows().forEach((b, k) => { b.querySelector(".n").textContent = k + 1; slide(b, tops.get(b)); }); }
    $(".dock").classList.add("gone");
    answered(x, ok);
  };
}
function answered(x, ok){
  state.seen[x.key] = ok ? "right" : "wrong"; (state.lastSeen = state.lastSeen || {})[x.key] = today();
  let up = null;
  if (x.topic && TOPICS[x.topic] && !x.news){
    const t = T(x.topic), d = today(); t.n++;
    if (ok){ t.c++; t.hits[x.key] = [...new Set([...(t.hits[x.key] || []), d])].slice(-5); }
    up = maybeLevelUp(x.topic);
  }
  const note = x.news ? "" : srs(x, ok);
  if (x.news) state.seenNews[x.key.slice(2)] = true;
  state.stats.answered++; if (ok) state.stats.correct++;
  S.score += ok ? 1 : 0; S.results.push({ok, topic:x.topic, up});
  save();
  const rw = x.reveal ? (typeof x.reveal === "string" ? W[x.reveal] : x.reveal) : x.type === "pick" && x.multi ? null : x.type === "pick" ? W[x.art] : x.venues && !ok ? {img: venue(x.options[x.answer]).img, photo: true, title: x.options[x.answer]} : null;
  const w = x.art && x.type !== "pick" ? W[x.art] : null, fact = x.explain || (w && w.hook) || (rw && rw.hook) || "";
  const last = S.mode !== "endless" && S.i === S.q.length - 1;
  closeSheet();
  const sh = document.createElement("div"); sh.id = "sheet"; sh.className = "sheet " + (ok ? "good" : "bad"); sh.setAttribute("role", "dialog"); sh.setAttribute("aria-label", "Result");
  sh.innerHTML = `<div class="sheetin"><button class="grab" id="grab" aria-label="Show or hide the explanation"><i></i></button>
      <div class="vrow"><span class="verdict">${ok ? pick(["Spot on.", "Yes.", "Exactly.", "Nicely seen."]) : x.type === "order" ? "Not quite. Here's the right order." : x.multi ? "Not quite." : "Not this time."}</span>${store.online ? `<button class="flag" id="flag" aria-label="Report this question"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 21V4m0 0h11l-2 4 2 4H5"/></svg></button>` : ""}</div>
      <div class="sheetbody">
      <div class="flagbox hidden" id="flagbox"></div>
      ${x.multi && !ok ? `<span class="small">${esc(x.tally || "")} The right ones are marked in green.</span>` : ""}
      ${!ok && x.type === "mc" && !x.multi ? `<p class="answerline">The answer: <b>${esc(x.options[x.answer])}</b></p>` : ""}
      ${x.type === "pick" && x.multi ? `<div class="minis">${x.images.map((id, i) => { const t = $$(".tile")[i], c = t ? ["right","wrong","missed","dim"].find(k => t.classList.contains(k)) || "" : ""; return `<span class="mini ${c}" data-src="${esc(W[id].img)}" style="background-image:url('${esc(W[id].img)}')"><i>${x.answers.includes(i) ? "✓" : ""}</i></span>`; }).join("")}</div>` : ""}
      ${rw && rw.img ? `<div class="reveal"><span class="rimg" data-src="${esc(rw.img)}"><img src="${esc(rw.img)}" alt="" referrerpolicy="no-referrer"></span>${label(rw)}</div>` : ""}${w && w !== rw ? label(w) : ""}
      ${fact || x.source ? `<p>${esc(fact)}${x.source ? ` <a class="story" href="${esc(x.source)}" target="_blank" rel="noopener">Read the story</a>` : ""}</p>` : ""}
      ${up ? `<div class="levelup">${dots(up)}<span>You're now ${an(LEVELS[up-1])} <b>${LEVELS[up-1]}</b> in ${esc(tName(x.topic))}.</span></div>` : ""}
      ${note ? `<span class="small muted">${note}</span>` : ""}
      ${fact && store.online ? `<button class="btn link more" id="more" ${state.asked[x.key] ? "disabled" : ""}>${state.asked[x.key] ? "Got it, more on this in future rounds" : "Ask me more about this in future rounds"}</button>` : ""}
      </div>
      <button class="btn" id="next">${last ? "See results" : "Next"}</button></div>`;
  document.body.appendChild(sh); document.body.classList.add("sheetopen");
  requestAnimationFrame(() => sh.classList.add("up"));
  setTimeout(keepPromptVisible, 320);
  $("#grab").onclick = () => sh.classList.toggle("min");
  wireHold(sh);
  if ($("#flag")) wireFlag(x);
  if ($("#more") && !state.asked[x.key]) $("#more").onclick = async () => {
    const b = $("#more"); b.disabled = true; b.textContent = "Sending…";
    try { await requestMore(x.topic, "more", fact, x.key); state.asked[x.key] = today(); save(); b.textContent = "Got it, more on this in future rounds"; }
    catch(e){ b.disabled = false; b.textContent = "Couldn't send. Tap to try again."; }
  };
  $("#next").onclick = () => { closeSheet(); scrollTo(0, 0); next(1); };
}
/* ---------------- hold a picture to see it bigger; let go to close ---------------- */
let peekEl = null;
function peek(src){ unpeek(); peekEl = document.createElement("div"); peekEl.className = "zoom"; peekEl.innerHTML = `<span class="zimg" style="background-image:url('${esc(src)}')"></span>`; peekEl.onclick = unpeek; document.body.appendChild(peekEl); }
function unpeek(){ if (peekEl){ peekEl.remove(); peekEl = null; } }
addEventListener("pointerup", () => setTimeout(unpeek, 30)); addEventListener("pointercancel", unpeek); addEventListener("scroll", unpeek, {passive:true});
function wireHold(root){
  root.querySelectorAll("[data-src]").forEach(el => {
    let t = null, held = false, x0 = 0, y0 = 0;
    el.addEventListener("pointerdown", e => { held = false; x0 = e.clientX; y0 = e.clientY; clearTimeout(t); t = setTimeout(() => { held = true; peek(el.dataset.src); }, 380); });
    el.addEventListener("pointermove", e => { if (Math.abs(e.clientX - x0) + Math.abs(e.clientY - y0) > 12) clearTimeout(t); });
    ["pointerup", "pointerleave", "pointercancel"].forEach(ev => el.addEventListener(ev, () => clearTimeout(t)));
    el.addEventListener("contextmenu", e => e.preventDefault());
    el.addEventListener("click", e => { if (held){ e.preventDefault(); e.stopImmediatePropagation(); held = false; } }, true);
  });
}
const L0 = x => x.topic && TOPICS[x.topic] && !x.news;
function wireFlag(x){
  const flag = $("#flag"), box = $("#flagbox"), p = profiles[pid];
  /* tap the flag to report a question; tap it again to take the report back */
  let sent = false;
  flag.onclick = async () => {
    if (flag.classList.contains("on")){
      delete p.flags[x.key]; computeHidden(); store.put("profile:" + pid, p).catch(() => {}); local.set("profiles", profiles);
      flag.classList.remove("on"); flag.setAttribute("aria-label", "Report this question"); box.classList.add("hidden");
      return;
    }
    flag.classList.add("on"); flag.setAttribute("aria-label", "Reported. Tap again to take it back");
    p.flags = Object.assign({}, p.flags, {[x.key]: today()}); computeHidden();
    box.classList.remove("hidden"); box.innerHTML = `<span class="small muted">Thanks. We've hidden this question while we check it. Tap the flag again to take it back.</span>`;
    local.set("profiles", profiles);
    if (sent){ store.put("profile:" + pid, p).catch(() => {}); return; } sent = true;
    const right = x.images ? (x.multi ? x.answers : [x.answer]).map(i => W[x.images[i]].title).join(", ") : x.multi ? x.answers.map(i => x.options[i]).join(", ") : x.options ? x.options[x.answer] : "";
    try { await store.put("profile:" + pid, p); await requestMore(x.topic, "problem", `Flagged. Question: ${x.prompt}${right ? " Answer shown as right: " + right : ""}`, x.key); } catch(e){}
  };
}
async function requestMore(topic, kind, message, item){
  const p = profiles[pid] || {};
  return store.feedback({kind, profile_name: p.name || "", topic: topic || "", item: item || "", message: String(message || "").slice(0, 1500)});
}
function finish(){
  inRound(false);
  if (S.mode === "round"){ state.stats.rounds++; state.stats.lastRound = today(); }
  save();
  const tid = S.mode === "topic" ? S.topic : topicOfDay().topic, L = lvlOf(tid), ups = S.results.filter(r => r.up);
  const missed = S.results.filter(r => !r.ok).length;
  view.innerHTML = `
    <div class="line"><i style="width:100%"></i></div>
    <div class="stack"><span class="eyebrow">${S.mode === "topic" ? esc(tName(tid)) : "Coffee round"}</span><h1>${S.score} <span class="serif">out of</span> ${S.results.length}</h1>
      <p class="muted">${missed ? `The ${missed === 1 ? "one" : missed} you missed will come back in a later round, so ${missed === 1 ? "it sticks" : "they stick"}.` : "Clean sweep."}</p></div>
    ${ups.map(u => `<div class="levelup big">${dots(u.up)}<span>You're now ${an(LEVELS[u.up-1])} <b>${LEVELS[u.up-1]}</b> in ${esc(tName(u.topic))}.</span></div>`).join("")}
    <button class="trow" id="tcard"><span class="tname">${esc(tName(tid))}</span><span class="lv">${dots(L)} ${LEVELS[L-1]}</span><span class="small muted">${esc(nextText(tid))}</span></button>
    <div class="stack"><button class="btn" id="keep">Keep going</button><button class="btn ghost" id="home">Back to today</button></div>
    <button class="btn link center" id="fbk">Something to say? Send feedback</button>`;
  $("#tcard").onclick = () => go("topic", tid);
  $("#keep").onclick = startEndless;
  $("#home").onclick = () => go("today");
  $("#fbk").onclick = () => go("me", "feedback");
  S = null; scrollTo(0, 0);
}

function renderToday(){
  const td = topicOfDay(), t = TOPICS[td.topic], L = lvlOf(td.topic);
  const w = W[(t.intro[0] || {}).art], played = state.stats.lastRound === today(), items = newsItems();
  view.innerHTML = `
    <div class="stack"><span class="eyebrow">${new Date().toLocaleDateString("en-GB", {weekday:"long", day:"numeric", month:"long"})}</span>
      <h1>${played ? "Another" : "Your"} <span class="serif">coffee round</span></h1>
      </div>
    <button class="todcard" id="tod">${figure(w)}<span class="eyebrow">${featured().includes(td.topic) ? "Today's topic · in the news" : "Today's topic"}</span><span class="todname">${esc(t.name)}</span><span class="lv">${dots(L)} ${LEVELS[L-1]}</span></button>
    <button class="btn" id="go">${played ? "Play another round" : "Start"}</button>
    <button class="btn ghost" id="endless">Free play</button>
    ${items.length ? `<div class="stack"><span class="eyebrow gold">This week in art</span><div>${items.slice(0, 5).map(n => `<div class="newsitem"><b>${esc(n.headline)}</b><span class="small muted">${esc(n.summary || "")}</span></div>`).join("")}</div></div>` : ""}
    ${store.online ? "" : `<p class="banner">Progress is saved on this device only.</p>`}`;
  $("#go").onclick = startRound; $("#endless").onclick = startEndless; $("#tod").onclick = () => go("topic", td.topic);
}
function renderTopics(){
  view.innerHTML = `<div class="stack"><h1>Your <span class="serif">collection</span></h1><p class="muted">Every topic has five levels, from Visitor to Curator. You move up by getting most of a level right, on at least two different days.</p></div>
    ${GROUPS.filter(([g]) => Object.values(TOPICS).some(t => t.group === g)).map(([g, label]) => `<div><span class="eyebrow">${label}</span>${Object.keys(TOPICS).filter(t => TOPICS[t].group === g).sort((a, b) => (TOPICS[a].year || 0) - (TOPICS[b].year || 0)).map(t => `<button class="trow" data-t="${t}"><span class="tname">${esc(TOPICS[t].name)}${featured().includes(t) ? ' <span class="eyebrow gold">in the news</span>' : ""}</span><span class="lv">${dots(lvlOf(t))} ${LEVELS[lvlOf(t)-1]}</span></button>`).join("")}</div>`).join("")}`;
  $$(".trow").forEach(b => b.onclick = () => go("topic", b.dataset.t));
}
function renderTopic(tid){
  const t = TOPICS[tid], L = lvlOf(tid), works = ART.filter(w => w.topic === tid);
  const grp = (GROUPS.find(g => g[0] === t.group) || ["", ""])[1];
  view.innerHTML = `
    <div class="qhead"><button class="btn link" id="back">All topics</button></div>
    <div class="stack"><span class="eyebrow">${esc(grp)}${t.span ? " · " + esc(t.span) : ""}</span><h1>${esc(t.name)}</h1>
      <span class="lv big">${dots(L)} ${LEVELS[L-1]}</span><span class="small muted">${esc(nextText(tid))}</span></div>
    <div class="row"><button class="btn" id="quiz">Quiz me</button><button class="btn ghost" id="learn">Introduction</button></div>
    ${tid !== topicOfDay().topic ? `<button class="btn link" id="make">Make this today's topic</button>` : ""}
    ${works.length ? `<div class="stack"><span class="eyebrow">In this room</span><div class="strip">${works.map(w => `<div class="sw">${figure(w, "thumb")}<span class="small">${esc(w.artist)}, <i>${esc(w.title)}</i></span></div>`).join("")}</div></div>` : ""}
    <div class="stack"><span class="eyebrow">Related</span><div class="chips">${t.related.filter(r => TOPICS[r]).map(r => `<button class="chipbtn" data-t="${r}">${esc(tName(r))}</button>`).join("")}</div></div>
    ${store.online ? `<button class="btn ghost" id="ask" ${state.asked["topic:" + tid] ? "disabled" : ""}>${state.asked["topic:" + tid] ? "Got it, more questions on this soon" : "Ask me more on this topic"}</button>` : ""}`;
  $("#back").onclick = () => go("topics");
  $("#learn").onclick = () => showIntro(tid, () => startTopic(tid), "Quiz me");
  $("#quiz").onclick = () => startTopic(tid);
  if ($("#make")) $("#make").onclick = () => { state.today = {date: today(), topic: tid, startLv: L}; save(); go("today"); };
  $$(".chipbtn").forEach(b => b.onclick = () => go("topic", b.dataset.t));
  if ($("#ask") && !state.asked["topic:" + tid]) $("#ask").onclick = async () => { const b = $("#ask"); b.disabled = true; try { await requestMore(tid, "more", "More on this topic, please", "topic:" + tid); state.asked["topic:" + tid] = today(); save(); b.textContent = "Got it, more questions on this soon"; } catch(e){ b.disabled = false; b.textContent = "Couldn't send. Try again."; } };
}
function renderMe(focus){
  const p = profiles[pid], s = state.stats, acc = s.answered ? Math.round(100 * s.correct / s.answered) : 0;
  const levels = Object.keys(TOPICS).map(lvlOf), best = Math.max(...levels);
  view.innerHTML = `
    <div class="row mehead"><span class="dot big" style="${dotStyle(p)}">${esc(p.name[0])}</span><div class="grow"><h2>${esc(p.name)}</h2><span class="small muted">${s.rounds} coffee ${s.rounds === 1 ? "round" : "rounds"} · ${acc}% right</span></div><button class="btn link" id="edit">Edit</button></div>
    <div id="editbox"></div>
    <div class="stats"><div class="stat"><b>${levels.filter(l => l >= 2).length}</b><span>topics beyond Visitor</span></div><div class="stat"><b class="word">${LEVELS[best-1]}</b><span>highest level</span></div><div class="stat"><b>${s.learned}</b><span>learned for good</span></div></div>
    <div class="stack" id="fbbox"><span class="eyebrow">Feedback</span>
      <p class="small muted">Ideas, problems or topics you'd like to learn about. We read everything.</p>
      <div class="chips" role="radiogroup" aria-label="Type of feedback">${[["idea","An idea"],["problem","Something's wrong"],["content","I'd like to learn about…"]].map(([k, l], i) => `<button class="chipbtn kind ${i ? "" : "on"}" data-k="${k}" role="radio" aria-checked="${i ? "false" : "true"}">${l}</button>`).join("")}</div>
      <label class="sr" for="fbtext">Your feedback</label><textarea id="fbtext" rows="4" placeholder="Write here"></textarea>
      <button class="btn" id="send" disabled>Send</button><span class="small muted" id="sent" aria-live="polite"></span></div>
    <div class="row two"><button class="btn ghost" id="sw">Switch profile</button><button class="btn ghost" id="pin">${p.pin ? "Change PIN" : "Set a PIN"}</button></div>
    ${p.admin ? `<div class="stack" id="admin"><span class="eyebrow">Profiles <span class="tag">Admin</span></span><div class="profiles small">${Object.keys(profiles).filter(id => id !== pid).map(id => `<div class="prow static"><span class="pstrip" style="${dotStyle(profiles[id])}">${esc(profiles[id].name[0])}</span><span class="pname">${esc(profiles[id].name)}</span><span class="pacts">${profiles[id].pin ? `<button class="btn link" data-reset="${id}">Reset PIN</button>` : ""}<button class="btn link danger" data-rm="${id}">Remove</button></span></div>`).join("") || `<p class="small muted">No one else yet.</p>`}</div></div>` : ""}
    <div class="stack"><span class="eyebrow">Home Screen</span><p class="small">iPhone: in Safari tap Share, then <b>Add to Home Screen</b>.</p></div>
    ${store.online ? "" : `<p class="banner">Progress is saved on this device only, and feedback can't be sent.</p>`}
    <p class="small muted center version">Morning Gallery · updated ${BUILD_AT}</p>`;
  let kind = "idea";
  $$(".kind").forEach(b => b.onclick = () => { kind = b.dataset.k; $$(".kind").forEach(x => { x.classList.toggle("on", x === b); x.setAttribute("aria-checked", String(x === b)); }); });
  const ta = $("#fbtext"), send = $("#send");
  ta.oninput = () => send.disabled = !ta.value.trim() || !store.online;
  send.onclick = async () => { send.disabled = true; try { await requestMore("", kind, ta.value.trim(), ""); ta.value = ""; $("#sent").textContent = "Thank you, we've got it."; } catch(e){ send.disabled = false; $("#sent").textContent = "Couldn't send. Please try again."; } };
  $("#sw").onclick = renderProfiles;
  $("#pin").onclick = () => askPin(pid, "set");
  $("#edit").onclick = () => editProfile(focus);
  $$("[data-rm]").forEach(b => b.onclick = async () => {
    if (!b.classList.contains("sure")){ b.classList.add("sure"); b.textContent = "Tap again to remove"; setTimeout(() => { if (b.isConnected){ b.classList.remove("sure"); b.textContent = "Remove"; } }, 4000); return; }
    const id = b.dataset.rm, name = profiles[id].name; b.disabled = true;
    await store.put("profile:" + id, {removed: true, name, removed_at: new Date().toISOString()}); await store.put("progress:" + id, {removed: true});
    delete profiles[id]; local.set("profiles", profiles); computeHidden(); renderMe();
  });
  $$("[data-reset]").forEach(b => b.onclick = async () => { const q = profiles[b.dataset.reset]; delete q.pin; await store.put("profile:" + b.dataset.reset, q); local.set("profiles", profiles); b.replaceWith(Object.assign(document.createElement("span"), {className:"small muted", textContent:"PIN cleared"})); });
  if (focus === "feedback") $("#fbbox").scrollIntoView();
}
function swatches(cur){ return `<div class="swatches">${COLORS.map((c, i) => `<button class="swatch ${c === cur ? "on" : ""}" data-c="${c}" style="background:${c}" aria-label="Colour ${i + 1}"></button>`).join("")}</div>`; }
function wireSwatches(onPick){ $$(".swatch").forEach(b => b.onclick = () => { onPick(b.dataset.c); $$(".swatch").forEach(x => x.classList.toggle("on", x === b)); }); }
function adminName(){ const a = Object.values(profiles).find(p => p.admin); return a ? a.name : ""; }
function renderProfiles(){
  $("#tabs").classList.add("hidden"); $("#who").classList.add("hidden"); inRound(false);
  const ids = Object.keys(profiles).sort((a, b) => (profiles[a].created || 0) - (profiles[b].created || 0));
  view.innerHTML = `
    <div class="stack"><h1 class="big">Who's <span class="serif">visiting?</span></h1><p class="muted">Tap your name. Everyone's progress is kept separately.</p></div>
    <div class="profiles">${ids.map(id => `<button class="prow" data-id="${id}"><span class="pstrip" style="${dotStyle(profiles[id])}">${esc(profiles[id].name[0])}</span><span class="pname">${esc(profiles[id].name)}</span></button>`).join("") || `<p class="small muted">No profiles yet. Make the first one.</p>`}</div>
    <button class="btn ${ids.length ? "ghost" : ""}" id="new">New profile</button>`;
  $$(".prow").forEach(b => b.onclick = () => askPin(b.dataset.id));
  $("#new").onclick = newProfile;
}
function newProfile(){
  let color = COLORS[Object.keys(profiles).length % COLORS.length];
  view.innerHTML = `
    <div class="stack"><h1 class="big">New <span class="serif">profile</span></h1></div>
    <div class="stack"><label class="eyebrow" for="pn">Your name</label><input type="text" id="pn" maxlength="24" placeholder="Name" autocomplete="off"></div>
    <div class="stack"><span class="eyebrow">Your colour</span>${swatches(color)}</div>
    <div class="stack"><label class="eyebrow" for="pp">Choose a 4-digit PIN</label><input type="password" id="pp" class="pinput" inputmode="numeric" pattern="[0-9]*" maxlength="4" autocomplete="new-password" placeholder="····">
      <p class="small muted">So nobody plays as you by accident. You'll only need it when switching profiles.</p></div>
    <div class="row two"><button class="btn ghost" id="back">Back</button><button class="btn" id="cr" disabled>Create profile</button></div>`;
  wireSwatches(c => color = c);
  const inp = $("#pn"), pin = $("#pp"), cr = $("#cr");
  const ok = () => cr.disabled = !inp.value.trim() || !/^\d{4}$/.test(pin.value);
  inp.oninput = ok; pin.oninput = () => { pin.value = pin.value.replace(/\D/g, "").slice(0, 4); ok(); };
  $("#back").onclick = renderProfiles;
  cr.onclick = async () => {
    cr.disabled = true; const id = "p" + Date.now().toString(36) + Math.floor(Math.random() * 999);
    const p = {name: inp.value.trim(), color, created: Date.now(), pin: await hashPin(id, pin.value)};
    if (!adminName()) p.admin = true;
    profiles[id] = p; await store.put("profile:" + id, p); local.set("profiles", profiles); use(id);
  };
  inp.focus();
}
function askPin(id, mode){
  const p = profiles[id], setting = mode === "set" || !p.pin;
  if (!setting && id === pid && state) return go("today");
  $("#tabs").classList.add("hidden"); $("#who").classList.add("hidden");
  const adm = adminName();
  view.innerHTML = `
    <div class="pinhead"><span class="pstrip big" style="${dotStyle(p)}">${esc(p.name[0])}</span><h1 class="big">${esc(p.name)}</h1></div>
    <div class="stack"><label class="eyebrow" for="pp">${setting ? (p.pin ? "Choose a new 4-digit PIN" : "Choose a 4-digit PIN") : "Your PIN"}</label>
      <input type="password" id="pp" class="pinput" inputmode="numeric" pattern="[0-9]*" maxlength="4" autocomplete="${setting ? "new-password" : "current-password"}" placeholder="····">
      <p class="small muted" id="pmsg" aria-live="polite">${setting ? "So nobody plays as you by accident." : adm && adm !== p.name ? `Forgotten it? Ask ${esc(adm)} to reset it.` : ""}</p></div>
    <div class="row two"><button class="btn ghost" id="back">Back</button><button class="btn" id="ok" disabled>${setting ? "Save PIN" : "Open"}</button></div>`;
  const pin = $("#pp"), ok = $("#ok"), msg = $("#pmsg");
  const submit = async () => {
    ok.disabled = true; const h = await hashPin(id, pin.value);
    if (setting){ p.pin = h; await store.put("profile:" + id, p); local.set("profiles", profiles); if (id === pid && state) backToMe(); else use(id); return; }
    if (h === p.pin) return use(id);
    pin.value = ""; pin.classList.add("shake"); setTimeout(() => pin.classList.remove("shake"), 400); msg.textContent = "That's not it. Try again."; pin.focus();
  };
  pin.oninput = () => { pin.value = pin.value.replace(/\D/g, "").slice(0, 4); ok.disabled = pin.value.length !== 4; if (!setting && pin.value.length === 4) submit(); };
  ok.onclick = submit;
  $("#back").onclick = () => id === pid && state && mode === "set" ? backToMe() : renderProfiles();
  pin.focus();
}
function editProfile(){
  const p = profiles[pid]; let color = p.color;
  $("#editbox").innerHTML = `<div class="stack editcard"><label class="eyebrow" for="en">Name</label><input type="text" id="en" maxlength="24" value="${esc(p.name)}" autocomplete="off">
    <span class="eyebrow">Colour</span>${swatches(color)}
    <div class="row two"><button class="btn ghost" id="ecancel">Cancel</button><button class="btn" id="esave">Save</button></div></div>`;
  $("#edit").classList.add("hidden");
  wireSwatches(c => color = c);
  const en = $("#en"), sv = $("#esave");
  en.oninput = () => sv.disabled = !en.value.trim();
  $("#ecancel").onclick = () => renderMe();
  sv.onclick = async () => { sv.disabled = true; p.name = en.value.trim(); p.color = color; await store.put("profile:" + pid, p); local.set("profiles", profiles); setWho(); renderMe(); };
}
function backToMe(){ $("#who").classList.remove("hidden"); $("#tabs").classList.remove("hidden"); go("me"); }
function setWho(){ const p = profiles[pid]; $("#whoDot").style.cssText = dotStyle(p); $("#whoDot").textContent = p.name[0]; $("#whoName").textContent = p.name; }
async function use(id){
  if (pid && state){ clearTimeout(saveTimer); await flush(); }
  pid = id; local.set("last", id);
  view.innerHTML = `<p class="muted">Opening the doors…</p>`;
  const old = await store.get("progress:" + id);
  state = old && old.v === 3 ? Object.assign(fresh(), old) : fresh(old);
  Object.keys(state.srs || {}).forEach(k => { if (k.startsWith("M:")) delete state.srs[k]; }); // retired question type
  const p = profiles[id];
  setWho();
  $("#who").classList.remove("hidden"); $("#tabs").classList.remove("hidden");
  go("today");
}
$("#who").onclick = renderProfiles;

(async function boot(){
  try { await loadContent(); }
  catch(e){ view.innerHTML = `<p class="muted">The gallery couldn't load its collection. Check your connection and reload.</p>`; return; }
  profiles = await store.listProfiles(); computeHidden();
  const last = local.get("last");
  if (last && profiles[last]) use(last); else renderProfiles();
})();
