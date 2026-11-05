// Brings the English rule text of data/tda.json from Version 1.0 (Sept 6, 2026) to Version 1.1 (Sept 21, 2026).
// Source: the 1.1 page of pokertda.com (archive.org copy of /view-poker-tda-rules/, 26 Oct 2026), compared rule by rule with the stored text.
// The Poker TDA forum announces 1.1 as "mostly minor edits and a few clarifications related to internal links within the rules, procedures and addendum".
// Only the rules were compared: procedures and addendum were not published on that page, so they stay at 1.0.
// Usage: node tools/patch-tda-1-1.js   (safe to run twice)
const fs = require('fs'), path = require('path');
const file = path.join(__dirname, '..', 'data', 'tda.json');
const raw = fs.readFileSync(file, 'utf8');
const d = JSON.parse(raw);

// [rule, old text, new text, note added to the box "Da sapere"]
const EDITS = [
  ['R25', 'upon floor announcement or audio signal by the tournament clocking system.', 'upon display of new level or audio signal by the tournament clocking system, or upon floor announcement if a clock display is not used.',
    'Dalla versione 1.1 il testo inglese della 25-A dice che il nuovo livello inizia quando il clock mostra il livello nuovo o suona il segnale, e con l\'annuncio del floor solo se non c\'è un clock a vista.'],
  ['R38', 'See Rules 37-D and 55-B.', 'See Rules 37-D and 55-A-2.', 'Dalla versione 1.1 il rimando del testo inglese è alla 55-A-2.'],
  ['R48', 'multiple new chips are subject to the 50% raise standard (Rule 45).', 'multiple new chips are subject to the 50% raise standard (Rules 45 and 47).', null],
  ['R48', 'if reaching the 50% standard (Rules 45 and 47), if less', 'if reaching the 50% standard, if less', null],
  ['R62', 'chip stacks (Rule 25).', 'chip stacks (Rule 27).', null],
  ['R55', 'binding if action to the OOT player does not change', 'binding if the action (the bet amount) to the OOT player does not change', 'Dalla versione 1.1 il testo inglese precisa che "azione" qui significa l\'importo della puntata.']
];

for (const [id, from, to, note] of EDITS) {
  const x = d.items[id], at = x.enText.indexOf(from);
  if (at < 0) { if (x.enText.includes(to)) continue; throw new Error(`${id}: testo non trovato`); }
  const delta = to.length - from.length, end = at + from.length;
  x.enText = x.enText.slice(0, at) + to + x.enText.slice(end);
  // keep the 2026-change highlights aligned with the text that moved
  x.enRed = x.enRed.map(([a, b]) => [a >= end ? a + delta : a, b >= end ? b + delta : (b > at ? Math.max(a, b + delta) : b)]);
  if (note && !(x.note || '').includes(note)) x.note = (x.note ? x.note + ' ' : '') + note;
}
d.version = 'TDA 2026 Rules Version 1.1, Sept 21, 2026 (regole in inglese; traduzione italiana, procedure e addendum dalla 1.0)';
const pretty = raw.startsWith('{\n');
fs.writeFileSync(file, pretty ? JSON.stringify(d, null, 2) : JSON.stringify(d));
console.log('ok:', d.version);
