'use strict';
// User interface. No innerHTML anywhere: every element is built with h(), text goes in as text.
const APP_VERSION = '3.0.0';
const { CATS, SYM, TYPES, GROUPS, GEN, SLOTS, TARGET, fmt, parseNum, rv, shuffle, pick, grade, quizQ, winners, best, boardInfo } = DT;
DT.setQuiz(QUIZ);

// ---------- storage ----------
const KEY = 'trainer-dealer-v2', OLD_KEY = 'trainer-dealer-v1';
const blankStore = () => ({ v: 2, level: 'auto', focus: 'all', goal: 20, vibrate: true, lang: 'it', size: 'm', stats: {}, days: {}, srs: [], srsDropped: 0, quizSeen: {}, marks: [], runs: [], lastExport: 0, resume: null, sels: [], selPin: '', selDef: {} });
const PASS = 85, SRS_MAX = 300, BACKUP_DAYS = 30, SIZES = { m: '16px', l: '18px', xl: '20px' };
let volatile = null;
function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return Object.assign(blankStore(), JSON.parse(raw));
    const old = JSON.parse(localStorage.getItem(OLD_KEY) || 'null');
    if (old) {
      const s = blankStore();
      s.stats = old.stats || {}; s.days = old.days || {};
      if (['easy', 'normal', 'hard'].includes(old.level)) s.level = old.level;
      (old.errors || []).filter(e => ['win', 'name', 'board'].includes(e.type)).forEach(e => s.srs.push({ id: e.id, type: e.type, q: e.q, box: 0, due: 0 }));
      return s;
    }
  } catch (e) { if (volatile) return volatile; }
  return blankStore();
}
function save() { volatile = store; try { localStorage.setItem(KEY, JSON.stringify(store)); } catch (e) { /* private mode: keeps working in memory */ } }
let store = load();
const applySize = () => { document.documentElement.style.fontSize = SIZES[store.size] || SIZES.m; };
applySize();
let persisted = null;
if (navigator.storage && navigator.storage.persist) navigator.storage.persist().then(g => { persisted = g; }).catch(() => {});
let ses = null, cur = null, timer = null, lastSummary = null;

// ---------- DOM helpers ----------
const app = document.getElementById('app'), tabsEl = document.getElementById('tabs'), sheetEl = document.getElementById('sheet'), toastEl = document.getElementById('toast');
function h(tag, attrs, ...kids) {
  const el = document.createElement(tag);
  for (const k in attrs || {}) {
    const v = attrs[k];
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'value') el.value = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  const add = x => { if (x == null || x === false) return; if (Array.isArray(x)) x.forEach(add); else el.append(x); };
  kids.forEach(add);
  return el;
}
const show = (...n) => { app.replaceChildren(...n.flat(Infinity).filter(Boolean)); };
const svg = d => { const NS = 'http://www.w3.org/2000/svg', s = document.createElementNS(NS, 'svg'); s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('aria-hidden', 'true'); const p = document.createElementNS(NS, 'path'); p.setAttribute('d', d); s.append(p); return s; };
const dayKey = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const today = () => dayKey(new Date());
const isRed = c => c[1] === 'h' || c[1] === 'd';
const rl = c => c[0] === 'T' ? '10' : c[0];
const su = c => h('span', { class: `su ${isRed(c) ? 'red' : ''}` }, rl(c) + SYM[c[1]]);
// {Kd} tokens in the explanations become coloured cards.
const rich = t => String(t).split(/(\{[2-9TJQKA][shdc]\})/).map(p => /^\{..\}$/.test(p) ? su(p.slice(1, 3)) : p);
function cardEl(c, o = {}) {
  const cl = `card ${isRed(c) ? 'red' : ''} ${o.cls || ''}`;
  const kids = [h('span', { class: 'r' }, rl(c)), h('span', { class: 's' }, SYM[c[1]])];
  return o.act ? h('button', { class: cl, 'data-act': o.act, 'data-v': c, 'aria-label': rl(c) + ' di ' + DT.SUITN[c[1]] }, kids) : h('div', { class: cl }, kids);
}
const label = t => h('div', { class: 'label' }, t);
const meter = p => h('div', { class: 'meter' }, h('i', { style: `width:${Math.max(0, Math.min(100, p))}%` }));
function pos(i, kp = 1, kl = kp) {
  const t = (24 + 39 * i) * Math.PI / 180, s = Math.sin(t), c = Math.cos(t), f = x => x.toFixed(1) + '%';
  return `--px:${f(50 - 39 * s * kp)};--py:${f(50 + 41 * c * kp)};--lx:${f(50 - 44 * s * kl)};--ly:${f(50 + 38 * c * kl)}`;
}
const tableEl = (...kids) => h('div', { class: 'table' }, h('div', { class: 'felt' }), h('div', { class: 'you' }, 'TU'), kids);
function seatEl(slot, kids, o = {}) {
  return h(o.act ? 'button' : 'div', { class: `at ts ${o.cls || ''}`, style: pos(slot), 'data-act': o.act, 'data-v': o.v, 'aria-label': o.act ? `Posto ${slot + 1}` : null }, h('span', { class: 'tn' }, `Posto ${slot + 1}`), kids);
}
const backs = () => h('span', { class: 'hc' }, h('i', { class: 'cback' }), h('i', { class: 'cback' }));
const boardEl = (board, fn) => h('div', { class: 'mid' }, h('div', { class: 'tboard' }, board.map(fn || (c => cardEl(c)))));
const CHIP = { 25: '#2e9e5b', 100: '#20242b', 500: '#7b3fb5', 1000: '#e0b93c', 5000: '#d9622b', 25000: '#2f6fd0' };
function numTable(t, seatOpt) {
  const seats = t.seats.map(s => {
    const fold = s.tag === 'FOLD', out = s.tag === 'ELIMINATO', slot = s.n - 1, o = seatOpt ? seatOpt(s) : {};
    const tags = (o.tags || []).map(x => h('span', { class: 'tag' }, x));
    return [
      seatEl(slot, [fold || out || s.note ? null : backs(), s.tag && h('span', { class: `tag ${fold || out ? 'fold' : ''}` }, s.tag), s.note && h('span', { class: 'tnote' }, s.note), tags], { cls: `${s.hot ? 'hot' : ''} ${o.cls || ''}`, act: o.act, v: s.n }),
      s.bet != null && h('div', { class: 'at tb', style: pos(slot, .5, .6) }, fmt(s.bet)),
      t.button === s.n && h('div', { class: 'at dbtn', style: pos(slot + .4, .69, .68) }, 'D')
    ];
  });
  const potShown = t.pot || (cur && ['pot', 'side', 'pay'].includes(cur.type));
  return tableEl(potShown ? h('div', { class: 'mid pot' }, h('div', { class: 'potlbl' }, t.pot ? `Piatto ${fmt(t.pot)}` : 'Piatto ?')) : null, seats);
}
const chipDisc = v => h('i', { class: 'fd', style: `--c:${CHIP[v]}` });
function chipTable(stacks) {
  return tableEl(h('div', { class: 'mid' }, h('div', { class: 'stacks' }, stacks.map(s => {
    const piles = []; for (let left = s.n; left > 0; left -= 20) piles.push(Math.min(20, left));
    return h('div', { class: 'col' }, h('div', { class: 'pilerow' }, piles.map(n => h('div', { class: 'fstack' }, Array.from({ length: n }, () => chipDisc(s.v))))), h('b', null, fmt(s.v)));
  }))));
}
// Seat 1 sits bottom left and the numbers run clockwise, as on the oval table.
const seatCell = n => n === 5 ? 'grid-area:1/2' : n < 5 ? `grid-area:${5 - n}/1` : `grid-area:${n - 5}/3`;
const shortV = v => v >= 1000 ? v / 1000 + 'k' : String(v);
const zones = () => cur.a.z || cur.q.felt.z;
function pileEl(v, n, z) {
  if (!n) return null;
  const kids = [h('span', { class: 'fstack' }, Array.from({ length: n }, () => chipDisc(v))), h('b', null, shortV(v))];
  return z ? h('button', { class: 'fp', 'data-act': 'chip', 'data-z': z, 'data-v': v, 'aria-label': `Prendi una fiche da ${fmt(v)}` }, kids) : h('span', { class: 'fp' }, kids);
}
const pilesFor = chips => DT.DENOMS.map(v => pileEl(v, chips.filter(c => c === v).length));
function pilesOf(id, z, hand) {
  const left = (z[id] || []).slice();
  if (hand && hand.from === id) hand.chips.forEach(c => left.splice(left.indexOf(c), 1));
  return DT.DENOMS.map(v => pileEl(v, left.filter(c => c === v).length, id));
}
function tapChip(z, v) {
  if (cur.hand && cur.hand.from !== z) return placeHand(z);
  const hand = cur.hand || { from: z, chips: [] }, inHand = hand.chips.filter(c => c === v).length;
  if (zones()[z].filter(c => c === v).length > inHand) { hand.chips.push(v); cur.hand = hand; buzz(5); }
}
function placeHand(to) {
  const hand = cur.hand; if (!hand) return;
  cur.hand = null;
  if (to === hand.from) return;
  if (to !== 'change') { cur.a.z = DT.moveChips(zones(), hand.from, hand.chips, to); (cur.a.seq = cur.a.seq || []).push(hand.from); cur.fly = { from: hand.from, to, chips: hand.chips }; buzz(8); return; }
  const z = DT.breakChips(zones(), hand.from, hand.chips, cur.q.felt.min);
  if (JSON.stringify(z) === JSON.stringify(zones())) toast('Più piccola di così non si cambia.'); else cur.a.z = z;
}
// Tapped chips travel to where you put them. A drag does not need it: the finger already carried them.
function flyChips() {
  const { from, to, chips } = cur.fly, at = id => app.querySelector(`.zone[data-z="${id}"]`), a = at(from), b = at(to);
  cur.fly = null;
  if (!a || !b || window.matchMedia('(prefers-reduced-motion:reduce)').matches) return;
  const spot = e => { const r = e.getBoundingClientRect(); return `translate(${r.left + r.width / 2}px,${r.top + r.height / 2}px) translate(-50%,-50%)`; };
  const el = h('div', { class: 'fly fps' }, pilesFor(chips));
  document.body.append(el);
  el.animate([{ transform: spot(a) }, { transform: spot(b) }], { duration: 240, easing: 'cubic-bezier(.2,.8,.2,1)' }).onfinish = () => el.remove();
}
let drag = null, skipClick = false;
// No render here: replacing the pressed element would lose the finger on touch screens.
function liftChips() {
  const { p } = drag, z = p.dataset.z || p.dataset.grab;
  if (!cur.hand) {
    const chips = p.dataset.grab ? zones()[z] || [] : zones()[z].filter(c => c === +p.dataset.v);
    if (!chips.length) return false;
    cur.hand = { from: z, chips: chips.slice() };
  }
  drag.ghost = h('div', { class: 'ghost fps' }, pilesFor(cur.hand.chips));
  document.body.append(drag.ghost);
  (p.dataset.grab ? p.parentElement : p).classList.add('lifted');
  return true;
}
const coarse = () => window.matchMedia('(pointer:coarse)').matches;
function buzz(p) { if (store.vibrate && navigator.vibrate) navigator.vibrate(p); }
function toast(text, btn, fn) {
  toastEl.replaceChildren(h('span', null, text), btn ? h('button', { id: 'toastbtn' }, btn) : null);
  toastEl.hidden = false;
  if (btn) document.getElementById('toastbtn').onclick = fn; else setTimeout(() => { toastEl.hidden = true; }, 2600);
}

// ---------- progress ----------
function streak() {
  let n = 0; const d = new Date();
  if (!store.days[today()]) d.setDate(d.getDate() - 1);
  while (store.days[dayKey(d)]) { n++; d.setDate(d.getDate() - 1); }
  return n;
}
const dueItems = () => store.srs.filter(x => x.due <= Date.now());
const SRS_WAIT = [30 * 60e3, 864e5, 3 * 864e5, 7 * 864e5];
function accuracy(type) { const s = store.stats[type]; if (!s || !s.last || !s.last.length) return s && s.n ? s.ok / s.n : null; return s.last.reduce((a, b) => a + b, 0) / s.last.length; }
function levelFor(type) {
  if (store.level !== 'auto') return store.level;
  const s = store.stats[type], a = accuracy(type);
  if (!s || s.n < 8 || a == null) return 'normal';
  return a >= .85 ? 'hard' : a < .6 ? 'easy' : 'normal';
}
function record(type, ok, ms) {
  const s = store.stats[type] || (store.stats[type] = { n: 0, ok: 0, ms: 0, last: [] });
  s.n++; s.ms += ms; if (ok) s.ok++;
  s.last = (s.last || []).concat(ok ? 1 : 0).slice(-20);
  const d = store.days[today()] || (store.days[today()] = { n: 0, ok: 0 }); d.n++; if (ok) d.ok++;
}
function srsResult(q, type, ok, srsId) {
  if (srsId) {
    const it = store.srs.find(x => x.id === srsId); if (!it) return;
    if (ok) { it.box++; if (it.box >= SRS_WAIT.length) store.srs = store.srs.filter(x => x !== it); else it.due = Date.now() + SRS_WAIT[it.box]; }
    else { it.box = 0; it.due = Date.now() + SRS_WAIT[0]; }
  } else if (!ok) {
    store.srs.unshift({ id: Date.now() + '-' + Math.random().toString(36).slice(2, 7), type, q, box: 0, due: Date.now() + SRS_WAIT[0] });
    if (store.srs.length > SRS_MAX) {
      store.srsDropped += store.srs.length - SRS_MAX; store.srs = store.srs.slice(0, SRS_MAX);
      toast('Il ripasso è pieno: ho scartato l\'errore più vecchio.');
    }
  }
}

// ---------- sessions ----------
const FOCUS = { all: 'Tutto', p: 'Punti', c: 'Calcoli', a: 'Azione', t: 'Regole' };
function allowedTypes() { const k = Object.keys(TYPES); return store.focus === 'all' ? k : k.filter(x => TYPES[x].g === store.focus); }
function pickMix() {
  const ks = allowedTypes(), w = ks.map(k => { const a = accuracy(k), s = store.stats[k]; const base = !s || s.n < 5 || a == null ? 2 : 1 + 3 * (1 - a); return k === 'quiz' ? base * 3 : base; });
  let r = Math.random() * w.reduce((a, b) => a + b, 0);
  for (let i = 0; i < ks.length; i++) { r -= w[i]; if (r <= 0) return ks[i]; }
  return ks[0];
}
function nextQuiz(ids) {
  const pool = ids ? QUIZ.filter(x => ids.includes(x.id)) : QUIZ;
  const seen = x => { const s = store.quizSeen[x.id]; return s ? s.n - (s.n - s.ok) * 2 : 0; };
  const min = Math.min(...pool.map(seen));
  return quizQ(pick(pool.filter(x => seen(x) === min)).id);
}
function make(type, ids) { return type === 'quiz' ? nextQuiz(ids) : GEN[type](levelFor(type)); }
function start(mode, extra = {}) {
  ses = { mode, total: null, done: 0, ok: 0, ms: 0, miss: {}, log: [], exam: false, timed: false, timeouts: 0, ...extra };
  if (mode.startsWith('mix')) ses.total = +mode.slice(3);
  if (mode.startsWith('timed')) { ses.total = +mode.slice(5); ses.timed = true; }
  if (mode === 'exam') { ses.total = 20; ses.exam = true; }
  if (mode === 'review') { ses.queue = dueItems().slice(0, 20); ses.total = ses.queue.length; }
  beginPlay(); next();
}
function beginPlay() {
  clearInterval(timer);
  timer = setInterval(tick, 500);
  if (location.hash !== '#/play') location.hash = '#/play';
  view = 'play';
  setChrome();
}
// Plain sessions count up; the timed session counts down from the target and marks the question missed at zero.
function tick() {
  const t = document.getElementById('clock'); if (!t || !cur || !ses || cur.res) return;
  const s = Math.floor((Date.now() - cur.t0) / 1000);
  if (!ses.timed) { t.textContent = s + 's'; return; }
  const left = limit(cur.type) - s;
  t.textContent = Math.max(0, left) + 's'; t.className = left <= 5 ? 'late' : '';
  if (left <= 0) timeout();
}
const limit = t => TARGET[t] * (ses.sel ? DT.SEL.slack : 1);
function timeout() {
  if (!cur || cur.res) return;
  const r = grade(cur.type, cur.q, DT.solve(cur.type, cur.q));
  r.ok = false; r.timeout = true; r.steps = ['Tempo scaduto. Questa era la risposta giusta.', ...r.steps];
  ses.timeouts++;
  finishQ(r);
}
function next(sameType) {
  if (!sameType && ses.total && ses.done >= ses.total) return summary();
  let type, q, srsId = null;
  if (sameType) { type = cur.type; q = make(type); ses.total = ses.total ? ses.total + 1 : null; }
  else if (ses.mode === 'review') { const it = ses.queue.shift(); type = it.type; q = it.q; srsId = it.id; }
  else if (ses.mode === 'sel') ({ type, q } = ses.plan[ses.done]);
  else if (ses.mode === 'rule') { type = 'quiz'; q = nextQuiz(ses.ids); }
  else if (ses.mode.startsWith('mix') || ses.timed || ses.mode === 'exam') {
    const due = ses.mode !== 'exam' && !ses.timed && Math.random() < .25 ? dueItems().filter(x => !ses.log.some(l => l.srsId === x.id)) : [];
    if (due.length) { const it = pick(due); type = it.type; q = it.q; srsId = it.id; }
    else { type = pickMix(); q = make(type); }
  } else { type = ses.mode; q = make(type); }
  setCur({ type, q, srsId, a: { cards: [], seats: [], vals: {}, roles: {} }, t0: Date.now(), res: null });
  render();
  const f = app.querySelector('input:not([readonly])'); if (f && !coarse()) f.focus();
  window.scrollTo(0, 0);
  persist();
}
function setCur(c) { cur = c; cur.field = 0; cur.role = 'bb'; cur.hand = null; }
function persist() {
  if (!ses) { store.resume = null; save(); return; }
  const { mode, total, done, ok, ms, miss, exam, ids, queue, timeouts, sel } = ses;
  store.resume = { mode, total, done, ok, ms, miss, exam, timeouts, ids, sel, queue: queue ? queue.map(x => x.id) : undefined, log: ses.log.slice(sel ? 0 : -30), cur: cur ? { type: cur.type, q: cur.q, srsId: cur.srsId, t0: cur.t0 } : null };
  save();
}
function resume() {
  const r = store.resume; if (!r) return;
  ses = { ...r, timed: r.mode.startsWith('timed') || !!r.sel, timeouts: r.timeouts || 0, cur: undefined, log: r.log || [], queue: r.queue ? store.srs.filter(x => r.queue.includes(x.id)) : undefined };
  if (r.sel) { ses.plan = DT.selectionPlan(r.sel.code); ses.sel.reloads++; }
  beginPlay();
  // In the selection test the clock keeps running across a reload: reloading must not buy time.
  if (r.cur) { setCur({ ...r.cur, a: { cards: [], seats: [], vals: {}, roles: {} }, t0: r.sel ? r.cur.t0 : Date.now(), res: null }); render(); window.scrollTo(0, 0); } else next();
}
function header() {
  const info = ses.total ? `${Math.min(ses.done + (cur.res ? 0 : 1), ses.total)}/${ses.total}` : `${ses.ok}/${ses.done} giuste`;
  return h('div', { class: 'top' },
    h('button', { class: 'back', 'data-act': ses.sel ? 'selexit' : 'exit' }, ses.sel ? '‹ Esaminatore' : '‹ Esci'),
    h('div', { class: 'info' }, `${TYPES[cur.type].n} · ${info} · `, h('span', { id: 'clock' }, cur.res ? (cur.res.ms / 1000).toFixed(1) + 's' : ses.timed ? limit(cur.type) + 's' : '0s')));
}
function resultEl(r) {
  const chips = (r.rules || []).map(id => h('button', { class: 'chip', 'data-act': 'rule', 'data-v': id }, ruleLabel(id)));
  const goal = TARGET[cur.type], fast = r.ms != null && r.ms <= goal * 1000;
  return h('div', { class: `res ${r.ok ? 'good' : 'wrong'}`, role: 'status' }, h('b', { class: 't' }, r.ok ? 'Giusto' : 'Sbagliato'),
    r.ms ? h('div', { class: `time ${fast ? 'fast' : 'slow'}` }, `${(r.ms / 1000).toFixed(1)}s · obiettivo ${goal}s`) : null,
    r.steps.length > 1 ? h('ol', null, r.steps.map(s => h('li', null, rich(s)))) : h('div', null, rich(r.steps[0])),
    r.tip && h('div', { class: 'tip' }, h('b', null, 'Da ricordare: '), rich(r.tip)),
    chips.length ? h('div', { class: 'chips' }, chips) : null);
}
function footer() {
  const r = cur.res;
  if (cur.review) return [resultEl(r), h('button', { class: 'btn primary', 'data-act': 'backsum' }, 'Torna al riepilogo')];
  if (!r) return [h('div', { class: 'hint', id: 'hint' }), h('button', { class: 'btn primary', 'data-act': 'confirm' }, ses.exam ? 'Conferma e avanti' : 'Conferma')];
  const nextBtn = h('button', { class: 'btn primary', 'data-act': 'next' }, ses.total && ses.done >= ses.total ? 'Vedi il riepilogo' : 'Avanti');
  if (r.ok || ses.mode === 'review') return [resultEl(r), nextBtn];
  return [resultEl(r), h('div', { class: 'twobtn' }, h('button', { class: 'btn', 'data-act': 'same' }, 'Riprova simile'), nextBtn)];
}
function catBtns(sel, right) {
  return h('div', { class: 'seg' }, CATS.map((c, i) => {
    let k = '';
    if (right != null) k = i === right ? 'good' : (i === sel ? 'wrong' : '');
    else if (i === sel) k = 'on';
    return h('button', { class: `btn ${k}`, 'data-act': 'cat', 'data-v': i }, c);
  }));
}
function qBox(q, shown) {
  const lines = shown || q.lines || [];
  return h('div', { class: 'q' }, q.title && !q.quiz && h('b', null, q.title), q.head && h('p', null, q.head),
    q.quiz ? h('p', { class: 'qt' }, q.lines[0]) : lines.length ? h('ul', null, lines.map(l => h('li', null, l))) : null);
}
function fieldsEl(q) {
  const done = cur.res, touch = coarse();
  const f = q.fields.map((x, i) => {
    const v = cur.a.vals[i] ?? '', ok = done && parseNum(v) === x.answer;
    const cls = done ? (ok ? 'good' : 'wrong') : (touch && cur.field === i ? 'active' : '');
    return h('div', { class: 'field' }, h('label', { for: 'f' + i }, x.label),
      h('div', null, h('input', { id: 'f' + i, inputmode: touch ? 'none' : 'numeric', autocomplete: 'off', value: v, readonly: !!done || touch, class: cls, 'data-field': i }),
        done && !ok && h('span', { class: 'fix' }, fmt(x.answer))));
  });
  const pad = touch && !done ? h('div', { class: 'pad' }, ['1', '2', '3', '4', '5', '6', '7', '8', '9', '00', '0', '⌫'].map(k => h('button', { 'data-act': 'key', 'data-v': k, 'aria-label': k === '⌫' ? 'Cancella' : k }, k))) : null;
  return [f, pad];
}
const R = {
  win() {
    const { board, holes } = cur.q, done = cur.res, w = done ? winners(board, holes) : null, slots = SLOTS[holes.length];
    const seats = holes.map((hd, i) => {
      const sel = cur.a.seats.includes(i);
      let k = sel ? 'sel' : '';
      if (done) k = w.win.includes(i) ? 'win' : (sel ? 'miss' : '');
      return seatEl(slots[i], h('span', { class: 'hc' }, hd.map(c => cardEl(c))), { act: 'seat', v: i, cls: k });
    });
    return [label('Tocca chi vince, più di uno se dividono'), tableEl(boardEl(board), seats)];
  },
  name() {
    const { board, hole } = cur.q, done = cur.res, b = done ? best(board.concat(hole)) : null;
    const c = x => cardEl(x, { act: 'card', cls: done ? (b.five.includes(x) ? 'used' : '') : (cur.a.cards.includes(x) ? 'sel' : '') });
    return [label(`Tocca le 5 carte del punto (${cur.a.cards.length}/5)`), tableEl(boardEl(board, c), seatEl(4, h('span', { class: 'hc' }, hole.map(c)), { cls: 'big' })), label('Che punto è?'), catBtns(cur.a.cat, done ? b.score[0] : null)];
  },
  board() {
    const { board } = cur.q, done = cur.res, inf = done ? boardInfo(board) : null;
    const yn = (k, t) => {
      const v = cur.a[k];
      const bt = (val, l) => {
        let c = '';
        if (done) c = inf[k] === val ? 'good' : (v === val ? 'wrong' : '');
        else if (v === val) c = 'on';
        return h('button', { class: `btn ${c}`, 'data-act': 'yn', 'data-k': k, 'data-v': val ? 1 : 0 }, l);
      };
      return [label(t), h('div', { class: 'seg' }, bt(true, 'Sì'), bt(false, 'No'))];
    };
    return [label(`Siamo al ${{ 3: 'flop', 4: 'turn', 5: 'river' }[board.length]}, e conta quello che è possibile adesso`), tableEl(boardEl(board), [1, 3, 4, 5, 7].map(s => seatEl(s, backs()))), yn('paired', 'È accoppiato?'), yn('flush', 'Il colore è possibile?'), yn('straight', 'La scala è possibile?'), label('Punto massimo possibile'), catBtns(cur.a.cat, done ? inf.nut[0] : null)];
  },
  num() {
    const q = cur.q, [f, pad] = fieldsEl(q);
    return [q.table && numTable(q.table), q.stacks && chipTable(q.stacks), qBox(q, q.shown), f, pad];
  },
  felt() {
    const q = cur.q, f = q.felt, done = cur.res, z = zones(), hand = cur.hand;
    const zone = (id, title, o = {}) => {
      const n = DT.zoneSum(z[id]), w = f.want[id] || 0, right = n === w;
      return h('div', { class: `zone ${o.cls || ''} ${done ? (right ? 'good' : 'wrong') : ''} ${hand && hand.from === id ? 'from' : ''}`, style: o.style, 'data-act': 'place', 'data-z': id },
        h('button', { class: 'zh', 'data-grab': id, 'aria-label': `${title}: tocca per posare le chips, trascina per prenderle tutte` }, h('span', null, title), o.kids,
          done && h('b', null, fmt(n)), done && !right && h('span', { class: 'fix' }, fmt(w))),
        h('div', { class: 'fps' }, pilesOf(id, z, hand)));
    };
    const seats = q.table.seats.map(s =>
      zone('s' + s.n, `Posto ${s.n}`, { style: seatCell(s.n), kids: [q.table.button === s.n && h('i', { class: 'dbtn' }, 'D'), s.tag && h('span', { class: `tag ${s.tag === 'FOLD' ? 'fold' : ''}` }, s.tag)] }));
    const ids = [...new Set([...Object.keys(z), ...(done ? Object.keys(f.want) : [])])].filter(id => id[0] === 'p').sort();
    const held = hand ? h('div', { class: 'fps' }, pilesFor(hand.chips)) : h('span', { class: 'small' }, 'Niente');
    return [qBox(q),
      label('Tocca una pila per contare le chips una a una, poi tocca dove posarle. Trascina per spostare la pila intera.'),
      h('div', { class: 'felt2' }, h('div', { class: 'you' }, 'TU'), seats, h('div', { class: 'pots' }, ids.map(id => zone(id, DT.potName(+id.slice(1)), { cls: 'potz' })), f.add && !done ? h('button', { class: 'btn addpot', 'data-act': 'addpot' }, '+ Side pot') : null)),
      done ? null : h('div', { class: 'tray' }, h('div', { class: 'hand' }, h('span', { class: 'small' }, 'In mano'), held, hand ? h('button', { class: 'btn', 'data-act': 'putback' }, 'Rimetti giù') : null),
        h('button', { class: 'btn change', 'data-act': 'place', 'data-z': 'change', disabled: !hand }, 'Cambio')),
      q.fields ? fieldsEl(q) : null];
  },
  choice() {
    const q = cur.q, done = cur.res;
    const opts = q.options.map((o, i) => {
      let c = '';
      if (done) c = o.ok ? 'good' : (cur.a.opt === i ? 'wrong' : '');
      else if (cur.a.opt === i) c = 'on';
      return h('button', { class: `btn ${c}`, 'data-act': 'opt', 'data-v': i }, o.t);
    });
    return [q.table && numTable(q.table), qBox(q), h('div', { class: 'opts' }, opts)];
  },
  seat() {
    const q = cur.q, done = cur.res;
    const t = numTable(q.table, s => {
      if (s.tag === 'FOLD' && !done) return {};
      let k = cur.a.seat === s.n ? 'sel' : '';
      if (done) k = s.n === q.answer ? 'win' : (cur.a.seat === s.n ? 'miss' : '');
      return { act: 'pickseat', cls: k };
    });
    return [label(q.ask), t, qBox(q)];
  },
  roles() {
    const q = cur.q, done = cur.res, r = cur.a.roles, role = { btn: 'Bottone', sb: 'Small blind', bb: 'Big blind' };
    const t = numTable(q.table, s => {
      const tags = [];
      if (r.btn === s.n) tags.push('→ BOTTONE'); if (r.sb === s.n) tags.push('→ SB'); if (r.bb === s.n) tags.push('→ BB');
      let k = '';
      if (done) { const a = q.answer, rightHere = [a.btn, a.sb, a.bb].includes(s.n), mineHere = [r.btn, r.sb, r.bb].includes(s.n); k = rightHere ? 'win' : mineHere ? 'miss' : ''; }
      return { act: 'pickseat', cls: k, tags };
    });
    const seg = h('div', { class: 'seg' }, Object.keys(role).map(k => h('button', { class: `btn ${cur.role === k ? 'on' : ''}`, 'data-act': 'role', 'data-v': k }, role[k] + (r[k] != null ? (r[k] === 0 ? ': nessuno' : `: ${r[k]}`) : ''))));
    const none = cur.role === 'sb' && !done ? h('button', { class: 'btn wide', 'data-act': 'nosb' }, 'Nessuno small blind in questa mano') : null;
    const sol = done ? h('p', { class: 'small' }, `Giusto: bottone ${q.answer.btn}, small blind ${q.answer.sb || 'nessuno'}, big blind ${q.answer.bb}.`) : null;
    return [label('Scegli il ruolo, poi tocca il posto'), seg, none, t, qBox(q), sol];
  }
};
function render() {
  const k = DT.kindOf(cur.type, cur.q), body = (R[k] || R.num)();
  show(cur.review ? h('div', { class: 'top' }, h('button', { class: 'back', 'data-act': 'backsum' }, '‹ Riepilogo')) : header(), body, footer());
  if (cur.fly) flyChips();
}
function confirmQ() {
  if (cur.res) return;
  if (cur.q.fields) cur.q.fields.forEach((f, i) => { cur.a.vals[i] = document.getElementById('f' + i).value.trim(); });
  const r = grade(cur.type, cur.q, cur.a);
  if (!r) { document.getElementById('hint').textContent = 'Manca ancora qualcosa da rispondere.'; return; }
  finishQ(r);
}
function finishQ(r) {
  cur.hand = null;
  r.ms = Date.now() - cur.t0;
  // The selection test belongs to the candidate, not to the owner of the device: it stays out of stats and review.
  if (!ses.sel) {
    record(cur.type, r.ok, r.ms);
    if (cur.q.quiz) { const s = store.quizSeen[cur.q.id] || (store.quizSeen[cur.q.id] = { n: 0, ok: 0 }); s.n++; if (r.ok) s.ok++; }
    srsResult(cur.q, cur.type, r.ok, cur.srsId);
  }
  const area = ses.sel ? ses.plan[ses.done].area : undefined;
  ses.done++; ses.ms += r.ms; if (r.ok) ses.ok++; else ses.miss[cur.type] = (ses.miss[cur.type] || 0) + 1;
  if (!r.ok || ses.exam) ses.log.push({ type: cur.type, q: cur.q, a: JSON.parse(JSON.stringify(cur.a)), ok: r.ok, srsId: cur.srsId, area, ms: r.ms, to: !!r.timeout });
  if (!ses.exam) buzz(r.ok ? 15 : [30, 40, 30]);
  if (ses.exam) { persist(); return next(); }
  cur.res = r;
  persist();
  render();
  const x = app.querySelector('.res'); if (x) x.scrollIntoView({ block: 'nearest' });
}
function summary() {
  clearInterval(timer);
  const s = ses; lastSummary = s; ses = null; cur = null; store.resume = null;
  if (s.sel) return finishSel(s);
  const kind = s.exam ? 'exam' : s.timed ? 'timed' : null;
  if (kind && s.done) store.runs = (store.runs || []).concat({ k: kind, t: Date.now(), n: s.done, ok: s.ok, ms: s.ms, to: s.timeouts || 0 }).slice(-60);
  save();
  renderSummary();
}
const pctOf = r => r.n ? Math.round(r.ok / r.n * 100) : 0;
function runsTable(kind) {
  const rs = (store.runs || []).filter(r => r.k === kind).slice(-5).reverse();
  if (!rs.length) return null;
  return h('table', null, h('tr', null, ['Data', 'Giuste', 'Secondi a domanda', kind === 'timed' ? 'Scadute' : ''].map(x => h('th', null, x))),
    rs.map(r => h('tr', null, h('td', null, new Date(r.t).toLocaleDateString('it-IT', { day: 'numeric', month: 'numeric' })), h('td', { class: kind === 'exam' ? (pctOf(r) >= PASS ? 'fast' : 'slow') : '' }, pctOf(r) + '%'), h('td', null, (r.ms / r.n / 1000).toFixed(1)), h('td', null, kind === 'timed' ? String(r.to || 0) : ''))));
}
function renderSummary() {
  const s = lastSummary, pct = s.done ? Math.round(s.ok / s.done * 100) : 0, avg = s.done ? (s.ms / s.done / 1000).toFixed(1) : '0';
  const m = Object.keys(s.miss).sort((a, b) => s.miss[b] - s.miss[a]);
  const wrong = s.log.map((l, i) => ({ l, i })).filter(x => !x.l.ok);
  view = 'summary'; setChrome();
  const kind = s.exam ? 'exam' : s.timed ? 'timed' : null, hist = kind && runsTable(kind);
  show(h('h1', null, 'Sessione finita'), ringEl(pct, pct + '%', null, 'lg'), h('p', null, `${s.ok} giuste su ${s.done}, ${avg} secondi a domanda.`),
    s.exam ? h('p', { class: pct >= PASS ? 'verdict fast' : 'verdict slow' }, pct >= PASS ? `Promosso: la soglia è ${PASS}%.` : `Non ancora: la soglia è ${PASS}%, te ne mancano ${Math.max(1, Math.ceil(PASS / 100 * s.done) - s.ok)}.`) : null,
    s.timed ? h('p', null, s.timeouts ? `${s.timeouts} ${s.timeouts === 1 ? 'domanda scaduta' : 'domande scadute'} per il tempo.` : 'Nessuna domanda scaduta.') : null,
    hist ? [h('h2', null, s.exam ? 'Le ultime prove' : 'Le ultime sessioni a tempo'), hist] : null,
    m.length ? [h('h2', null, 'Dove hai sbagliato'), h('table', null, m.map(k => h('tr', null, h('td', null, TYPES[k].n), h('td', null, String(s.miss[k])))))] : h('p', null, 'Nessun errore.'),
    wrong.length ? [h('h2', null, 'Rivedi gli errori'), h('div', { class: 'list' }, wrong.map(({ l, i }) => h('button', { class: 'row', 'data-act': 'seelog', 'data-v': i }, h('span', { class: 'x' }, TYPES[l.type].n, h('span', { class: 'snip' }, (l.q.lines && l.q.lines[0]) || 'Vedi carte e spiegazione')))))] : null,
    wrong.length ? h('p', { class: 'small' }, 'Questi errori tornano da soli nel ripasso, a intervalli sempre più lunghi.') : null,
    h('button', { class: 'btn primary', 'data-act': 'gohome' }, 'Torna al menu'));
  window.scrollTo(0, 0);
}
// A question that timed out has no answer to grade: it still has to open, as wrong.
const reviewRes = (type, q, a) => grade(type, q, a) || { ...grade(type, q, DT.solve(type, q)), ok: false };
function seeLog(i) {
  const l = lastSummary.log[i];
  setCur({ type: l.type, q: l.q, a: l.a, res: reviewRes(l.type, l.q, l.a), review: true, t0: 0 });
  view = 'play'; setChrome(); render(); window.scrollTo(0, 0);
}

// ---------- TDA ----------
let TDA = null, tdaLoading = null, tdaTab = 'ess', tdaQuery = '';
const ESS = ['R13', 'R14', 'R15', 'R16', 'R17', 'R18', 'R19', 'R20', 'R21', 'R23', 'R24', 'R25', 'R26', 'R27', 'R32', 'R34', 'R36', 'R37', 'R38', 'R39', 'R40', 'R41', 'R42', 'R43', 'R44', 'R45', 'R46', 'R47', 'R48', 'R49', 'R51', 'R52', 'R53', 'R54', 'R55', 'R56', 'R57', 'R58', 'R59', 'R60', 'R62', 'R63', 'RP1', 'RP2', 'RP4', 'RP5', 'RP7', 'RP12', 'RP13', 'RP15', 'RP20', 'RP21', 'RP24'];
function loadTDA() {
  if (TDA) return Promise.resolve(TDA);
  if (!tdaLoading) tdaLoading = fetch('data/tda.json').then(r => r.json()).then(d => { TDA = d; return d; }).catch(e => { tdaLoading = null; throw e; });
  return tdaLoading;
}
function ruleLabel(id) {
  if (TDA && TDA.items[id]) return TDA.items[id].label;
  if (id.startsWith('RP')) return 'RP-' + id.slice(2);
  if (id.startsWith('I')) return 'Esempi regola ' + id.slice(1);
  return 'Regola ' + id.slice(1);
}
function creditEl() {
  const link = 'http://www.pokertda.com';
  return h('div', { class: 'credit' },
    h('p', null, 'TDA rules used by permission of the Poker TDA, Copyright 2026, ', h('a', { href: link, target: '_blank', rel: 'noopener' }, link), ', All rights reserved.'),
    h('p', null, 'Traduzione italiana a cura di Fabiano Stefanini, revisione a cura di Jacopo Marcelletti. ', h('a', { href: '#/info' }, 'Informazioni')));
}
const norm = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
function ruleRow(id, snippet) {
  const x = TDA.items[id], n = x.s === 'glossary' ? '' : x.s === 'illustrations' ? id.slice(1) : x.s === 'procedures' ? 'RP-' + x.n : String(x.n);
  return h('button', { class: 'row', 'data-act': 'open', 'data-v': id }, n ? h('span', { class: 'n' }, n) : null,
    h('span', { class: 'x' }, x.title, x.isNew ? h('span', { class: 'badge' }, 'NOVITÀ 2026') : null, store.marks.includes(id) ? h('span', { class: 'badge' }, '★') : null, snippet ? h('span', { class: 'snip' }, snippet) : null));
}
function searchTDA(query) {
  const words = norm(query).split(/\s+/).filter(Boolean), out = [];
  for (const id in TDA.items) {
    const x = TDA.items[id], t = norm(x.title + ' ' + x.label), body = norm(x.text + ' ' + (x.enText || ''));
    if (!words.every(w => t.includes(w) || body.includes(w))) continue;
    out.push({ id, score: words.filter(w => t.includes(w)).length * 3 + (x.s === 'rules' ? 1 : 0) });
  }
  return out.sort((a, b) => b.score - a.score).slice(0, 60);
}
function snippetFor(id, query) {
  const x = TDA.items[id], w = norm(query).split(/\s+/).filter(Boolean)[0], src = x.text, at = norm(src).indexOf(w);
  if (at < 0) return null;
  const a = Math.max(0, at - 40), b = Math.min(src.length, at + w.length + 70);
  return [a > 0 ? '…' : '', src.slice(a, at), h('mark', null, src.slice(at, at + w.length)), src.slice(at + w.length, b), b < src.length ? '…' : ''];
}
const TDA_TABS = { ess: 'Per il dealer', rules: 'Regole', procedures: 'Procedure', illustrations: 'Esempi', glossary: 'Glossario', news: 'Novità 2026', marks: 'Preferiti' };
function tdaList() {
  if (tdaQuery.trim().length >= 2) {
    const res = searchTDA(tdaQuery);
    return [h('p', { class: 'small' }, res.length ? `${res.length} ${res.length === 1 ? 'risultato' : 'risultati'}` : 'Nessun risultato.'), h('div', { class: 'list' }, res.map(r => ruleRow(r.id, snippetFor(r.id, tdaQuery))))];
  }
  if (tdaTab === 'rules') return TDA.cats.map(c => h('details', { class: 'cat' }, h('summary', null, c.name), h('div', { class: 'list' }, c.ids.map(id => ruleRow(id)))));
  if (tdaTab === 'ess') return [h('p', { class: 'small' }, 'Le regole e le procedure che usi di più quando dai le carte. Il regolamento completo sta in Regole, Procedure ed Esempi.'), h('div', { class: 'list' }, ESS.map(id => ruleRow(id)))];
  if (tdaTab === 'news') { const ids = Object.values(TDA.items).filter(x => x.isNew).map(x => x.id); return [h('p', { class: 'small' }, 'Quello che è cambiato rispetto al 2024. Dentro ogni regola le parti nuove sono evidenziate.'), h('div', { class: 'list' }, ids.map(id => ruleRow(id)))]; }
  if (tdaTab === 'marks') return store.marks.length ? h('div', { class: 'list' }, store.marks.map(id => ruleRow(id))) : h('p', null, 'Nessun preferito. Apri una regola e tocca la stella.');
  if (tdaTab === 'glossary') {
    const cats = [...new Set(TDA.order.glossary.map(id => TDA.items[id].cat))];
    return cats.map(c => h('details', { class: 'cat' }, h('summary', null, c), h('div', { class: 'list' }, TDA.order.glossary.filter(id => TDA.items[id].cat === c).map(id => ruleRow(id, TDA.items[id].text)))));
  }
  return h('div', { class: 'list' }, TDA.order[tdaTab].map(id => ruleRow(id)));
}
function renderTDAList() { const box = document.getElementById('tdalist'); if (box) box.replaceChildren(...[tdaList()].flat(Infinity).filter(Boolean)); }
function viewTDA() {
  show(h('h1', null, 'Regolamento TDA 2026'), h('p', { class: 'small' }, 'Sta tutto sul telefono e funziona anche senza rete.'), h('p', { class: 'small', id: 'tdaload' }, 'Carico il regolamento…'), h('div', { class: 'meter ind', role: 'progressbar', 'aria-label': 'Caricamento' }, h('i')));
  loadTDA().then(() => {
    if (view !== 'tda') return;
    const tabs = h('div', { class: 'seg scroll' }, Object.keys(TDA_TABS).map(k => h('button', { class: `btn ${tdaTab === k ? 'on' : ''}`, 'data-act': 'tdatab', 'data-v': k }, TDA_TABS[k])));
    show(h('h1', null, 'Regolamento TDA 2026'), h('input', { class: 'search', id: 'tdasearch', type: 'search', placeholder: 'Cerca una parola, anche "side pot" o "45"', 'aria-label': 'Cerca nel regolamento', value: tdaQuery }), tabs, h('div', { id: 'tdalist', style: 'margin-top:10px' }), creditEl());
    renderTDAList();
  }).catch(() => { if (view === 'tda') show(h('h1', null, 'Regolamento TDA 2026'), h('p', null, 'Non riesco a caricare il regolamento. Apri l\'app una volta con la rete, poi resta disponibile anche offline.')); });
}
// Finds rule references in the text so they can be tapped.
function findRefs(text, ownId) {
  const out = [], fix = (TDA.linkfix && TDA.linkfix[ownId]) || {};
  const target = n => { const m = fix[n] || n, id = 'R' + m; return TDA.items[id] && id !== ownId ? id : null; };
  for (const m of text.matchAll(/\b(?:[Rr]egol[ae]|Rules?)\s+\d{1,2}(?:-?[A-Z]\d?)?(?:(?:,\s*|\s+e\s+|,?\s+and\s+|\s*&\s*)\d{1,2}(?:-?[A-Z]\d?)?)*/g)) {
    for (const n of m[0].matchAll(/\d{1,2}(?:-?[A-Z]\d?)?/g)) {
      const num = parseInt(n[0], 10), id = target(num);
      if (id) out.push({ a: m.index + n.index, b: m.index + n.index + n[0].length, id });
    }
  }
  for (const m of text.matchAll(/RP-(\d{1,2})/g)) { const id = 'RP' + m[1]; if (TDA.items[id] && id !== ownId) out.push({ a: m.index, b: m.index + m[0].length, id }); }
  return out.sort((x, y) => x.a - y.a);
}
function ruleBody(text, red, ownId) {
  const links = findRefs(text, ownId), paras = []; let off = 0;
  for (const line of text.split('\n')) {
    const start = off, end = off + line.length, cuts = new Set([start, end]);
    red.forEach(([a, b]) => { if (a > start && a < end) cuts.add(a); if (b > start && b < end) cuts.add(b); });
    links.forEach(l => { if (l.a >= start && l.b <= end) { cuts.add(l.a); cuts.add(l.b); } });
    const pts = [...cuts].sort((x, y) => x - y), kids = [];
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1], t = text.slice(a, b), l = links.find(x => x.a === a && x.b === b), isRed = red.some(([x, y]) => a >= x && b <= y);
      let el = l ? h('a', { href: '#/r/' + l.id, 'data-act': 'ruleopen', 'data-v': l.id }, t) : t;
      if (isRed) el = h('mark', null, el);
      kids.push(el);
    }
    paras.push(h('p', { class: /^(?:[A-Z][:.)]|\d{1,2}[.)]|•|-)/.test(line) ? 'sub' : null }, kids));
    off = end + 1;
  }
  return h('div', { class: 'body' }, paras);
}
// Our own remark, kept apart from the rule text: the translation itself is never altered.
const noteEl = (x, en) => x.note && !en ? h('div', { class: 'note' }, h('b', null, 'Da sapere: '), x.note, ' Fa fede il testo inglese.') : null;
const examplesFor = id => TDA.order.illustrations.filter(x => TDA.items[x].primary === id);
const quizFor = id => QUIZ.filter(x => x.r.includes(id) || x.r.includes(id.replace(/^I/, 'R').replace(/-.*/, '')));
function ruleContent(id, inSheet) {
  const x = TDA.items[id], en = store.lang === 'en' && x.enText;
  const text = en ? x.enText : x.text, red = en ? x.enRed : x.red, title = en ? x.enTitle : x.title;
  const ex = x.s === 'rules' ? examplesFor(id) : [], qs = quizFor(id), marked = store.marks.includes(id);
  const list = TDA.order[x.s], i = list.indexOf(id), prev = list[i - 1], nxt = list[i + 1];
  return [
    h('div', { class: 'rule' }, h('div', { class: 'kicker' }, x.label, x.isNew ? h('span', { class: 'badge' }, 'NOVITÀ 2026') : null), h('h1', null, title),
      x.cat && x.s === 'rules' ? h('p', { class: 'small' }, x.cat) : null,
      h('div', { class: 'tools' },
        x.enText ? h('button', { class: 'btn', 'data-act': 'lang' }, en ? 'Italiano' : 'English') : null,
        h('button', { class: `btn ${marked ? 'on' : ''}`, 'data-act': 'mark', 'data-v': id, 'aria-pressed': marked ? 'true' : 'false' }, marked ? '★ Preferita' : '☆ Preferita'),
        qs.length && !inSheet ? h('button', { class: 'btn', 'data-act': 'rulequiz', 'data-v': id }, `Allenati (${qs.length})`) : null),
      red.length ? h('p', { class: 'small' }, 'Evidenziato: quello che è cambiato nel 2026.') : null,
      noteEl(x, en),
      ruleBody(text, red, id)),
    ex.map(e => { const y = TDA.items[e]; return h('details', { class: 'ex', open: true }, h('summary', null, 'Esempi ufficiali: ' + (en ? y.enTitle : y.title)), noteEl(y, en), ruleBody(en ? y.enText : y.text, en ? y.enRed : y.red, e)); }),
    x.primary ? h('button', { class: 'btn wide', 'data-act': 'ruleopen', 'data-v': x.primary }, 'Vai alla ' + TDA.items[x.primary].label) : null,
    !inSheet && x.s !== 'glossary' ? h('div', { class: 'pager' }, prev ? h('button', { class: 'btn', 'data-act': 'ruleopen', 'data-v': prev }, '‹ ' + TDA.items[prev].label) : h('span'), nxt ? h('button', { class: 'btn', 'data-act': 'ruleopen', 'data-v': nxt }, TDA.items[nxt].label + ' ›') : h('span')) : null,
    creditEl()
  ];
}
function viewRule(id) {
  loadTDA().then(() => {
    if (!TDA.items[id]) { location.hash = '#/tda'; return; }
    show(h('div', { class: 'top' }, h('button', { class: 'back', 'data-act': 'hback' }, '‹ Regolamento')), ruleContent(id));
    window.scrollTo(0, 0);
  });
}
function openSheet(id) {
  loadTDA().then(() => {
    if (!TDA.items[id]) return;
    sheetEl.replaceChildren(h('div', { class: 'sheetbox' }, h('div', { class: 'top' }, h('button', { class: 'back', 'data-act': 'hback' }, '‹ Torna alla domanda')), ruleContent(id, true)));
    sheetEl.hidden = false; sheetEl.scrollTop = 0;
    const b = sheetEl.querySelector('.sheetbox'); if (b) b.scrollTop = 0;
  });
}
function closeSheet() { sheetEl.hidden = true; sheetEl.replaceChildren(); }

// ---------- screens ----------
let view = 'home';
function tile(k) {
  const a = accuracy(k), s = store.stats[k];
  const pct = s && a != null ? Math.round(a * 100) : null;
  return h('button', { class: 'tile', 'data-act': 'start', 'data-v': k }, h('b', null, TYPES[k].n), h('span', null, TYPES[k].d), pct != null ? [meter(pct), h('span', null, `${pct}% giuste nelle ultime`)] : null);
}
function lastRun(kind) {
  const r = (store.runs || []).filter(x => x.k === kind).pop();
  return r ? h('span', { class: kind === 'exam' ? (pctOf(r) >= PASS ? 'fast' : 'slow') : '' }, `Ultima volta: ${pctOf(r)}%`) : null;
}
const totalAnswered = () => Object.values(store.stats).reduce((a, s) => a + s.n, 0);
const backupDue = () => totalAnswered() >= 30 && Date.now() - (store.lastExport || 0) > BACKUP_DAYS * 864e5;
const SPADE = 'M12 2C9 6 4 9.5 4 14a4 4 0 0 0 6.6 3c-.2 1.8-1 3.2-2.1 4.5h7c-1.1-1.3-1.9-2.7-2.1-4.5A4 4 0 0 0 20 14c0-4.5-5-8-8-12z';
const ringEl = (p, txt, sub, cls) => h('div', { class: `ring ${cls || ''}`, style: `--p:${Math.max(0, Math.min(100, p))}` }, h('b', null, txt), sub ? h('span', null, sub) : null);
function viewHome() {
  const keys = Object.keys(TYPES), st = streak(), d = store.days[today()], doneToday = d ? d.n : 0, due = dueItems().length, r = store.resume;
  const lv = (v, t) => h('button', { class: `btn ${store.level === v ? 'on' : ''}`, 'data-act': 'level', 'data-v': v }, t);
  const startBtn = (n, t) => h('button', { class: 'start', 'data-act': 'start', 'data-v': 'mix' + n }, h('b', null, String(n)), h('span', null, t));
  show(
    h('header', { class: 'hero' }, h('div', null, h('div', { class: 'mark' }, svg(SPADE)), h('h1', null, 'Trainer Dealer'), h('p', null, st ? `${st} ${st === 1 ? 'giorno' : 'giorni'} di fila` : 'Allenati come al tavolo')),
      ringEl(doneToday / store.goal * 100, `${doneToday}/${store.goal}`, 'oggi')),
    r ? h('button', { class: 'tile alert', style: 'margin-top:12px', 'data-act': 'resume' }, h('b', null, 'Riprendi da dove eri'), h('span', null, r.total ? `${r.done} di ${r.total} fatte` : `${r.done} fatte, ${TYPES[r.cur ? r.cur.type : 'win'].n}`)) : null,
    backupDue() ? h('button', { class: 'tile alert', style: 'margin-top:12px', 'data-act': 'export' }, h('b', null, 'Salva i tuoi progressi'), h('span', null, store.lastExport ? `Non fai il backup da ${Math.floor((Date.now() - store.lastExport) / 864e5)} giorni. Se cambi telefono o il browser pulisce i dati, li perdi.` : 'Non hai mai fatto il backup. Se cambi telefono o il browser pulisce i dati, perdi tutto.')) : null,
    h('h2', null, 'Hai un momento? Quante domande?'),
    h('div', { class: 'starts' }, startBtn(5, '2 minuti'), startBtn(10, '5 minuti'), startBtn(20, '10 minuti')),
    h('div', { class: 'seg scroll', style: 'margin-top:10px' }, Object.keys(FOCUS).map(k => h('button', { class: `btn ${store.focus === k ? 'on' : ''}`, 'data-act': 'focus', 'data-v': k }, FOCUS[k]))),
    h('div', { class: 'tiles modes', style: 'margin-top:10px' },
      h('button', { class: `tile ${due ? 'alert' : ''}`, 'data-act': 'start', 'data-v': 'review', disabled: !due }, h('b', null, 'Ripasso errori'), h('span', null, due ? `${due} da rifare adesso` : store.srs.length ? `${store.srs.length} in attesa, tornano da soli` : 'Nessun errore da rifare'),
        store.srs.length >= SRS_MAX * .9 ? h('span', { class: 'warnline' }, `Coda quasi piena (${store.srs.length}/${SRS_MAX}): poi spariscono i più vecchi`) : null),
      h('button', { class: 'tile', 'data-act': 'start', 'data-v': 'timed10' }, h('b', null, 'A tempo'), h('span', null, '10 domande con il conto alla rovescia'), lastRun('timed')),
      h('button', { class: 'tile', 'data-act': 'start', 'data-v': 'exam' }, h('b', null, 'Prova senza aiuti'), h('span', null, `20 domande, spiegazioni alla fine, si passa con ${PASS}%`), lastRun('exam'))),
    h('button', { class: 'tile selcard', 'data-act': 'gosel' }, h('b', null, 'Prova di selezione'), h('span', null, 'Per le sale: stessa prova per ogni candidato, con l\'esaminatore presente e il report da stampare')),
    ['p', 'c', 'a', 't'].map(g => [h('h2', null, GROUPS[g]), h('div', { class: 'tiles' }, keys.filter(k => TYPES[k].g === g).map(tile))]),
    h('h2', null, 'Difficoltà'),
    h('div', { class: 'seg' }, lv('auto', 'Automatica'), lv('easy', 'Facile'), lv('normal', 'Normale'), lv('hard', 'Difficile')),
    store.level === 'auto' ? h('p', { class: 'small' }, 'Sale e scende da sola in base a come vai in ogni esercizio.') : null
  );
}
function viewStats() {
  const tot = Object.values(store.stats).reduce((a, s) => [a[0] + s.n, a[1] + s.ok], [0, 0]);
  const dayCells = []; const d = new Date(); d.setDate(d.getDate() - 13);
  let max = 1; const days = [];
  for (let i = 0; i < 14; i++) { const k = dayKey(d), v = store.days[k] ? store.days[k].n : 0; days.push({ v, wd: 'DLMMGVS'[d.getDay()], k }); max = Math.max(max, v); d.setDate(d.getDate() + 1); }
  const rows = Object.keys(TYPES).map(k => {
    const s = store.stats[k], a = accuracy(k), avg = s && s.n ? s.ms / s.n / 1000 : null;
    return h('tr', null, h('td', null, TYPES[k].n), h('td', null, String(s ? s.n : 0)), h('td', null, a != null ? Math.round(a * 100) + '%' : '–'),
      h('td', { class: avg == null ? '' : avg <= TARGET[k] ? 'fast' : 'slow' }, avg == null ? '–' : `${avg.toFixed(0)}s / ${TARGET[k]}s`));
  });
  // Accuracy by quiz topic, from the per-question counters.
  const topics = {};
  QUIZ.forEach(x => { const t = topics[x.cat] || (topics[x.cat] = { tot: 0, seen: 0, n: 0, ok: 0 }), s = store.quizSeen[x.id]; t.tot++; if (s && s.n) { t.seen++; t.n += s.n; t.ok += s.ok; } });
  const topicRows = Object.keys(topics).map(c => ({ c, ...topics[c] })).filter(t => t.n).sort((a, b) => a.ok / a.n - b.ok / b.n)
    .map(t => h('tr', null, h('td', null, t.c), h('td', null, `${t.seen}/${t.tot}`), h('td', { class: t.ok / t.n >= .85 ? 'fast' : t.ok / t.n < .6 ? 'slow' : '' }, Math.round(t.ok / t.n * 100) + '%')));
  // Accuracy per week, last 8 weeks (Monday to Sunday).
  const wk = []; { const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - ((d.getDay() + 6) % 7) - 49);
    for (let i = 0; i < 8; i++) { const from = new Date(d); let n = 0, ok = 0; for (let j = 0; j < 7; j++) { const x = store.days[dayKey(d)]; if (x) { n += x.n; ok += x.ok; } d.setDate(d.getDate() + 1); } wk.push({ n, ok, lbl: `${from.getDate()}/${from.getMonth() + 1}` }); } }
  const exams = runsTable('exam'), timed = runsTable('timed');
  const weak = Object.keys(TYPES).filter(k => store.stats[k] && store.stats[k].n >= 5 && accuracy(k) != null).sort((a, b) => accuracy(a) - accuracy(b)).slice(0, 3);
  show(h('h1', null, 'Progressi'),
    h('div', { class: 'stats', style: 'margin-top:10px' },
      h('div', { class: 'stat' }, h('b', null, String(streak())), h('span', null, 'giorni di fila')),
      h('div', { class: 'stat' }, h('b', null, String(tot[0])), h('span', null, 'domande fatte')),
      h('div', { class: 'stat' }, h('b', null, tot[0] ? Math.round(tot[1] / tot[0] * 100) + '%' : '–'), h('span', null, 'giuste in tutto'))),
    h('h2', null, 'Domande al giorno, ultime 2 settimane'),
    h('div', { class: 'days' }, days.map(x => h('div', { class: `day ${x.v ? '' : 'none'}`, title: `${x.k}: ${x.v} domande` }, x.v ? h('em', null, String(x.v)) : null, h('i', { style: `height:${Math.max(3, x.v / max * 78)}%` })))),
    h('div', { class: 'daylbl' }, days.map(x => h('span', null, x.wd))),
    wk.some(x => x.n) ? [h('h2', null, 'Percentuale di giuste, per settimana'),
      h('div', { class: 'days' }, wk.map(x => h('div', { class: `day ${x.n ? '' : 'none'}`, title: `${x.lbl}: ${x.n} domande` }, x.n ? h('em', null, Math.round(x.ok / x.n * 100) + '%') : null, h('i', { style: `height:${x.n ? Math.max(3, x.ok / x.n * 78) : 3}%` })))),
      h('div', { class: 'daylbl' }, wk.map(x => h('span', null, x.lbl)))] : null,
    weak.length ? [h('h2', null, 'Dove lavorare'), h('div', { class: 'tiles' }, weak.map(tile))] : null,
    topicRows.length ? [h('h2', null, 'Quiz TDA per argomento, dal più debole'), h('table', null, h('tr', null, ['Argomento', 'Viste', 'Giuste'].map(x => h('th', null, x))), topicRows)] : null,
    exams ? [h('h2', null, `Prova senza aiuti (si passa con ${PASS}%)`), exams] : null,
    timed ? [h('h2', null, 'Sessioni a tempo'), timed] : null,
    h('h2', null, 'Ultime 20 risposte per esercizio, tempo medio e obiettivo'),
    h('table', null, h('tr', null, ['Esercizio', 'Fatte', 'Giuste', 'Tempo'].map(x => h('th', null, x))), rows));
}
let installEvent = null;
const standalone = () => window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent);
function viewSettings() {
  const goal = n => h('button', { class: `btn ${store.goal === n ? 'on' : ''}`, 'data-act': 'goal', 'data-v': n }, String(n));
  show(h('h1', null, 'Impostazioni'),
    !standalone() ? [h('h2', null, 'Installa sul telefono'),
      installEvent ? h('button', { class: 'btn primary', 'data-act': 'install' }, 'Installa l\'app') :
        h('p', null, isIOS() ? 'Su iPhone apri questa pagina con Safari, tocca Condividi e poi "Aggiungi alla schermata Home".' : 'Dal menu del browser scegli "Installa app" o "Aggiungi a schermata Home". Una volta installata funziona anche senza rete.')] : null,
    h('h2', null, 'Domande al giorno'), h('div', { class: 'seg' }, goal(10), goal(20), goal(30), goal(50)),
    h('h2', null, 'Vibrazione alla risposta'),
    h('div', { class: 'seg' }, h('button', { class: `btn ${store.vibrate ? 'on' : ''}`, 'data-act': 'vib', 'data-v': 1 }, 'Sì'), h('button', { class: `btn ${!store.vibrate ? 'on' : ''}`, 'data-act': 'vib', 'data-v': 0 }, 'No')),
    h('h2', null, 'Dimensione del testo'),
    h('div', { class: 'seg' }, [['m', 'Normale'], ['l', 'Grande'], ['xl', 'Molto grande']].map(([k, t]) => h('button', { class: `btn ${store.size === k ? 'on' : ''}`, 'data-act': 'size', 'data-v': k }, t))),
    h('h2', null, 'I tuoi dati'),
    h('p', { class: 'small' }, 'Restano solo su questo dispositivo. Per passarli su un altro esporta il file e importalo lì.'),
    h('p', { class: 'small' }, store.lastExport ? `Ultimo backup: ${new Date(store.lastExport).toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric' })}.` : 'Non hai ancora fatto nessun backup.'),
    persisted === false || (isIOS() && !standalone()) ? h('p', { class: 'small' }, isIOS() && !standalone() ? 'Su iPhone, se l\'app non è sulla schermata Home, Safari può cancellare i dati dopo qualche giorno che non la apri. Installala, oppure esporta ogni tanto.' : 'Il browser non garantisce di tenere questi dati se manca spazio: esporta ogni tanto.') : null,
    h('button', { class: 'btn wide', 'data-act': 'export' }, 'Esporta i progressi'),
    h('button', { class: 'btn wide', 'data-act': 'import' }, 'Importa i progressi'),
    h('input', { type: 'file', id: 'importfile', accept: 'application/json', hidden: true }),
    h('button', { class: 'btn wide', 'data-act': 'reset' }, 'Azzera tutto'),
    h('h2', null, 'App'),
    h('button', { class: 'btn wide', 'data-act': 'info' }, 'Informazioni e crediti'),
    h('p', { class: 'small' }, 'Versione ' + APP_VERSION));
}
function viewInfo() {
  show(h('div', { class: 'top' }, h('button', { class: 'back', 'data-act': 'hback' }, '‹ Indietro')), h('h1', null, 'Informazioni'),
    h('p', null, 'Trainer Dealer è un\'app di allenamento non ufficiale e non è affiliata al Poker TDA.'),
    h('p', null, 'Il testo inglese delle 74 regole è la 2026 Rules Version 1.1, Sept 21, 2026 (la 1.0 era del 6 settembre). Le Procedure Raccomandate, l\'Illustration Addendum e il Glossario sono ancora quelli della 1.0: la 1.1, secondo il TDA, corregge soprattutto rimandi interni, e le differenze nelle regole sono segnalate nei riquadri "Da sapere". La traduzione italiana è di Fabiano Stefanini con revisione di Jacopo Marcelletti, ed è quella della 1.0. Il testo è stato ripreso tramite TDA Guide (tdaguide.com), toccando solo la tipografia, e le regole sono state ricontrollate sul sito del TDA. Alcuni numeri di regola citati nel testo sono rimasti quelli dell\'edizione precedente: il link porta comunque alla regola giusta. I riquadri "Da sapere" non fanno parte del regolamento: segnalano dove la traduzione italiana si discosta dal testo inglese, che fa fede.'),
    h('p', null, 'Quiz e spiegazioni sono riassunti scritti per l\'allenamento: in caso di dubbio fa fede il testo ufficiale. Al tavolo decidono le regole della tua sala e il floor.'),
    h('p', null, 'La prova di selezione va fatta in sala con l\'esaminatore presente: i risultati restano su questo dispositivo, non vanno su nessun server, e l\'esito è indicativo. La decisione spetta sempre a una persona.'),
    h('p', null, 'Titoli in Playfair Display, licenza SIL Open Font License 1.1.'),
    creditEl());
  window.scrollTo(0, 0);
}
// ---------- selection test ----------
// shortcut: the PIN only keeps the candidate away from the report; results sit unencrypted in this browser. A remote or tamper-proof test needs a server.
let examiner = false, pending = null, lastRep = null;
const inputRow = (id, text, value, o) => h('div', { class: 'lab' }, h('label', { for: id }, text), h('input', { id, value: value || '', autocomplete: 'off', ...o }));
const newCode = () => Array.from({ length: 6 }, () => 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[Math.floor(Math.random() * 32)]).join('');
const val = id => document.getElementById(id).value.trim();
const dateTime = t => new Date(t).toLocaleString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
const minSec = ms => `${Math.floor(ms / 60000)} min ${Math.round(ms / 1000 % 60)} s`;
const nQ = () => DT.SEL.areas.reduce((s, a) => s + a.t.length, 0);
const nMin = () => Math.round(DT.SEL.areas.reduce((s, a) => s + a.t.reduce((x, t) => x + TARGET[t], 0), 0) / 60);
const verdictTxt = s => s.pass ? 'Sopra soglia' : s.answered < s.total ? 'Prova incompleta' : 'Sotto soglia';
function askPin(text, then) {
  const inp = h('input', { type: 'password', inputmode: 'numeric', autocomplete: 'off', 'aria-label': 'PIN esaminatore', class: 'pin' }), err = h('p', { class: 'hint' });
  const undo = h('button', { class: 'btn', type: 'button' }, 'Annulla');
  const form = h('form', null, h('b', null, text), inp, err, h('div', { class: 'twobtn' }, undo, h('button', { class: 'btn on', type: 'submit' }, 'Conferma')));
  const d = h('dialog', { class: 'pinbox' }, form);
  d.onclose = () => d.remove();
  undo.onclick = () => d.close();
  form.onsubmit = e => { e.preventDefault(); if (inp.value === store.selPin) { d.close(); then(); } else { err.textContent = 'PIN sbagliato.'; inp.value = ''; } };
  document.body.append(d); d.showModal();
}
function viewSel() {
  const top = h('div', { class: 'top' }, h('button', { class: 'back', 'data-act': 'gohome' }, '‹ Menu'));
  const intro = h('p', null, `${nQ()} situazioni da dealer in circa ${nMin()} minuti, su punti, piatti, calcoli, procedura e regolamento. Lo stesso codice dà la stessa identica prova, così i candidati si confrontano alla pari.`);
  if (!store.selPin) return show(top, h('h1', null, 'Prova di selezione'), intro, inputRow('selpin', 'Scegli il PIN dell\'esaminatore, da 4 a 8 cifre', '', { type: 'password', inputmode: 'numeric' }), h('div', { class: 'hint', id: 'hint' }), h('button', { class: 'btn primary', 'data-act': 'selsetpin' }, 'Crea il PIN'));
  if (!examiner) return show(top, h('h1', null, 'Area esaminatore'), inputRow('selpin', 'PIN esaminatore', '', { type: 'password', inputmode: 'numeric' }), h('div', { class: 'hint', id: 'hint' }), h('button', { class: 'btn primary', 'data-act': 'selenter' }, 'Entra'));
  const d = store.selDef, rows = store.sels.slice().reverse();
  show(top, h('h1', null, 'Prova di selezione'), intro,
    h('h2', null, 'Nuova prova'),
    inputRow('selname', 'Candidato', ''), inputRow('selsala', 'Sala', d.sala), inputRow('selex', 'Esaminatore', d.ex),
    h('div', { class: 'codeline' }, inputRow('selcode', 'Codice prova', d.code || newCode(), { autocapitalize: 'characters' }), h('button', { class: 'btn', 'data-act': 'selnewcode' }, 'Nuovo codice')),
    h('p', { class: 'small' }, 'Tieni lo stesso codice per tutti i candidati di una selezione, poi cambialo: chi l\'ha già fatta non deve poterla raccontare a chi arriva dopo.'),
    h('div', { class: 'hint', id: 'hint' }),
    h('button', { class: 'btn primary', 'data-act': 'selgo' }, 'Passa il dispositivo al candidato'),
    rows.length ? [h('h2', null, 'Candidati'), h('div', { class: 'list' }, rows.map(r => h('button', { class: 'row', 'data-act': 'selrep', 'data-v': r.id }, h('span', { class: 'n' }, r.score.pct + '%'), h('span', { class: 'x' }, r.name, h('span', { class: 'snip' }, `${verdictTxt(r.score)} · codice ${r.code} · ${dateTime(r.at)}`))))),
      h('button', { class: 'btn wide', 'data-act': 'selcsv' }, 'Esporta tutti per Excel')] : null);
  window.scrollTo(0, 0);
}
function selIntro() {
  view = 'selintro'; setChrome();
  show(h('header', { class: 'hero' }, h('div', null, h('div', { class: 'mark' }, svg(SPADE)), h('h1', null, 'Prova di selezione'), h('p', null, pending.sala || 'Trainer Dealer'))),
    h('h2', null, pending.name),
    h('ul', { class: 'rules' }, [`${nQ()} situazioni, circa ${nMin()} minuti.`, 'Ogni situazione ha il suo tempo: se scade, conta come errore.', 'Niente spiegazioni e niente punteggio durante la prova, e non si torna indietro.', 'Con le chips: tocca una pila per prenderle una a una e tocca dove posarle, oppure trascina la pila intera.', 'Resta nell\'app: ogni uscita finisce nel report.'].map(t => h('li', null, t))),
    h('button', { class: 'btn primary', 'data-act': 'selstart' }, 'Inizia la prova'));
  window.scrollTo(0, 0);
}
function startSel() {
  const plan = DT.selectionPlan(pending.code);
  start('sel', { total: plan.length, exam: true, timed: true, plan, sel: { ...pending, at: Date.now(), away: 0, awayMs: 0, reloads: 0 } });
  if (navigator.wakeLock) navigator.wakeLock.request('screen').catch(() => { /* the screen may dim, the test goes on */ });
}
function finishSel(s) {
  const items = s.log.map(l => ({ type: l.type, area: l.area, ok: l.ok, ms: l.ms, to: l.to, ...(l.ok ? {} : { q: l.q, a: l.a }) }));
  const rep = { id: Date.now().toString(36), ...s.sel, ver: APP_VERSION, ms: Date.now() - s.sel.at, items, score: DT.scoreSelection(items) };
  store.sels.push(rep); lastRep = rep.id; save();
  view = 'handover'; setChrome();
  show(h('header', { class: 'hero' }, h('div', null, h('div', { class: 'mark' }, svg(SPADE)), h('h1', null, s.sel.stopped ? 'Prova interrotta' : 'Prova consegnata'), h('p', null, `Grazie, ${s.sel.name}.`))),
    h('p', null, 'Ridai il dispositivo all\'esaminatore.'), h('button', { class: 'btn primary', 'data-act': 'gosel' }, 'Sono l\'esaminatore'));
  window.scrollTo(0, 0);
}
function lockedView() {
  view = 'handover'; setChrome();
  show(h('h1', null, 'Prova in corso'), h('p', null, 'La prova si è chiusa e riparte solo con l\'esaminatore. Il tempo non si è fermato e la chiusura finisce nel report.'), h('button', { class: 'btn primary', 'data-act': 'selback' }, 'Riprendi con il PIN'));
}
function viewReport(id) {
  const r = store.sels.find(x => x.id === id);
  if (!r || !examiner) { location.hash = '#/prova'; return; }
  const s = r.score, meta = [['Candidato', r.name], ['Sala', r.sala || '-'], ['Esaminatore', r.ex || '-'], ['Data', dateTime(r.at)], ['Durata', minSec(r.ms)], ['Codice prova', r.code], ['Versione app', r.ver]];
  const wrong = r.items.map((x, i) => ({ x, i })).filter(({ x }) => !x.ok);
  const events = r.away || r.reloads ? `Uscite dall'app: ${r.away} (${minSec(r.awayMs)} fuori). Chiusure e riaperture: ${r.reloads}.` : 'Nessuna uscita dall\'app durante la prova.';
  show(h('div', { class: 'top noprint' }, h('button', { class: 'back', 'data-act': 'gosel' }, '‹ Candidati')),
    h('article', { class: 'paper' },
      h('header', { class: 'phead' }, h('div', { class: 'mark' }, svg(SPADE)), h('div', null, h('b', null, 'Trainer Dealer'), h('span', null, 'Report della prova di selezione'))),
      h('dl', { class: 'meta' }, meta.map(([k, v]) => h('div', null, h('dt', null, k), h('dd', null, v)))),
      h('section', { class: 'score' }, h('div', { class: 'pct' }, s.pct + '%'), h('div', null, h('b', { class: s.pass ? 'okc' : 'noc' }, verdictTxt(s)), h('p', null, `${s.ok} giuste su ${s.total}. Soglia: ${DT.SEL.pass}% in totale e ${DT.SEL.areaMin}% in ogni area.`), r.stopped ? h('p', null, `Interrotta dall'esaminatore dopo ${s.answered} situazioni.`) : null)),
      h('h3', null, 'Per area'),
      h('div', { class: 'areas' }, s.areas.map(a => h('div', { class: 'arow' }, h('span', null, a.n), h('i', { class: 'abar', style: `--p:${a.pct}%;--m:${DT.SEL.areaMin}%` }, h('u', { class: a.pct >= DT.SEL.areaMin ? 'okb' : 'nob' })), h('b', null, `${a.ok}/${a.total}`)))),
      h('h3', null, 'Tempi e regolarità'),
      h('p', null, `Nei tempi obiettivo: ${s.inTime} su ${s.answered}. Tempo scaduto: ${s.timeouts}. ${events}`),
      h('h3', null, 'Situazione per situazione'),
      h('table', { class: 'ptable' }, h('tr', null, ['N.', 'Esercizio', 'Esito', 'Secondi'].map(x => h('th', null, x))), r.items.map((x, i) => h('tr', null, h('td', null, String(i + 1)), h('td', null, TYPES[x.type].n), h('td', { class: x.ok ? 'okc' : 'noc' }, x.ok ? 'Giusta' : x.to ? 'Tempo scaduto' : 'Sbagliata'), h('td', null, (x.ms / 1000).toFixed(1))))),
      h('section', { class: 'hands' }, h('h3', null, 'Da valutare al tavolo'), h('p', null, 'L\'app non vede le mani. Queste voci le giudica l\'esaminatore con una prova dal vivo.'),
        h('ul', { class: 'checks' }, ['Pitch delle carte', 'Taglio e conteggio delle chips', 'Gestione dal vivo di piatti e side pot', 'Ritmo del gioco', 'Tenuta e comportamento con i giocatori'].map(t => h('li', null, t))),
        h('div', { class: 'signs' }, h('span', null, 'Firma esaminatore'), h('span', null, 'Firma candidato'))),
      h('footer', null, 'L\'esito è indicativo: la decisione spetta alla sala. Strumento non ufficiale, non affiliato al Poker TDA. TDA rules used by permission of the Poker TDA, Copyright 2026, www.pokertda.com, All rights reserved.')),
    h('div', { class: 'noprint' },
      h('button', { class: 'btn primary', 'data-act': 'selprint' }, 'Stampa o salva in PDF'),
      wrong.length ? [h('h2', null, 'Rivedi gli errori'), h('div', { class: 'list' }, wrong.map(({ x, i }) => h('button', { class: 'row', 'data-act': 'seerep', 'data-v': i }, h('span', { class: 'n' }, String(i + 1)), h('span', { class: 'x' }, TYPES[x.type].n, h('span', { class: 'snip' }, x.area)))))] : null,
      h('button', { class: 'btn wide', 'data-act': 'seldel', 'data-v': r.id }, 'Elimina questo report')));
  window.scrollTo(0, 0);
}
function exportCsv() {
  // A name starting with = + - @ would run as a formula in Excel.
  const cell = x => { const t = String(x).replace(/"/g, '""'); return `"${/^[=+\-@]/.test(t) ? "'" + t : t}"`; };
  const head = ['Candidato', 'Sala', 'Esaminatore', 'Data', 'Codice', 'Punteggio %', 'Giuste', 'Totale', ...DT.SEL.areas.map(a => a.n + ' %'), 'Esito', 'Uscite dall\'app', 'Riaperture'];
  const rows = store.sels.map(r => [r.name, r.sala, r.ex, dateTime(r.at), r.code, r.score.pct, r.score.ok, r.score.total, ...r.score.areas.map(a => a.pct), verdictTxt(r.score), r.away, r.reloads]);
  const url = URL.createObjectURL(new Blob(['\ufeff' + [head, ...rows].map(x => x.map(cell).join(';')).join('\r\n')], { type: 'text/csv' }));
  const a = h('a', { href: url, download: `candidati-${today()}.csv` }); document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
function setChrome() {
  document.body.classList.toggle('play', ['play', 'selintro', 'handover', 'report'].includes(view));
  const tabs = [['home', 'Allenati', 'M4 11l8-7 8 7v9h-5v-6h-6v6H4z'], ['tda', 'TDA', 'M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3zM5 17a3 3 0 0 1 3-3h11'], ['stats', 'Progressi', 'M5 20v-7M12 20V5M19 20v-10'], ['settings', 'Impostazioni', 'M4 7h9M17 7h3M4 17h3M11 17h9M15 5v4M9 15v4']];
  tabsEl.replaceChildren(...tabs.map(([v, t, d]) => h('button', { class: view === v || (v === 'tda' && view === 'rule') ? 'on' : '', 'data-tab': v, 'aria-current': view === v ? 'page' : null }, svg(d), t)));
}
function route() {
  const p = location.hash.replace(/^#/, '') || '/';
  // While a candidate is on the test nothing leads out of it, not even the back button.
  if (ses && ses.sel && p !== '/play') { location.hash = '#/play'; return; }
  if (!ses && store.resume && store.resume.sel) return lockedView();
  const sheet = p.match(/^\/play\/r\/(.+)$/);
  if (p === '/play' || sheet) {
    if (!cur) { location.hash = '#/'; return; }
    if (view !== 'play') { view = 'play'; setChrome(); render(); }
    if (sheet) openSheet(sheet[1]); else closeSheet();
    return;
  }
  closeSheet();
  clearInterval(timer);
  if (ses) { persist(); ses = null; cur = null; }
  const r = p.match(/^\/r\/(.+)$/);
  if (r) { view = 'rule'; setChrome(); viewRule(r[1]); return; }
  const rep = p.match(/^\/prova\/r\/(.+)$/);
  if (rep) { view = 'report'; setChrome(); viewReport(rep[1]); return; }
  if (p === '/prova') { view = 'sel'; setChrome(); viewSel(); return; }
  view = { '/tda': 'tda', '/stats': 'stats', '/settings': 'settings', '/info': 'info' }[p] || 'home';
  setChrome();
  ({ tda: viewTDA, stats: viewStats, settings: viewSettings, info: viewInfo, home: viewHome })[view]();
  window.scrollTo(0, 0);
}
const go = hash => { if (location.hash === hash) route(); else location.hash = hash; };

// ---------- events ----------
function onClick(e) {
  const b = e.target.closest('[data-act],[data-tab]'); if (!b) return;
  if (b.dataset.tab) { const v = b.dataset.tab; return go(v === 'home' ? '#/' : '#/' + v); }
  const act = b.dataset.act, v = b.dataset.v;
  if (act === 'ruleopen' || act === 'rule') {
    e.preventDefault();
    return go(view === 'play' ? '#/play/r/' + v : '#/r/' + v);
  }
  switch (act) {
    case 'start': return start(v);
    case 'resume': return resume();
    case 'exit': case 'gohome': return go('#/');
    case 'hback': return history.back();
    case 'focus': store.focus = v; save(); return viewHome();
    case 'level': store.level = v; save(); return viewHome();
    case 'goal': store.goal = +v; save(); return viewSettings();
    case 'vib': store.vibrate = v === '1'; save(); return viewSettings();
    case 'size': store.size = v; save(); applySize(); return viewSettings();
    case 'confirm': return confirmQ();
    case 'next': return next();
    case 'same': return next(true);
    case 'seelog': return seeLog(+v);
    case 'backsum': { const rep = cur && cur.rep; cur = null; return rep ? go('#/prova/r/' + rep) : renderSummary(); }
    case 'gosel': return go('#/prova');
    case 'selsetpin': { const p = val('selpin'); if (!/^\d{4,8}$/.test(p)) { document.getElementById('hint').textContent = 'Servono da 4 a 8 cifre.'; return; } store.selPin = p; save(); examiner = true; return viewSel(); }
    case 'selenter': if (val('selpin') !== store.selPin) { document.getElementById('hint').textContent = 'PIN sbagliato.'; return; } examiner = true; if (lastRep) { const id = lastRep; lastRep = null; return go('#/prova/r/' + id); } return viewSel();
    case 'selnewcode': document.getElementById('selcode').value = newCode(); return;
    case 'selgo': {
      const name = val('selname'), sala = val('selsala'), ex = val('selex'), code = val('selcode').toUpperCase();
      const bad = !name ? 'Scrivi il nome del candidato.' : !/^[A-Z0-9]{4,10}$/.test(code) ? 'Il codice prova va da 4 a 10 lettere o cifre.' : '';
      if (bad) { document.getElementById('hint').textContent = bad; return; }
      store.selDef = { sala, ex, code }; save(); pending = { name, sala, ex, code }; examiner = false;
      return selIntro();
    }
    case 'selstart': return startSel();
    case 'selexit': return askPin('Interrompere la prova? Serve il PIN dell\'esaminatore.', () => { ses.sel.stopped = true; summary(); });
    case 'selback': return askPin('PIN esaminatore', resume);
    case 'selrep': return go('#/prova/r/' + v);
    case 'selcsv': return exportCsv();
    case 'selprint': return window.print();
    case 'seldel': if (confirm('Elimino questo report? Non si potrà recuperare.')) { store.sels = store.sels.filter(x => x.id !== v); save(); go('#/prova'); } return;
    case 'seerep': {
      const id = location.hash.split('/').pop(), it = store.sels.find(x => x.id === id).items[+v], a = it.a || {};
      setCur({ type: it.type, q: it.q, a: { cards: [], seats: [], vals: {}, roles: {}, ...a }, res: reviewRes(it.type, it.q, a), review: true, t0: 0, rep: id });
      view = 'play'; setChrome(); render(); window.scrollTo(0, 0); return;
    }
    case 'tdatab': tdaTab = v; tdaQuery = ''; return viewTDA();
    case 'open': return go('#/r/' + v);
    case 'lang': store.lang = store.lang === 'en' ? 'it' : 'en'; save(); return refreshRule();
    case 'mark': { const i = store.marks.indexOf(v); if (i >= 0) store.marks.splice(i, 1); else store.marks.push(v); save(); return refreshRule(); }
    case 'rulequiz': { const qs = quizFor(v).map(x => x.id); return start('rule', { ids: qs, total: qs.length }); }
    case 'info': return go('#/info');
    case 'install': if (installEvent) { installEvent.prompt(); installEvent.userChoice.finally(() => { installEvent = null; viewSettings(); }); } return;
    case 'export': return exportData();
    case 'import': return document.getElementById('importfile').click();
    case 'reset': if (confirm('Azzero statistiche, errori e preferiti su questo dispositivo?')) { const keep = store; store = blankStore(); store.goal = keep.goal; store.sels = keep.sels; store.selPin = keep.selPin; store.selDef = keep.selDef; save(); viewSettings(); toast('Fatto, si riparte da zero.'); } return;
  }
  if (!cur || cur.res) return;
  if (act === 'seat') { const i = +v, s = cur.a.seats; s.includes(i) ? s.splice(s.indexOf(i), 1) : s.push(i); }
  if (act === 'card') { const s = cur.a.cards; if (s.includes(v)) s.splice(s.indexOf(v), 1); else if (s.length < 5) s.push(v); }
  if (act === 'cat') cur.a.cat = +v;
  if (act === 'yn') cur.a[b.dataset.k] = v === '1';
  if (act === 'opt') cur.a.opt = +v;
  if (act === 'pickseat') {
    if (TYPES[cur.type].k === 'roles') { cur.a.roles[cur.role] = +v; const order = ['bb', 'sb', 'btn']; const nx = order.find(k => cur.a.roles[k] == null); if (nx) cur.role = nx; }
    else cur.a.seat = +v;
  }
  if (act === 'role') cur.role = v;
  if (act === 'nosb') { cur.a.roles.sb = 0; const nx = ['bb', 'btn'].find(k => cur.a.roles[k] == null); if (nx) cur.role = nx; }
  if (act === 'key') return padKey(v);
  if (act === 'chip') tapChip(b.dataset.z, +v);
  if (act === 'place') placeHand(b.dataset.z);
  if (act === 'putback') cur.hand = null;
  if (act === 'addpot') { const z = cur.a.z = JSON.parse(JSON.stringify(zones())); z['p' + Object.keys(z).filter(k => k[0] === 'p').length] = []; }
  render();
}
function padKey(k) {
  const el = document.getElementById('f' + cur.field); if (!el) return;
  const digits = el.value.replace(/\D/g, '');
  const nd = k === '⌫' ? digits.slice(0, -1) : (digits + k).replace(/^0+(?=\d)/, '').slice(0, 9);
  el.value = nd ? fmt(nd) : '';
  cur.a.vals[cur.field] = el.value;
}
function refreshRule() {
  if (view === 'rule') { const m = location.hash.match(/^#\/r\/(.+)$/); if (m) viewRule(m[1]); }
  const s = location.hash.match(/^#\/play\/r\/(.+)$/); if (s) openSheet(s[1]);
}
function exportData() {
  store.lastExport = Date.now(); save();
  const data = JSON.stringify({ ...store, resume: null });
  const url = URL.createObjectURL(new Blob([data], { type: 'application/json' }));
  const a = h('a', { href: url, download: `trainer-dealer-${today()}.json` }); document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  if (view === 'home') viewHome(); else if (view === 'settings') viewSettings();
  toast('File salvato.');
}
function importData(file) {
  const fr = new FileReader();
  fr.onload = () => {
    try {
      const d = JSON.parse(fr.result);
      if (d.v !== 2 || typeof d.stats !== 'object') throw new Error('formato');
      store = Object.assign(blankStore(), d); save(); viewSettings(); toast('Progressi importati.');
    } catch (e) { toast('Questo file non è un backup del trainer.'); }
  };
  fr.readAsText(file);
}
document.addEventListener('click', e => { if (skipClick) { skipClick = false; e.stopPropagation(); } }, true);
document.addEventListener('click', onClick);
let leftAt = 0;
document.addEventListener('visibilitychange', () => {
  if (!ses || !ses.sel) return;
  if (document.hidden) { leftAt = Date.now(); ses.sel.away++; } else if (leftAt) { ses.sel.awayMs += Date.now() - leftAt; leftAt = 0; }
  persist();
});
document.addEventListener('pointerdown', e => {
  if (!cur || cur.res || !cur.q.felt) return;
  const p = e.target.closest('[data-grab],[data-act=chip]');
  if (p) drag = { id: e.pointerId, p, x: e.clientX, y: e.clientY, ghost: null, had: cur.hand };
});
document.addEventListener('pointermove', e => {
  if (!drag || e.pointerId !== drag.id) return;
  if (!drag.ghost && (Math.hypot(e.clientX - drag.x, e.clientY - drag.y) < 8 || !liftChips())) return;
  drag.ghost.style.transform = `translate(${e.clientX}px,${e.clientY}px) translate(-50%,-50%)`;
});
document.addEventListener('pointerup', e => {
  if (!drag || e.pointerId !== drag.id) return;
  const d = drag; drag = null; if (!d.ghost) return;
  d.ghost.remove(); skipClick = true; setTimeout(() => { skipClick = false; });
  if (!cur || cur.res) return;
  const t = document.elementFromPoint(e.clientX, e.clientY), to = t && t.closest('[data-z]');
  if (to) placeHand(to.dataset.z); else cur.hand = d.had;
  cur.fly = null;
  render();
});
document.addEventListener('pointercancel', () => { if (!drag) return; if (drag.ghost) { drag.ghost.remove(); if (cur) { cur.hand = drag.had; render(); } } drag = null; });
document.addEventListener('input', e => {
  if (e.target.id === 'tdasearch') { tdaQuery = e.target.value; renderTDAList(); return; }
  if (e.target.dataset.field != null) {
    const d = e.target.value.replace(/\D/g, '').slice(0, 9);
    e.target.value = d ? fmt(d.replace(/^0+(?=\d)/, '')) : '';
    cur.a.vals[+e.target.dataset.field] = e.target.value;
  }
});
document.addEventListener('focusin', e => {
  if (cur && e.target.dataset && e.target.dataset.field != null && coarse()) {
    cur.field = +e.target.dataset.field;
    app.querySelectorAll('.field input').forEach((x, i) => x.classList.toggle('active', i === cur.field && !cur.res));
  }
});
document.addEventListener('change', e => { if (e.target.id === 'importfile' && e.target.files[0]) importData(e.target.files[0]); });
document.addEventListener('keydown', e => {
  if (view !== 'play' || !cur || !sheetEl.hidden || e.target.closest('dialog')) return;
  if (e.key === 'Enter' && e.target.tagName !== 'BUTTON') { e.preventDefault(); if (cur.review) return; cur.res ? next() : confirmQ(); return; }
  if (TYPES[cur.type].k === 'choice' && !cur.res && /^[1-9]$/.test(e.key) && e.target.tagName !== 'INPUT') { const i = +e.key - 1; if (cur.q.options[i]) { cur.a.opt = i; render(); } }
});
window.addEventListener('hashchange', route);
window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); installEvent = e; if (view === 'settings') viewSettings(); });

// ---------- offline ----------
if ('serviceWorker' in navigator && window.isSecureContext) {
  navigator.serviceWorker.register('sw.js').then(reg => {
    const offer = w => toast('C\'è una versione nuova.', 'Aggiorna', () => { toastEl.hidden = true; w.postMessage('skipWaiting'); });
    if (reg.waiting && navigator.serviceWorker.controller) offer(reg.waiting);
    reg.addEventListener('updatefound', () => {
      const w = reg.installing; if (!w) return;
      w.addEventListener('statechange', () => { if (w.state === 'installed' && navigator.serviceWorker.controller) offer(w); });
    });
  }).catch(() => { /* still works online */ });
  // The very first install also fires controllerchange: reloading then would drop the question on screen.
  const hadController = !!navigator.serviceWorker.controller;
  let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => { if (hadController && !reloading) { reloading = true; location.reload(); } });
}
loadTDA().catch(() => { /* retried when the TDA screen opens */ });
route();
