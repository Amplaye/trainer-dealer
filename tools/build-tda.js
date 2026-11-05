// Builds data/tda.json from the two tdaguide.com pages saved as it.html and en.html.
// Usage: node tools/build-tda.js <folder with it.html and en.html>
// The rule text is kept word for word: only typography is cleaned (broken lines, stray characters).
const fs = require('fs');
const path = require('path');

function flight(file) {
  const html = fs.readFileSync(file, 'utf8');
  const parts = [...html.matchAll(/self\.__next_f\.push\(\[1,"((?:[^"\\]|\\.)*)"\]\)/g)].map(m => JSON.parse('"' + m[1] + '"'));
  const buf = Buffer.from(parts.join(''), 'utf8');
  const rows = {}, json = {};
  let i = 0;
  while (i < buf.length) {
    const c = buf.indexOf(58, i);
    if (c < 0) break;
    const id = buf.slice(i, c).toString().replace(/\s/g, '');
    if (buf[c + 1] === 84) {
      const comma = buf.indexOf(44, c);
      const len = parseInt(buf.slice(c + 2, comma).toString(), 16);
      rows[id] = buf.slice(comma + 1, comma + 1 + len).toString('utf8');
      i = comma + 1 + len;
    } else {
      let nl = buf.indexOf(10, c);
      if (nl < 0) nl = buf.length;
      json[id] = buf.slice(c + 1, nl).toString('utf8');
      i = nl + 1;
    }
  }
  return { rows, json };
}
function resolve(v, rows) {
  if (typeof v === 'string') { const m = v.match(/^\$([0-9a-f]+)$/); return m && rows[m[1]] !== undefined ? rows[m[1]] : v; }
  if (Array.isArray(v)) return v.map(x => resolve(x, rows));
  if (v && typeof v === 'object') { const o = {}; for (const k in v) o[k] = resolve(v[k], rows); return o; }
  return v;
}
function findDoc(node) {
  if (Array.isArray(node)) { for (const n of node) { const r = findDoc(n); if (r) return r; } return null; }
  if (node && typeof node === 'object') {
    if (Array.isArray(node.rules) && node.rules.length > 20) return node;
    for (const k in node) { const r = findDoc(node[k]); if (r) return r; }
  }
  return null;
}
function loadDoc(file) {
  const { rows, json } = flight(file);
  for (const id in json) {
    if (!json[id].includes('stableId')) continue;
    const d = findDoc(JSON.parse(json[id]));
    if (d) return resolve(d, rows);
  }
  throw new Error('dati non trovati in ' + file);
}

const ON = '', OFF = '';
// Marks the 2026 changes inside the text, then removes the marks after cleaning to get clean offsets.
function mark(item) {
  let t = item.text || '';
  const spans = [];
  for (const s of item.redSegments || []) {
    const base = s.context ? t.indexOf(s.context) : 0;
    if (base < 0 || s.startInContext == null) continue;
    spans.push([base + s.startInContext, base + s.startInContext + s.text.length]);
  }
  spans.sort((a, b) => b[0] - a[0]).forEach(([a, b]) => { t = t.slice(0, a) + ON + t.slice(a, b) + OFF + t.slice(b); });
  return t;
}
function clean(t) {
  const lines = t.split('\n').map(l => l.trim()).filter(l => l && l !== '`');
  const out = [];
  for (const line of lines) {
    const prev = out[out.length - 1];
    const plain = s => s.replace(/[]/g, '');
    const joins = prev !== undefined && !/[.:;!?)”"]$/.test(plain(prev)) && /^[a-zà-ù0-9“]/.test(plain(line)) && !/^\d{1,2}\)/.test(plain(line));
    if (joins) out[out.length - 1] = prev + ' ' + line; else out.push(line);
  }
  return out.join('\n');
}
function unmark(t) {
  const red = []; let res = '', open = -1;
  for (const ch of t) {
    if (ch === ON) open = res.length;
    else if (ch === OFF) { if (open >= 0) red.push([open, res.length]); open = -1; }
    else res += ch;
  }
  // adjacent spans read as one
  const merged = [];
  for (const r of red.sort((a, b) => a[0] - b[0])) {
    const last = merged[merged.length - 1];
    if (last && r[0] <= last[1] + 1) last[1] = Math.max(last[1], r[1]); else merged.push(r);
  }
  return { text: res, red: merged };
}
const stripTitle = t => t.replace(/^(?:RP-\d+[.:]?\s*)+/, '').replace(/^(?:(?:Regola|Rule)\s+\d+(?:-[A-Z]\d?)?[.:]?\s*)+/, '').replace(/^\d+[.:]?\s*/, '').trim();

// The Italian title of the Rule 45 addendum swallowed the first words of its own text.
function fixItem(id, lang, title, text) {
  if (id === 'I45' && lang === 'it') {
    const cut = title.indexOf('“');
    if (cut > 0) { text = title.slice(cut) + ' ' + text; title = title.slice(0, cut).replace(/[.\s]+$/, ''); }
  }
  if (id === 'R31') text = text.replace(/\n?(Giocatori presenti al tavolo \/ aventi diritto di partecipare alla mano)\s*$/, '');
  return { title, text };
}
function pack(item, id, lang) {
  const raw = fixItem(id, lang, stripTitle(item.title || ''), mark(item));
  const { text, red } = unmark(clean(raw.text));
  return { title: raw.title, text, red };
}

// Numbers still pointing at the previous edition, in the official text too: the link goes to the right rule.
const LINKFIX = { I47: { 41: 45, 43: 45 }, I49: { 43: 45 }, I53: { 51: 53 }, 'I55-A2': { 36: 38, 58: 60 }, RP12: { 49: 51 }, RP21: { 54: 56 }, R31: { 31: 32 }, R62: { 25: 27 } };

// Where the Italian translation leaves out or shifts something in the English text. Checked word by word.
const NOTES = {
  R13: 'Il testo inglese di questa regola dice anche che i dealer dovrebbero leggere e annunciare il valore delle mani allo showdown. Nella traduzione la frase sta nella 14-A.',
  R16: 'Nella 16-B l\'inglese parla di eccezione alla regola 60 ("a Rule 60 exception"), non di violazione.',
  R25: 'Il testo inglese della 25-B ha una frase in più: se un nuovo livello inizia durante il cambio dealer, il dealer in arrivo dà una mano al livello precedente.',
  R28: '"Dealer push" in inglese è il cambio dealer: il mazzo si cambia al cambio dealer, al cambio livello o come prescrive la casa.',
  R31: 'Il testo inglese aggiunge "A tie goes to the player": in caso di parità si decide a favore del giocatore.',
  R37: 'Due punti da leggere sull\'inglese. "Boxed cards" sono carte girate al contrario nel mazzo. Al punto 6 il testo parla delle prime 2 carte uscite dal mazzo oppure di altre 2 carte coperte qualunque.',
  R38: 'Il testo inglese aggiunge: i bui già messi non contano per l\'azione sostanziale.',
  R40: 'Il testo inglese precisa che tutte le carte della mano uccisa vanno nel muck.',
  R47: 'Nella 47-B l\'inglese dice: togliendo un solo gettone della denominazione più piccola, non "un qualunque gettone".',
  R59: 'L\'inglese dice minore o uguale al piatto: con il piatto esattamente a 5.000, "cinque" vale 5.000, come conferma l\'esempio.',
  R62: 'L\'inglese dice che il dealer o il floor contano su richiesta.',
  R67: 'Il testo inglese della 67-A aggiunge: se il giocatore ha puntato o rilanciato senza essere chiamato, la parte non chiamata gli viene restituita.',
  R69: 'L\'inglese è più netto: la regola one-player-to-a-hand è in vigore, non solo incoraggiata. Il punto 3 vieta di leggere ("Read") una mano non mostrata.',
  RP2: 'L\'inglese dice: solo il giocatore che in quel momento deve agire può chiedere al dealer di portare dentro le puntate.',
  I17: 'L\'inglese dice che le carte di A non restano coperte in attesa del side pot: si scoprono subito con le altre.'
};
const dir = process.argv[2];
const it = loadDoc(path.join(dir, 'it.html')), en = loadDoc(path.join(dir, 'en.html'));
const items = {}, order = { rules: [], procedures: [], illustrations: [], glossary: [] };
const put = (section, id, a, b, extra) => {
  const ia = pack(a, id, 'it'), ib = b ? pack(b, id, 'en') : null;
  items[id] = {
    id, s: section, title: ia.title, text: ia.text, red: ia.red,
    enTitle: ib ? ib.title : null, enText: ib ? ib.text : null, enRed: ib ? ib.red : [],
    isNew: section !== 'glossary' && !!(ia.red.length || (ib && ib.red.length) || (a.titleRedSegments || []).length || (b && (b.titleRedSegments || []).length)),
    ...extra
  };
  order[section].push(id);
};
it.rules.forEach((r, i) => put('rules', 'R' + r.number, r, en.rules[i], { n: r.number, cat: r.category, label: 'Regola ' + r.number }));
it.procedures.forEach((r, i) => put('procedures', 'RP' + r.number, r, en.procedures[i], { n: r.number, label: 'RP-' + r.number }));
it.illustrations.forEach((r, i) => {
  const tag = r.identifier.replace(/[^0-9A-Z-]/gi, '').replace(/^Regola/i, '');
  put('illustrations', 'I' + tag, r, en.illustrations[i], { primary: 'R' + r.primaryRule, label: 'Esempi regola ' + tag });
});
const enGloss = Object.fromEntries(en.officialGlossary.map(g => [g.stableId, g]));
it.officialGlossary.forEach(g => {
  const n = g.stableId.split('-').pop();
  put('glossary', 'G' + n, { ...g, title: g.title.replace(/:\s*$/, '') }, enGloss[g.stableId] ? { ...enGloss[g.stableId], title: enGloss[g.stableId].title.replace(/:\s*$/, '') } : null, { cat: g.category, label: 'Glossario' });
});

for (const id in NOTES) items[id].note = NOTES[id];

const cats = [];
for (const id of order.rules) if (!cats.find(c => c.name === items[id].cat)) cats.push({ name: items[id].cat, ids: [] });
for (const id of order.rules) cats.find(c => c.name === items[id].cat).ids.push(id);

const out = {
  edition: '2026', version: 'TDA 2026 Rules Version 1.0, Sept 6, 2026',
  credit: 'TDA rules used by permission of the Poker TDA, Copyright 2026, http://www.pokertda.com, All rights reserved.',
  translators: 'Traduzione italiana a cura di Fabiano Stefanini, revisione a cura di Jacopo Marcelletti',
  intro: {
    it: { rules: it.frontMatter.rules.split('\n').slice(-1)[0], procedures: it.frontMatter.procedures.split('\n').slice(-1)[0] },
    en: { rules: en.frontMatter.rules.split('\n').slice(-1)[0] }
  },
  order, cats, items, linkfix: LINKFIX
};
const dest = path.join(__dirname, '..', 'data', 'tda.json');
fs.mkdirSync(path.dirname(dest), { recursive: true });
fs.writeFileSync(dest, JSON.stringify(out));
console.log('scritto', dest, Math.round(fs.statSync(dest).size / 1024) + ' KB');
console.log(Object.fromEntries(Object.entries(order).map(([k, v]) => [k, v.length])));
console.log('illustrazioni', order.illustrations.join(' '));
console.log('novità', Object.values(items).filter(x => x.isNew).map(x => x.id).join(' '));
console.log('I45', items.I45.title, '|', items.I45.text.slice(0, 120));
console.log('R24', JSON.stringify(items.R24.text.slice(-50)));
console.log('R31', JSON.stringify(items.R31.text.slice(-60)));
console.log('R21 red', items.R21.red, JSON.stringify(items.R21.text.slice(items.R21.red[0][0], items.R21.red[0][1])));
console.log('R62 en', items.R62.enText.slice(0, 170));
const broken = Object.values(items).filter(x => /\n[a-zà-ù]/.test(x.text)).map(x => x.id);
console.log('righe spezzate rimaste', broken.join(' '));
console.log(items.R47.text);
