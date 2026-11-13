/* Morning Gallery v3 */
"use strict";
const CFG = window.MG_CONFIG || {};
const LEVELS = ["Visitor", "Regular", "Enthusiast", "Connoisseur", "Curator"];
const GROUPS = [["start", "Start here"], ["next", "Next steps"], ["specialist", "Specialist"]];
const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const view = $("#view");
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`; };
const DAY = 86400000;
const COLORS = ["#1f3fd1","#b3261e","#1e7a46","#8a5a00","#6b2fa3","#0f6e7a","#c2185b","#1a1a1a"];
const an = w => /^[AEIOU]/.test(w) ? "an" : "a";

/* random helpers: Math.random for variety, seeded when a question is rebuilt from its key */
function hash(s){ let h = 2166136261; for (const c of s){ h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }
function rng(seed){ let a = typeof seed === "string" ? hash(seed) : seed; return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const shuffle = (a, r = Math.random) => { a = a.slice(); for (let i = a.length - 1; i > 0; i--){ const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const pick = (a, r = Math.random) => a[Math.floor(r() * a.length)];

/* ---------------- content ---------------- */
let WORKS = [], W = {}, TOPICS = {}, NEWS = null, ART = [];
async function getJSON(name){
  if (CFG.CONTENT_URL){
    const base = CFG.CONTENT_URL.replace(/\/?$/, "/");
    try { const r = await fetch(base + name + "?t=" + Math.floor(Date.now() / 300000), {cache:"no-store"}); if (r.ok) return await r.json(); } catch(e){}
  }
  const r = await fetch("content/" + name + "?d=" + today()); return r.json();
}
async function loadContent(){
  const [w, t, n] = await Promise.all([getJSON("works.json"), getJSON("topics.json"), getJSON("news.json").catch(() => null)]);
  WORKS = w.works; TOPICS = t.topics; NEWS = n;
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
      try { const rows = await sb("kv?select=id,data&id=like.profile:*"); const out = {}; rows.forEach(r => out[r.id.slice(8)] = r.data); local.set("profiles", out); return out; }
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
  if (!ok){ state.srs[k] = {box:0, due: Date.now() + DAY * 0.9, topic: q.topic}; return "You'll see this one again tomorrow."; }
  if (it){ it.box++; if (it.box >= BOX.length){ delete state.srs[k]; state.stats.learned++; return "You've learned this one for good."; } it.due = Date.now() + BOX[it.box] * DAY; return `You'll see it again in ${BOX[it.box]} days.`; }
  return "";
}
const due = () => Object.entries(state.srs).filter(([k, v]) => v.due <= Date.now()).map(([k]) => k);

/* ---------------- questions ---------------- */
function nearArtists(w, n, r){
  const others = [...new Set(ART.map(a => a.artist))].filter(a => a !== w.artist && !/attributed/.test(a));
  const yr = a => (ART.find(x => x.artist === a) || {}).year || 1800;
  const pool = others.sort((a, b) => Math.abs(yr(a) - w.year) - Math.abs(yr(b) - w.year)).slice(0, 10);
  return shuffle(pool, r).slice(0, n);
}
function mc(o){ const opts = shuffle(o.options); return Object.assign({}, o, {type:"mc", options:opts, answer:opts.indexOf(o.options[0])}); }
const BUILD = {
  Q(key){ const [, tid, i] = key.split(":"); const t = TOPICS[tid]; const x = t && t.questions[+i]; if (!x) return null; return mc({key, topic:tid, level:x.level, prompt:x.q, options:x.options, explain:x.explain, art:x.art}); },
  P(key){ // which of these is <topic>
    const [, tid, wid] = key.split(":"), t = TOPICS[tid], right = W[wid]; if (!t || !right) return null;
    const r = rng(key);
    const others = ART.filter(w => w.topic !== tid && !(t.kind === "artist" && w.artist === right.artist)).sort((a, b) => Math.abs(a.year - right.year) - Math.abs(b.year - right.year)).slice(0, 16);
    const chosen = shuffle(others, r).slice(0, 3), set = shuffle([right, ...chosen]);
    return {key, topic:tid, level:1, type:"pick", prompt:`Which of these is ${t.kind === "artist" ? "by " + t.name.replace(/^.*: /, "") : t.name}?`, images:set.map(w => w.id), answer:set.indexOf(right), art:right.id, explain:right.hook, spare:others.filter(o => !chosen.includes(o)).map(w => w.id)};
  },
  I(key){ // which one isn't
    const [, tid, odd] = key.split(":"), t = TOPICS[tid], oddW = W[odd]; if (!t || !oddW) return null;
    const r = rng(key), pool = shuffle(ART.filter(w => w.topic === tid), r), mine = pool.slice(0, 3); if (mine.length < 3) return null;
    const set = shuffle([oddW, ...mine]);
    return {key, topic:tid, level:3, type:"pick", odd:true, prompt:`Which one is NOT ${t.kind === "artist" ? "by " + t.name.replace(/^.*: /, "") : t.name}?`, images:set.map(w => w.id), answer:set.indexOf(oddW), art:oddW.id, explain:`The odd one out is ${oddW.artist}, ${oddW.title} (${yearText(oddW)}).`, spare:pool.slice(3).map(w => w.id)};
  },
  M(key){
    const wid = key.split(":")[1], w = W[wid]; if (!w || !TOPICS[w.topic]) return null; const t = TOPICS[w.topic]; if (t.kind !== "movement") return null;
    const r = rng(key), movs = Object.keys(TOPICS).filter(k => TOPICS[k].kind === "movement" && k !== w.topic).sort((a, b) => Math.abs(TOPICS[a].year - t.year) - Math.abs(TOPICS[b].year - t.year)).slice(0, 6);
    return mc({key, topic:w.topic, level:2, prompt:"Which movement or style is this?", options:[t.name, ...shuffle(movs, r).slice(0, 3).map(m => TOPICS[m].name)], art:w.id, explain:w.hook, needsArt:true});
  },
  W(key){
    const wid = key.split(":")[1], w = W[wid]; if (!w || !TOPICS[w.topic]) return null;
    return mc({key, topic:w.topic, level:3, prompt:"Who made this?", options:[w.artist, ...nearArtists(w, 3, rng(key))], art:w.id, explain:w.hook, needsArt:true});
  },
  H(key){
    const wid = key.split(":")[1], w = W[wid]; if (!w || !w.place || !TOPICS[w.topic]) return null;
    const places = [...new Set(WORKS.map(x => x.place).filter(p => p && p !== w.place && !/Private|Destroyed/.test(p)))];
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
  N(key){ const id = key.slice(2), it = newsItems().find(n => n.id === id); if (!it) return null; const a = it.answer || 0; return mc({key, topic:TOPICS[it.topic] ? it.topic : null, level:0, prompt:it.question, options:[it.options[a], ...it.options.filter((_, i) => i !== a)], explain:it.explain, source:it.source, art: W[it.art] ? it.art : null, news:true, long:true}); }
};
function fromKey(k){ try { const b = BUILD[k[0]]; return b ? b(k) : null; } catch(e){ return null; } }
const qcache = {};
function allQuestions(tid){
  if (qcache[tid]) return qcache[tid];
  const t = TOPICS[tid], keys = [];
  t.questions.forEach((_, i) => keys.push(`Q:${tid}:${i}`));
  const mine = ART.filter(w => w.topic === tid);
  mine.forEach(w => {
    keys.push(`P:${tid}:${w.id}`);
    if (t.kind === "movement") keys.push(`M:${w.id}`, `W:${w.id}`);
    if (t.kind === "artist") keys.push(`T:${w.id}`);
    if (w.place && !/Tate|Private|Destroyed/.test(w.place)) keys.push(`H:${w.id}`);
  });
  if (mine.length >= 3){
    const r = rng("odd" + tid);
    shuffle(ART.filter(w => w.topic !== tid), r).slice(0, Math.min(6, mine.length)).forEach(o => keys.push(`I:${tid}:${o.id}`));
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
  const t = T(tid), L = t.lv, all = allQuestions(tid).filter(q => !exclude.has(q.key));
  const score = q => (t.hits[q.key] ? 2 : state.seen[q.key] === "wrong" ? 0 : 1) + Math.random() * 0.9;
  const out = [];
  const take = (lv, k) => all.filter(q => q.level === lv && !out.some(o => o.key === q.key)).sort((a, b) => score(a) - score(b)).slice(0, Math.max(0, k));
  if (L > 1 && n > 2) out.push(...take(L - 1, 1));
  out.push(...take(L, n - out.length - (n > 2 ? 1 : 0)));
  if (n > 2) out.push(...take(L + 1, 1).map(q => Object.assign({}, q, {stretch:true})));
  for (let lv = L; out.length < n && lv >= 1; lv--) out.push(...take(lv, n - out.length));
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
    const imgs = q.images.slice(), spare = (q.spare || []).filter(id => !imgs.includes(id));
    const oks = await Promise.all(imgs.map(id => loadImg(W[id].img)));
    for (let i = 0; i < imgs.length; i++){
      if (oks[i]) continue;
      if (i === q.answer) return null;
      let rep = null; while (spare.length && !rep){ const c = spare.shift(); if (await loadImg(W[c].img)) rep = c; }
      if (!rep) return null; imgs[i] = rep;
    }
    return Object.assign({}, q, {images: imgs});
  }
  if (q.type === "order"){ await Promise.all(q.items.map(it => it.art && W[it.art] ? loadImg(W[it.art].img) : true)); return q; }
  if (q.art && W[q.art] && !(await loadImg(W[q.art].img))) return q.needsArt ? null : Object.assign({}, q, {art:null});
  return q;
}
function prefetch(q){ if (!q) return; if (q.type === "pick") q.images.forEach(id => loadImg(W[id].img)); else if (q.art && W[q.art]) loadImg(W[q.art].img); }

/* ---------------- sessions ---------------- */
let S = null;
function buildRound(){
  const tid = topicOfDay().topic, q = [], used = new Set();
  topicSet(tid, 6).forEach(x => { q.push(Object.assign({}, x, {section:"topic"})); used.add(x.key); });
  const earlier = shuffle(due()).map(fromKey).filter(x => x && !used.has(x.key) && x.level).slice(0, 2).map(x => Object.assign(x, {section:"review"}));
  earlier.forEach(e => used.add(e.key));
  if (earlier.length < 2){
    const studied = Object.keys(state.topics).filter(t => t !== tid && TOPICS[t] && T(t).n > 0);
    const pool = studied.length ? studied : Object.keys(TOPICS).filter(t => TOPICS[t].group === "start" && t !== tid);
    for (let i = 0; i < 8 && earlier.length < 2; i++){ const t = pick(pool); const c = topicSet(t, 1, used)[0]; if (c){ earlier.push(Object.assign({}, c, {section: studied.length ? "review" : "mixed", stretch:false})); used.add(c.key); } }
  }
  q.push(...earlier);
  const ni = shuffle(newsItems().filter(n => !state.seenNews[n.id])).slice(0, 2);
  const ns = (ni.length ? ni : shuffle(newsItems()).slice(0, 2)).map(n => fromKey("N:" + n.id)).filter(Boolean);
  if (ns.length){ q.push({type:"divider", key:"divider"}); ns.forEach(x => q.push(Object.assign(x, {section:"news"}))); }
  return q;
}
function startRound(){
  const td = topicOfDay();
  const begin = () => { S = {mode:"round", q: buildRound(), i:0, score:0, results:[]}; next(0); };
  if (!T(td.topic).intro) showIntro(td.topic, () => { T(td.topic).intro = true; save(); begin(); }, "Start the questions");
  else begin();
}
function startTopic(tid){ T(tid).intro = true; S = {mode:"topic", topic:tid, q: topicSet(tid, 6).map(x => Object.assign({}, x, {section:"topic"})), i:0, score:0, results:[]}; next(0); }
function startEndless(){ S = {mode:"endless", q:[], i:0, score:0, results:[], used:new Set()}; next(0); }
function pushEndless(){
  const tid = topicOfDay().topic; let x = null;
  const d = due().filter(k => !S.used.has(k));
  if (d.length && Math.random() < .25){ x = fromKey(d[0]); if (x) x.section = "review"; }
  if (!x && S.q.length % 8 === 7){ const n = newsItems().filter(n => !S.used.has("N:" + n.id)); if (n.length){ x = fromKey("N:" + pick(n).id); if (x) x.section = "news"; } }
  if (!x){
    const t = Math.random() < .55 ? tid : pick(Object.keys(TOPICS).filter(k => TOPICS[k].group !== "specialist" || T(k).n > 0));
    const c = topicSet(t, 3, S.used)[0]; if (c) x = Object.assign({}, c, {section: t === tid ? "topic" : "mixed", stretch: c.stretch && t === tid});
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
function go(t, a){ setTab(t === "topic" ? "topics" : t); scrollTo(0, 0); view.ontouchstart = view.ontouchend = null; ({today:renderToday, topics:renderTopics, me:renderMe, topic:renderTopic})[t](a); }
function figure(w, cls = ""){ return w ? `<figure class="spot ${cls}"><img src="${esc(w.img)}" alt="${w.photo ? esc(w.title) : "The artwork for this question"}" referrerpolicy="no-referrer" onerror="this.closest('figure').classList.add('gone')"></figure>` : ""; }
function label(w){
  if (!w) return "";
  if (w.photo) return `<div class="label"><span>${esc(w.title)}</span></div>`;
  return `<div class="label"><b>${esc(w.artist)}</b><span><i>${esc(w.title)}</i>, ${yearText(w)}</span>${w.place ? `<span class="muted">${esc(w.place)}</span>` : ""}</div>`;
}
const SECTION = {topic: x => tName(x.topic), review: x => "Review · " + tName(x.topic), mixed: x => "Something different · " + tName(x.topic), news: () => "This week in art"};

function showIntro(tid, done, finishLabel){
  const t = TOPICS[tid], cards = t.intro; let i = 0;
  const draw = () => {
    const c = cards[i], w = W[c.art];
    view.innerHTML = `
      <div class="line"><i style="width:${(i + 1) / cards.length * 100}%"></i></div>
      <div class="qhead"><span class="eyebrow">${esc(t.name)} · introduction</span><button class="btn link" id="x">Close</button></div>
      ${figure(w)}${label(w)}
      <h2>${esc(c.title)}</h2><p class="lead">${esc(c.text)}</p>
      <div class="row"><button class="btn ghost" id="prev" ${i ? "" : "disabled"}>Previous</button><button class="btn" id="nxt">${i === cards.length - 1 ? finishLabel : "Next"}</button></div>`;
    $("#x").onclick = () => go("today");
    $("#prev").onclick = () => { i--; draw(); };
    $("#nxt").onclick = () => { if (i < cards.length - 1){ i++; draw(); scrollTo(0, 0); } else done(); };
  };
  let sx = null;
  view.ontouchstart = e => { sx = e.touches[0].clientX; };
  view.ontouchend = e => { if (sx === null) return; const dx = e.changedTouches[0].clientX - sx; sx = null; if (Math.abs(dx) > 70){ if (dx < 0 && i < cards.length - 1){ i++; draw(); } else if (dx > 0 && i > 0){ i--; draw(); } } };
  setTab("today"); draw();
}

function render(){
  view.ontouchstart = view.ontouchend = null;
  const x = S.q[S.i];
  setTab(S.mode === "topic" ? "topics" : "today");
  const real = S.q.filter(y => y.type !== "divider"), pos = real.indexOf(x);
  const progress = (pos / Math.max(1, real.length)) * 100;
  if (x.type === "divider"){
    view.innerHTML = `<div class="line"><i style="width:${progress}%"></i></div>
      <div class="divider"><span class="eyebrow gold">A separate section</span><h1>This week <span class="serif">in art</span></h1>
      <p class="muted">Two quick questions on what's happening in the art world right now${NEWS && NEWS.week ? " (" + esc(NEWS.week) + ")" : ""}. They don't count towards your topic levels.</p>
      <button class="btn" id="go">Continue</button></div>`;
    $("#go").onclick = () => next(1); return;
  }
  const w = x.art && x.type !== "pick" ? W[x.art] : null;
  const L = x.topic && TOPICS[x.topic] && !x.news ? lvlOf(x.topic) : 0;
  view.innerHTML = `
    ${S.mode === "endless" ? `<div class="line"></div>` : `<div class="line"><i style="width:${progress}%"></i></div>`}
    <div class="qhead">
      <span class="eyebrow ${x.news ? "gold" : ""}">${esc(SECTION[x.section || "topic"](x))}${L ? ` ${dots(L)} <span class="lvword">${LEVELS[L-1]}</span>` : ""}</span>
      <button class="btn link" id="quit">Stop</button></div>
    ${w ? figure(w) : ""}
    <div class="prompt">${esc(x.prompt)}</div>
    ${x.stretch && x.level ? `<div class="stretch"><span class="tag">Stretch</span><span>${an(LEVELS[x.level-1])} ${LEVELS[x.level-1]}-level question</span></div>` : ""}
    <div id="ans"></div><div id="fb"></div>
    ${S.mode === "endless" ? `<p class="small muted center">${S.score} right so far</p>` : ""}`;
  $("#quit").onclick = () => { S = null; go("today"); };
  if (x.type === "mc") renderMC(x); else if (x.type === "pick") renderPick(x); else renderOrder(x);
}
function renderMC(x){
  const one = x.long || x.options.some(o => o.length > 20);
  $("#ans").innerHTML = `<div class="opts ${one ? "one" : ""}">${x.options.map((o, i) => `<button class="opt" data-i="${i}">${esc(o)}</button>`).join("")}</div>`;
  $$(".opt").forEach(b => b.onclick = () => {
    const ok = +b.dataset.i === x.answer;
    $$(".opt").forEach(o => { o.disabled = true; if (+o.dataset.i === x.answer) o.classList.add("right"); });
    if (!ok) b.classList.add("wrong"); answered(x, ok);
  });
}
function renderPick(x){
  $("#ans").innerHTML = `<div class="grid">${x.images.map((id, i) => `<button class="pickimg" data-i="${i}" aria-label="Picture ${i + 1}"><img src="${esc(W[id].img)}" alt="" referrerpolicy="no-referrer"></button>`).join("")}</div>`;
  $$(".pickimg").forEach(b => b.onclick = () => {
    const ok = +b.dataset.i === x.answer;
    $$(".pickimg").forEach((o, i) => { o.disabled = true; o.classList.add(i === x.answer ? "right" : "dim"); const w = W[x.images[i]]; o.insertAdjacentHTML("beforeend", `<span class="cap">${esc(w.artist)}, ${yearText(w)}</span>`); });
    if (!ok) b.classList.add("wrong"); answered(x, ok);
  });
}
function renderOrder(x){
  const picked = [];
  $("#ans").innerHTML = `<p class="small muted">Tap them in order.</p><div class="order">${x.items.map((it, i) => `<button class="oitem" data-i="${i}"><span class="n"></span>${it.art && W[it.art] && imgOK[W[it.art].img] ? `<img class="mini" src="${esc(W[it.art].img)}" alt="" referrerpolicy="no-referrer">` : ""}<span class="ol"><span>${esc(it.label)}</span><span class="small muted">${esc(it.sub || "")}</span></span><span class="yr hidden">${it.year}</span></button>`).join("")}</div><button class="btn ghost" id="undo" disabled>Undo</button>`;
  const bs = $$(".oitem");
  const paint = () => { bs.forEach((b, i) => { const p = picked.indexOf(i); b.classList.toggle("picked", p >= 0); b.querySelector(".n").textContent = p >= 0 ? p + 1 : ""; }); $("#undo").disabled = !picked.length; };
  bs.forEach((b, i) => b.onclick = () => {
    if (picked.includes(i)) return; picked.push(i); paint();
    if (picked.length === x.items.length){
      const ys = picked.map(j => x.items[j].year), ok = ys.every((y, k) => !k || y >= ys[k - 1]);
      const sorted = x.items.map((_, j) => j).sort((a, b) => x.items[a].year - x.items[b].year);
      bs.forEach((bb, j) => { bb.disabled = true; bb.querySelector(".yr").classList.remove("hidden"); bb.classList.add(picked.indexOf(j) === sorted.indexOf(j) ? "right" : "wrong"); });
      const list = $(".order"); sorted.forEach(j => list.appendChild(bs[j]));
      $("#undo").remove(); answered(x, ok);
    }
  });
  $("#undo").onclick = () => { picked.pop(); paint(); };
}
function answered(x, ok){
  state.seen[x.key] = ok ? "right" : "wrong";
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
  const w = x.art ? W[x.art] : null, fact = x.explain || (w && w.hook) || "";
  const last = S.mode !== "endless" && S.i === S.q.length - 1;
  $("#fb").innerHTML = `<div class="feedback ${ok ? "good" : "bad"}">
      <span class="verdict">${ok ? pick(["Spot on.", "Yes.", "Exactly.", "Nicely seen."]) : x.type === "order" ? "Not quite. Here's the right order." : "Not this time."}</span>
      ${w ? label(w) : ""}
      ${fact ? `<p>${esc(fact)}</p>` : ""}
      ${x.source ? `<a class="small" href="${esc(x.source)}" target="_blank" rel="noopener">Read the story</a>` : ""}
      ${up ? `<div class="levelup">${dots(up)}<span>You're now ${an(LEVELS[up-1])} <b>${LEVELS[up-1]}</b> in ${esc(tName(x.topic))}.</span></div>` : L0(x) ? `<span class="small muted">${esc(tName(x.topic))}: ${esc(nextText(x.topic))}</span>` : ""}
      ${note ? `<span class="small muted">${note}</span>` : ""}
      ${fact && store.online ? `<button class="btn link more" id="more" ${state.asked[x.key] ? "disabled" : ""}>${state.asked[x.key] ? "Thanks, more on this soon" : "I'd like to know more about this"}</button>` : ""}
    </div><button class="btn" id="next">${last ? "See results" : "Next"}</button>`;
  if ($("#more") && !state.asked[x.key]) $("#more").onclick = async () => {
    const b = $("#more"); b.disabled = true; b.textContent = "Sending…";
    try { await requestMore(x.topic, "more", fact, x.key); state.asked[x.key] = today(); save(); b.textContent = "Thanks, more on this soon"; }
    catch(e){ b.disabled = false; b.textContent = "Couldn't send. Tap to try again."; }
  };
  $("#next").onclick = () => { scrollTo(0, 0); next(1); };
  $("#next").scrollIntoView({behavior:"smooth", block:"nearest"});
}
const L0 = x => x.topic && TOPICS[x.topic] && !x.news;
async function requestMore(topic, kind, message, item){
  const p = profiles[pid] || {};
  return store.feedback({kind, profile_name: p.name || "", topic: topic || "", item: item || "", message: String(message || "").slice(0, 1500)});
}
function finish(){
  if (S.mode === "round"){ state.stats.rounds++; state.stats.lastRound = today(); }
  save();
  const tid = S.mode === "topic" ? S.topic : topicOfDay().topic, L = lvlOf(tid), ups = S.results.filter(r => r.up);
  const missed = S.results.filter(r => !r.ok).length;
  view.innerHTML = `
    <div class="line"><i style="width:100%"></i></div>
    <div class="stack"><span class="eyebrow">${S.mode === "topic" ? esc(tName(tid)) : "Coffee round"}</span><h1>${S.score} <span class="serif">out of</span> ${S.results.length}</h1>
      <p class="muted">${missed ? `You'll see the ${missed === 1 ? "one" : missed} you missed again tomorrow, so ${missed === 1 ? "it sticks" : "they stick"}.` : "Clean sweep."}</p></div>
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
      <p class="muted">${T(td.topic).intro ? "" : "A short introduction, then "}6 questions on today's topic, 2 reviews, then this week's news.</p></div>
    <button class="todcard" id="tod">${figure(w)}<span class="eyebrow">${featured().includes(td.topic) ? "Today's topic · in the news" : "Today's topic"}</span><span class="todname">${esc(t.name)}</span><span class="lv">${dots(L)} ${LEVELS[L-1]}</span></button>
    <button class="btn" id="go">${played ? "Play another round" : "Start"}</button>
    <button class="btn ghost" id="endless">Free play</button>
    ${items.length ? `<div class="stack"><span class="eyebrow gold">This week in art${NEWS.week ? " · " + esc(NEWS.week) : ""}</span><div>${items.slice(0, 5).map(n => `<div class="newsitem"><b>${esc(n.headline)}</b><span class="small muted">${esc(n.summary || "")}</span></div>`).join("")}</div></div>` : ""}
    ${store.online ? "" : `<p class="banner">Progress is saved on this device only.</p>`}`;
  $("#go").onclick = startRound; $("#endless").onclick = startEndless; $("#tod").onclick = () => go("topic", td.topic);
}
function renderTopics(){
  view.innerHTML = `<div class="stack"><h1>Your <span class="serif">collection</span></h1><p class="muted">Every topic has five levels, from Visitor to Curator. You move up by getting most of a level right, on at least two different days.</p></div>
    ${GROUPS.map(([g, label]) => `<div><span class="eyebrow">${label}</span>${Object.keys(TOPICS).filter(t => TOPICS[t].group === g).sort((a, b) => (TOPICS[a].year || 0) - (TOPICS[b].year || 0)).map(t => `<button class="trow" data-t="${t}"><span class="tname">${esc(TOPICS[t].name)}${featured().includes(t) ? ' <span class="eyebrow gold">in the news</span>' : ""}</span><span class="lv">${dots(lvlOf(t))} ${LEVELS[lvlOf(t)-1]}</span></button>`).join("")}</div>`).join("")}`;
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
    ${store.online ? `<button class="btn ghost" id="ask" ${state.asked["topic:" + tid] ? "disabled" : ""}>${state.asked["topic:" + tid] ? "Thanks, more on this soon" : "I'd like more on this topic"}</button>` : ""}`;
  $("#back").onclick = () => go("topics");
  $("#learn").onclick = () => showIntro(tid, () => startTopic(tid), "Quiz me");
  $("#quiz").onclick = () => startTopic(tid);
  if ($("#make")) $("#make").onclick = () => { state.today = {date: today(), topic: tid, startLv: L}; save(); go("today"); };
  $$(".chipbtn").forEach(b => b.onclick = () => go("topic", b.dataset.t));
  if ($("#ask") && !state.asked["topic:" + tid]) $("#ask").onclick = async () => { const b = $("#ask"); b.disabled = true; try { await requestMore(tid, "more", "More on this topic, please", "topic:" + tid); state.asked["topic:" + tid] = today(); save(); b.textContent = "Thanks, more on this soon"; } catch(e){ b.disabled = false; b.textContent = "Couldn't send. Try again."; } };
}
function renderMe(focus){
  const p = profiles[pid], s = state.stats, acc = s.answered ? Math.round(100 * s.correct / s.answered) : 0;
  const levels = Object.keys(TOPICS).map(lvlOf), best = Math.max(...levels);
  view.innerHTML = `
    <div class="row"><span class="dot big" style="background:${esc(p.color)}">${esc(p.name[0])}</span><div><h2>${esc(p.name)}</h2><span class="small muted">${s.rounds} coffee ${s.rounds === 1 ? "round" : "rounds"} · ${acc}% right</span></div></div>
    <div class="stats"><div class="stat"><b>${levels.filter(l => l >= 2).length}</b><span>topics beyond Visitor</span></div><div class="stat"><b class="word">${LEVELS[best-1]}</b><span>highest level</span></div><div class="stat"><b>${s.learned}</b><span>fixed in memory</span></div></div>
    <div class="stack" id="fbbox"><span class="eyebrow">Feedback</span>
      <p class="small muted">Ideas, problems or topics you'd like to learn about. We read everything.</p>
      <div class="chips" role="radiogroup" aria-label="Type of feedback">${[["idea","An idea"],["problem","Something's wrong"],["content","I'd like to learn about…"]].map(([k, l], i) => `<button class="chipbtn kind ${i ? "" : "on"}" data-k="${k}" role="radio" aria-checked="${i ? "false" : "true"}">${l}</button>`).join("")}</div>
      <label class="sr" for="fbtext">Your feedback</label><textarea id="fbtext" rows="4" placeholder="Write here"></textarea>
      <button class="btn" id="send" disabled>Send</button><span class="small muted" id="sent" aria-live="polite"></span></div>
    <button class="btn ghost" id="sw">Switch profile</button>
    <div class="stack"><span class="eyebrow">Home Screen</span><p class="small">iPhone: in Safari tap Share, then <b>Add to Home Screen</b>.</p></div>
    ${store.online ? "" : `<p class="banner">Progress is saved on this device only, and feedback can't be sent.</p>`}`;
  let kind = "idea";
  $$(".kind").forEach(b => b.onclick = () => { kind = b.dataset.k; $$(".kind").forEach(x => { x.classList.toggle("on", x === b); x.setAttribute("aria-checked", String(x === b)); }); });
  const ta = $("#fbtext"), send = $("#send");
  ta.oninput = () => send.disabled = !ta.value.trim() || !store.online;
  send.onclick = async () => { send.disabled = true; try { await requestMore("", kind, ta.value.trim(), ""); ta.value = ""; $("#sent").textContent = "Thank you, we've got it."; } catch(e){ send.disabled = false; $("#sent").textContent = "Couldn't send. Please try again."; } };
  $("#sw").onclick = renderProfiles;
  if (focus === "feedback") $("#fbbox").scrollIntoView();
}
function renderProfiles(){
  $("#tabs").classList.add("hidden"); $("#who").classList.add("hidden");
  const ids = Object.keys(profiles).sort((a, b) => (profiles[a].created || 0) - (profiles[b].created || 0));
  view.innerHTML = `
    <div class="stack"><h1>Who's <span class="serif">visiting?</span></h1><p class="muted">Pick your name. Everyone's progress is kept separately.</p></div>
    <div class="profiles">${ids.map(id => `<button class="prow" data-id="${id}"><span class="dot" style="background:${esc(profiles[id].color)}">${esc(profiles[id].name[0])}</span><span>${esc(profiles[id].name)}</span></button>`).join("") || `<p class="small muted">No profiles yet.</p>`}</div>
    <div class="stack"><span class="eyebrow">New profile</span><label class="sr" for="pn">Name</label><input type="text" id="pn" maxlength="24" placeholder="Name" autocomplete="off">
      <div class="swatches">${COLORS.map((c, i) => `<button class="swatch ${i ? "" : "on"}" data-c="${c}" style="background:${c}" aria-label="Colour ${i + 1}"></button>`).join("")}</div>
      <button class="btn" id="cr" disabled>Create profile</button></div>`;
  let color = COLORS[0];
  $$(".swatch").forEach(b => b.onclick = () => { color = b.dataset.c; $$(".swatch").forEach(x => x.classList.toggle("on", x === b)); });
  const inp = $("#pn"), cr = $("#cr");
  inp.oninput = () => cr.disabled = !inp.value.trim();
  cr.onclick = async () => { cr.disabled = true; const id = "p" + Date.now().toString(36) + Math.floor(Math.random() * 999); profiles[id] = {name: inp.value.trim(), color, created: Date.now()}; await store.put("profile:" + id, profiles[id]); local.set("profiles", profiles); use(id); };
  $$(".prow").forEach(b => b.onclick = () => use(b.dataset.id));
}
async function use(id){
  if (pid && state){ clearTimeout(saveTimer); await flush(); }
  pid = id; local.set("last", id);
  view.innerHTML = `<p class="muted">Opening the doors…</p>`;
  const old = await store.get("progress:" + id);
  state = old && old.v === 3 ? Object.assign(fresh(), old) : fresh(old);
  const p = profiles[id];
  $("#whoDot").style.background = p.color; $("#whoDot").textContent = p.name[0]; $("#whoName").textContent = p.name;
  $("#who").classList.remove("hidden"); $("#tabs").classList.remove("hidden");
  go("today");
}
$("#who").onclick = renderProfiles;

(async function boot(){
  try { await loadContent(); }
  catch(e){ view.innerHTML = `<p class="muted">The gallery couldn't load its collection. Check your connection and reload.</p>`; return; }
  profiles = await store.listProfiles();
  const last = local.get("last");
  if (last && profiles[last]) use(last); else renderProfiles();
})();
