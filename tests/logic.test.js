// node tests/logic.test.js
const assert = require('assert'), path = require('path'), fs = require('fs');
const L = require('../js/logic.js'), QUIZ = require('../js/quiz.js');
L.setQuiz(QUIZ);
const TDA = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'tda.json'), 'utf8'));
let pass = 0;
const ok = (name, fn) => { fn(); pass++; console.log('ok  ', name); };
const LEVELS = ['easy', 'normal', 'hard'];
const q5 = s => s.split(' ');

ok('frequenze esatte su tutte le 2.598.960 mani', () => {
  const d = []; for (const r of L.RANKS) for (const s of L.SUITS) d.push(r + s);
  const f = Array(9).fill(0);
  for (let a = 0; a < 52; a++) for (let b = a + 1; b < 52; b++) for (let c = b + 1; c < 52; c++) for (let e = c + 1; e < 52; e++) for (let g = e + 1; g < 52; g++)
    f[L.eval5([d[a], d[b], d[c], d[e], d[g]])[0]]++;
  assert.deepStrictEqual(f, [1302540, 1098240, 123552, 54912, 10200, 5108, 3744, 624, 40]);
});

const w = (b, ...hs) => L.winners(q5(b), hs.map(q5)).win;
ok('trappole di lettura', () => {
  assert.deepStrictEqual(w('Ks Kh Qd Qc 2s', 'Ah 3d', 'Ad 9c'), [0, 1]);
  assert.deepStrictEqual(w('Ks Kh Qd Qc 2s', '7h 7d', 'Ad 2c'), [1]);
  assert.deepStrictEqual(w('5s 6h 7d 8c 9s', 'Ah Kd', '2c 3c'), [0, 1]);
  assert.deepStrictEqual(w('5s 6h 7d 8c 9s', 'Th Kd', '2c 3c'), [0]);
  assert.deepStrictEqual(w('Ah Kh 9h 6h 3h', 'Qh Kc', '2h Ks'), [0]);
  assert.deepStrictEqual(w('Ah Kh 9h 6h 3h', '2h Kc', '2s Ks'), [0, 1]);
  assert.deepStrictEqual(w('8s 8h 8d Ks Kh', 'Kd 2c', 'Ah Ad'), [0]);
  assert.deepStrictEqual(w('9s 9h 9d 9c Ks', 'Ah 2d', 'Qc Qd'), [0]);
  assert.deepStrictEqual(w('9s 9h 9d 9c Ks', '2h 3d', 'Qc Qd'), [0, 1]);
  assert.strictEqual(L.eval5(q5('As 2h 3d 4c 5s'))[1], 5);
  assert.strictEqual(L.eval5(q5('Qs Kh Ad 2c 3s'))[0], 0);
  assert.strictEqual(L.describe(L.eval5(q5('Ts Js Qs Ks As'))), 'Scala reale');
});

const hasFlush = cs => ['s', 'h', 'd', 'c'].some(s => cs.filter(c => c[1] === s).length >= 5);
const hasStraight = cs => {
  const v = new Set(cs.map(c => L.RANKS.indexOf(c[0]) + 2)); if (v.has(14)) v.add(1);
  for (let lo = 1; lo <= 10; lo++) { let all = true; for (let x = lo; x < lo + 5; x++) if (!v.has(x)) all = false; if (all) return true; }
  return false;
};
ok('leggi il board: flag contro enumerazione di tutte le mani', () => {
  for (let i = 0; i < 300; i++) {
    const b = L.GEN.board(['normal', 'hard'][i % 2]).board, inf = L.boardInfo(b);
    const d = L.deckMinus(b); let fl = false, st = false;
    for (let x = 0; x < d.length; x++) for (let y = x + 1; y < d.length; y++) { const cs = b.concat([d[x], d[y]]); fl = fl || hasFlush(cs); st = st || hasStraight(cs); }
    assert.strictEqual(inf.flush, fl, 'flush ' + b); assert.strictEqual(inf.straight, st, 'straight ' + b);
  }
});

ok('side pot: conservazione e simulazione fiche per fiche', () => {
  for (let i = 0; i < 20000; i++) {
    const pl = L.sideScenario(LEVELS[i % 3]);
    const order = pl.filter(p => !p.folded).map(p => p.name).sort(() => Math.random() - .5);
    const { pay } = L.payouts(pl, order.map(n => [n]), 1, pl.step);
    assert.strictEqual(Object.values(pay).reduce((a, b) => a + b, 0), pl.reduce((s, p) => s + p.c, 0));
    const exp = {}; pl.forEach(p => exp[p.name] = 0);
    const max = Math.max(...pl.map(p => p.c));
    for (let lvl = 0; lvl < max; lvl += 100) {
      const inn = pl.filter(p => p.c > lvl), el = inn.filter(p => !p.folded);
      exp[order.find(n => el.some(p => p.name === n))] += inn.length * 100;
    }
    assert.deepStrictEqual(pay, exp);
  }
});
ok('side pot con pareggi: conservazione e multipli della fiche', () => {
  for (let i = 0; i < 20000; i++) {
    const pl = L.sideScenario(LEVELS[1 + i % 2]);
    const o = pl.filter(p => !p.folded).map(p => p.name).sort(() => Math.random() - .5);
    const { pay } = L.payouts(pl, [[o[0], o[1]], ...o.slice(2).map(n => [n])], pl[0].n, pl.step);
    assert.strictEqual(Object.values(pay).reduce((a, b) => a + b, 0), pl.reduce((s, p) => s + p.c, 0));
    Object.values(pay).forEach(v => assert.strictEqual(v % pl.step, 0));
  }
});
ok('side pot: esempio a mano e regola 17 Esempio 3', () => {
  const r = L.computePots([{ name: 'A', c: 3000 }, { name: 'B', c: 7500 }, { name: 'C', c: 12000 }]);
  assert.deepStrictEqual(r.pots.map(p => p.amount), [9000, 9000]);
  assert.strictEqual(r.refund.amount, 4500); assert.strictEqual(r.refund.name, 'C');
  const e = L.computePots([{ name: 'A', c: 700 }, { name: 'B', c: 1700 }, { name: 'C', c: 1700 }]);
  assert.deepStrictEqual(e.pots.map(p => p.amount), [2100, 2000]);
});
ok('fiche dispari: somma e sinistra del bottone', () => {
  const a = L.splitPot(12500, 500, [2, 7], 5); assert.strictEqual(a.pay[7], 6500); assert.strictEqual(a.pay[2], 6000);
  const b = L.splitPot(1100, 100, [1, 9], 9); assert.strictEqual(b.pay[1], 600); assert.strictEqual(b.pay[9], 500);
  const c = L.splitPot(1100, 100, [3, 4, 5], 4); assert.strictEqual(c.pay[5], 400); assert.strictEqual(c.pay[3], 400); assert.strictEqual(c.pay[4], 300);
  const u = L.splitPot(108500, 500, [3, 7], 8); assert.strictEqual(u.pay[3], 54500); assert.strictEqual(u.pay[7], 54000);
});
ok('regole 45, 46, 47, 63: gli esempi ufficiali del TDA', () => {
  const c = (C, R, chips) => { const k = L.classifyPush(C, R, chips); return k.kind + ':' + k.total + ':' + k.back; };
  assert.strictEqual(c(1100, 700, [500, 1000]), 'call:1100:400');            // 47-A Es. 1
  assert.strictEqual(c(1200, 1200, [1000, 1000]), 'call:1200:800');          // Addendum 47 Es. 1-A
  assert.strictEqual(c(1100, 600, [500, 1000]), 'call:1100:400');            // Addendum 47 Es. 1-B
  assert.strictEqual(c(1100, 600, [1000, 100, 100, 100, 100, 100]), 'forced:1700:0'); // Es. 2
  assert.strictEqual(c(1100, 600, [1000, 100, 100, 100]), 'call:1100:200');  // Es. 3
  assert.strictEqual(c(1400, 1400, [1000, 500, 500, 500]), 'forced:2800:0'); // Es. 4-A
  assert.strictEqual(c(1400, 1400, [1000, 500, 500]), 'call:1400:600');      // Es. 4-B
  assert.strictEqual(c(325, 325, [500, 25]), 'forced:650:0');                // regola 63
  assert.strictEqual(c(1000, 1000, [1000, 100, 100, 100, 100]), 'call:1000:400'); // 45-A: 1.400 è un call
  assert.strictEqual(c(1100, 600, [5000]), 'call:1100:3900');                // regola 46
});
const nums = s => (s.match(/\d[\d.]*\d|\d/g) || []).map(x => L.parseNum(x));
ok('rilancio minimo ricalcolato dal testo della domanda', () => {
  for (let i = 0; i < 30000; i++) {
    const q = L.GEN.raise(LEVELS[i % 3]), bb = nums(q.head)[1], a = q.fields[0].answer, t = q.lines.join(' '), n = nums(t);
    let exp;
    if (/tutti chiamano/.test(t)) exp = 2 * bb;
    else if (/il primo va all-in/.test(t)) { exp = n[0] + bb; assert(n[0] > bb && n[0] < 2 * bb, t); }
    else if (n.length === 3) { exp = n[2] + n[0]; assert(n[1] - n[0] < n[0] && n[2] - n[1] < n[0], t); }
    else if (/Preflop/.test(t) && n.length === 1) exp = n[0] + (n[0] - bb);
    else if (/Preflop/.test(t) && /incompleto/.test(t)) { exp = n[1] + (n[0] - bb); assert(n[1] - n[0] < n[0] - bb && n[1] > n[0], t); }
    else if (/Preflop/.test(t)) { exp = n[1] + (n[1] - n[0]); assert(n[1] - n[0] >= n[0] - bb, t); }
    else if (n.length === 1) exp = 2 * n[0];
    else if (/incompleto/.test(t)) { exp = n[1] + n[0]; assert(n[1] - n[0] < n[0] && n[1] > n[0], t); }
    else { exp = n[1] + (n[1] - n[0]); assert(n[1] >= 2 * n[0], t); }
    assert.strictEqual(a, exp, t);
  }
});
ok('bui e bottone: controllo indipendente del dead button', () => {
  for (let i = 0; i < 20000; i++) {
    const q = L.GEN.blinds(), t = q.table, seats = t.seats.map(s => s.n);
    const sb = t.seats.find(s => s.tag === 'SB' || (s.tag === 'ELIMINATO' && L.seatAt(t.button, 1) === s.n)).n;
    const bb = L.seatAt(t.button, 2), out = (t.seats.find(s => s.tag === 'ELIMINATO') || {}).n;
    assert.strictEqual(sb, L.seatAt(t.button, 1));
    let nx = bb; do { nx = L.seatAt(nx, 1); } while (!seats.includes(nx) || nx === out);
    assert.deepStrictEqual(q.answer, { btn: sb, sb: out === bb ? 0 : bb, bb: nx });
    assert.notStrictEqual(q.answer.bb, bb);
  }
});
ok('BB ante corto: prima il buio', () => {
  for (let i = 0; i < 5000; i++) {
    const q = L.GEN.bbante(), s = nums(q.lines[0])[0], bb = nums(q.head)[1], [b, a] = q.fields.map(f => f.answer);
    assert.strictEqual(b + a, s); assert.strictEqual(b, Math.min(s, bb)); assert(s < 2 * bb);
  }
});
ok('riapertura dei rilanci: ricontrollo col testo', () => {
  for (let i = 0; i < 20000; i++) {
    const q = L.GEN.reopen(), yes = q.options.find(o => o.t.startsWith('Sì')).ok;
    assert.strictEqual(q.options.filter(o => o.ok).length, 1);
    const t = q.lines.join(' '), n = nums(t.replace(/[Pp]osto \d/g, ''));
    if (q.kind === 'preBB') assert.strictEqual(yes, true, t);
    else if (q.kind === 'pre' || q.kind === 'backA') assert.strictEqual(yes, false, t);
    else if (q.kind === 'backA2') assert.strictEqual(yes, n[2] - n[0] >= n[0], t);
    else if (q.kind === 'caller') { assert.strictEqual(yes, false, t); assert(n[2] - n[1] < n[0], t); }
    else { // caller2: the raiser must itself be allowed to raise (regola 49, Esempio 1-B)
      assert.strictEqual(q.kind, 'caller2'); assert.strictEqual(yes, true, t);
      assert(n[2] - n[0] >= n[0], 'rilancio illegale: ' + t); assert.strictEqual(n[3], n[2] + n[0], t);
    }
  }
});
ok('push senza puntate: mai sotto il minimo', () => {
  for (let i = 0; i < 40000; i++) {
    const q = L.GEN.push('hard');
    if (!/nessuno ha ancora puntato/.test(q.head)) continue;
    const bb = nums(q.head)[1], v = nums(q.lines[0].replace(/^.*gettone da /, ''))[0];
    assert(v > bb, 'puntata sotto il minimo: ' + q.head + q.lines[0]);
  }
});

function rightAnswer(type, q) {
  const k = L.kindOf(type, q);
  if (k === 'felt') return L.solve(type, q);
  if (k === 'win') return { seats: L.winners(q.board, q.holes).win };
  if (k === 'name') { const b = L.best(q.board.concat(q.hole)); return { cat: b.score[0], cards: b.five }; }
  if (k === 'board') { const i = L.boardInfo(q.board); return { paired: i.paired, flush: i.flush, straight: i.straight, cat: i.nut[0] }; }
  if (k === 'num') return { vals: q.fields.map(f => String(f.answer)) };
  if (k === 'choice') return { opt: q.options.findIndex(o => o.ok) };
  if (k === 'seat') return { seat: q.answer };
  return { roles: q.answer };
}
function wrongAnswer(type, q) {
  const a = rightAnswer(type, q), k = L.kindOf(type, q);
  if (k === 'felt') return { ...a, z: { ...a.z, p0: [...a.z.p0, 100] } };
  if (k === 'win') return { seats: a.seats.includes(0) && a.seats.length === 1 ? [1] : [0] };
  if (k === 'name' || k === 'board') return { ...a, cat: (a.cat + 1) % 9 };
  if (k === 'num') return { vals: q.fields.map(f => String(f.answer + 100)) };
  if (k === 'choice') return { opt: q.options.findIndex(o => !o.ok) };
  if (k === 'seat') return { seat: q.answer === 9 ? 1 : q.answer + 1 };
  return { roles: { ...a.roles, bb: a.roles.bb === 9 ? 1 : a.roles.bb + 1 } };
}
const known = id => !!TDA.items[id];
ok('ogni esercizio: dati validi, voto giusto, spiegazione completa', () => {
  for (const lv of LEVELS) for (const type of Object.keys(L.GEN)) for (let i = 0; i < (type === 'board' ? 150 : 1200); i++) {
    const q = JSON.parse(JSON.stringify(L.GEN[type](lv))), js = JSON.stringify(q);
    assert(!/undefined|NaN|\bnull\b/.test(js), type + ' ' + js);
    assert.strictEqual(L.grade(type, q, {}), null, 'senza risposta ' + type);
    const r = L.grade(type, q, rightAnswer(type, q));
    assert.strictEqual(r.ok, true, 'giusta ' + type + ' ' + js);
    assert.strictEqual(L.grade(type, q, wrongAnswer(type, q)).ok, false, 'sbagliata ' + type + ' ' + js);
    assert(r.steps.length >= 1 && r.steps.every(s => typeof s === 'string' && s.trim().length > 3), 'passi ' + type + js);
    assert(!/undefined|NaN|\[object/.test(r.steps.join(' ') + (r.tip || '')), 'testo ' + type + r.steps);
    assert(r.rules.length && r.rules.every(known), 'regole ' + type + ' ' + r.rules);
    if (q.board) {
      const cs = [...q.board, ...(q.hole || []), ...(q.holes || []).flat()];
      assert.strictEqual(new Set(cs).size, cs.length, 'carte doppie ' + js);
      assert(cs.every(c => /^[2-9TJQKA][shdc]$/.test(c)));
    }
    if (q.fields) q.fields.forEach(f => assert(Number.isInteger(f.answer) && f.answer >= 0, js));
    if (q.options) { assert(q.options.filter(o => o.ok).length === 1 && new Set(q.options.map(o => o.t)).size === q.options.length, 'opzioni ' + js); }
    if (q.table) {
      const ns = q.table.seats.map(s => s.n);
      assert.strictEqual(new Set(ns).size, ns.length, 'posti doppi ' + js);
      assert(ns.every(n => n >= 1 && n <= 9));
      if (q.table.button) assert(ns.includes(q.table.button), 'bottone ' + js);
    }
    if (L.TYPES[type].k === 'seat') assert(q.table.seats.some(s => s.n === q.answer && s.tag !== 'FOLD'), 'risposta ' + js);
  }
});
ok('chi parla: controllo indipendente', () => {
  for (let i = 0; i < 20000; i++) {
    const q = L.GEN.order('hard'), seats = q.table.seats.map(s => s.n).sort((a, b) => a - b), b = q.table.button;
    const next = from => { let s = from; do { s = L.seatAt(s, 1); } while (!seats.includes(s)); return s; };
    if (seats.length === 2) assert.strictEqual(q.answer, /Preflop/.test(q.lines[0]) ? b : next(b));
    else if (/Preflop/.test(q.head)) assert.strictEqual(q.answer, next(next(next(b))));
    else { let s = b; do { s = next(s); } while (q.table.seats.find(x => x.n === s).tag === 'FOLD'); assert.strictEqual(q.answer, s); }
  }
});
ok('chi mostra: controllo indipendente', () => {
  for (let i = 0; i < 20000; i++) {
    const q = L.GEN.show('hard'), t = q.lines.join(' '), s = q.table;
    if (/rilancia/.test(t)) assert.strictEqual(q.answer, s.seats.find(x => x.tag === 'RILANCIA').n);
    else if (/Al river il posto \d punta/.test(t)) assert.strictEqual(q.answer, s.seats.find(x => x.tag === 'PUNTA').n);
    else {
      const seats = s.seats.map(x => x.n); let c = s.button;
      do { do { c = L.seatAt(c, 1); } while (!seats.includes(c)); } while (s.seats.find(x => x.n === c).tag === 'FOLD');
      assert.strictEqual(q.answer, c);
    }
  }
});
ok('quiz TDA: struttura e rimandi', () => {
  const ids = new Set();
  QUIZ.forEach(x => {
    assert(!ids.has(x.id), 'id doppio ' + x.id); ids.add(x.id);
    assert(x.a.length >= 3 && new Set(x.a).size === x.a.length, 'risposte ' + x.id);
    assert(x.r.length && x.r.every(known), 'rimando ' + x.id + ' ' + x.r);
    assert(x.q.length > 10 && x.why.length > 10 && x.cat);
  });
  console.log('     domande:', QUIZ.length);
});
ok('chips sul tavolo: si conservano, il cambio arriva a ogni importo, le mosse non creano fiche', () => {
  for (const lv of LEVELS) for (const type of ['side', 'pay', 'pot', 'odd']) for (let i = 0; i < 800; i++) {
    const q = L.GEN[type](lv), f = q.felt, sum = z => Object.values(z).reduce((a, c) => a + L.zoneSum(c), 0), js = JSON.stringify(q);
    assert.strictEqual(sum(f.z), Object.values(f.want).reduce((a, b) => a + b, 0), 'conservazione ' + js);
    Object.values(f.want).forEach(w => assert.strictEqual(w % f.min, 0, 'importo non raggiungibile ' + js));
    Object.values(f.z).flat().forEach(c => assert(L.DENOMS.includes(c) && c >= f.min, 'taglio ' + js));
    // Break everything down to the smallest chip, then deal it out with legal moves only: the answer must be reachable.
    let z = JSON.parse(JSON.stringify(f.z));
    for (const id of Object.keys(z)) z = L.changeChips(z, id, z[id].slice(), f.min, f.min);
    assert.strictEqual(sum(z), sum(f.z), 'il cambio altera il totale ' + js);
    const pool = Object.keys(z).flatMap(id => z[id].map(c => [id, c]));
    for (const [id, w] of Object.entries(f.want)) { let need = w; while (need > 0) { const [from, c] = pool.pop(); z = L.moveChips(z, from, [c], '_' + id); need -= c; } assert.strictEqual(need, 0, 'resto ' + js); }
    const done = {}; for (const id of Object.keys(f.want)) done[id] = z['_' + id] || [];
    assert(L.feltOk(f, done), 'non raggiungibile ' + js);
  }
  assert.throws(() => L.moveChips({ a: [100], b: [] }, 'a', [500], 'b'));
  assert.deepStrictEqual(L.changeChips({ a: [100] }, 'a', [100], 100, 100), { a: [100] }, 'stesso taglio: niente da cambiare');
  assert.deepStrictEqual(L.changeChips({ a: [1000] }, 'a', [1000], 500, 1000), { a: [1000] }, 'sotto il taglio minimo no');
  assert.deepStrictEqual(L.changeChips({ a: [25000, 100] }, 'a', [25000], 1000, 100).a.filter(c => c === 1000).length, 25, 'cambio diretto, senza passare dai tagli di mezzo');
  assert.deepStrictEqual(L.changeChips({ a: [1000, 1000, 1000, 1000, 1000] }, 'a', [1000, 1000, 1000, 1000, 1000], 5000, 100), { a: [5000] }, 'cambio verso l\'alto');
  assert.deepStrictEqual(L.changeChips({ a: [1000, 1000] }, 'a', [1000, 1000], 5000, 100), { a: [1000, 1000] }, 'la somma non si divide');
  for (const min of [100, 500, 1000]) for (let x = min; x <= 400000; x += min * 7) {
    const st = L.stackFor(x, min), per = v => st.filter(c => c === v).length;
    assert.strictEqual(L.zoneSum(st), x, 'stack ' + x);
    assert(st.every(c => c >= min), 'taglio stack ' + x);
    L.DENOMS.filter(d => d < 25000).forEach(d => assert(per(d) <= 9, `pila da contare a colpo d'occhio ${x}: ${per(d)} da ${d}`));
  }
  // The stacks must be cuttable: on a normal table most side pots need no change at all.
  let clean = 0; const N = 1000;
  for (let i = 0; i < N; i++) {
    const pl = L.sideScenario('normal'), { pots } = L.computePots(pl); let ok = true;
    const left = Object.fromEntries(pl.map(p => [p.name, L.stackFor(p.c, pl.step)]));
    pots.forEach(pot => pot.elig.forEach(n => { let need = pot.step; left[n].sort((a, b) => b - a); for (let k = 0; k < left[n].length && need;) { if (left[n][k] <= need) need -= left[n].splice(k, 1)[0]; else k++; } if (need) ok = false; }));
    if (ok) clean++;
  }
  assert(clean / N > .6, 'troppi cambi: ' + clean / N);
  assert(L.readMs({ title: 'uno due tre', lines: ['quattro cinque sei'] }) === 2000, 'lettura');
  assert(L.readMs({}) === 0, 'niente da leggere, nessun tempo');
  assert.strictEqual(L.grade('pot', { fields: [{ answer: 1 }], steps: [], rules: [] }, { vals: ['1'] }).ok, true, 'vecchio errore salvato senza tavolo');
});
ok('prova di selezione: stesso codice stessa prova, composizione fissa, punteggio', () => {
  const a = JSON.stringify(L.selectionPlan('ABC123')), b = JSON.stringify(L.selectionPlan('ABC123')), c = JSON.stringify(L.selectionPlan('ZZZ999'));
  assert.strictEqual(a, b, 'lo stesso codice deve dare la stessa prova');
  assert.notStrictEqual(a, c, 'codici diversi, prove diverse');
  assert(L.GEN.win('easy') !== undefined && JSON.stringify(L.GEN.pot('normal')) !== JSON.stringify(L.GEN.pot('normal')), 'fuori dalla prova il caso deve tornare davvero casuale');
  for (let i = 0; i < 60; i++) {
    const code = 'T' + i, plan = L.selectionPlan(code), total = L.SEL.areas.reduce((s, x) => s + x.t.length, 0);
    assert.strictEqual(plan.length, total);
    for (const x of L.SEL.areas) assert.deepStrictEqual(plan.filter(p => p.area === x.n).map(p => p.type).sort(), x.t.slice().sort());
    const ids = plan.filter(p => p.type === 'quiz').map(p => p.q.id);
    assert.strictEqual(new Set(ids).size, ids.length, 'quiz doppi in una prova');
    for (const p of plan) assert.strictEqual(L.grade(p.type, p.q, L.solve(p.type, p.q)).ok, true, 'risolvibile ' + p.type);
  }
  const plan = L.selectionPlan('X1'), all = ok => plan.map(p => ({ area: p.area, type: p.type, ok, ms: 1000, to: false }));
  const full = L.scoreSelection(all(true));
  assert.strictEqual(full.pct, 100); assert.strictEqual(full.pass, true); assert.strictEqual(full.inTime, plan.length);
  assert.strictEqual(L.scoreSelection(all(false)).pass, false);
  // an excellent total does not hide a hole in one area
  const hole = all(true).map(x => x.area === 'Calcoli di puntata' ? { ...x, ok: false } : x), s = L.scoreSelection(hole);
  assert(s.pct >= L.SEL.pass && !s.pass, 'soglia per area ' + s.pct);
  // unanswered counts as wrong, and an unfinished test never passes
  const part = L.scoreSelection(all(true).slice(0, 34)); assert.strictEqual(part.answered, 34); assert.strictEqual(part.total, 35); assert.strictEqual(part.pass, false);
  const late = L.scoreSelection(all(true).map(x => ({ ...x, ms: 999999 }))); assert.strictEqual(late.inTime, 0);
});
ok('glossario: ogni voce ha l\'inglese del suo termine', () => {
  const G = id => TDA.items[id];
  assert.strictEqual(G('G14').enTitle, 'BTN'); assert.strictEqual(G('G15').enTitle, 'CO'); assert.strictEqual(G('G28').enTitle, 'SA'); assert.strictEqual(G('G22').enTitle, 'On the bubble');
  assert.strictEqual(G('G2').enText, null); assert.strictEqual(G('G11').title, '2-7 SD'); assert(/Optimal/.test(G('G35').text));
  Object.values(TDA.items).filter(x => x.s === 'glossary' && x.enText).forEach(x => assert(x.enTitle, x.id));
});
ok('selezione: mai due fiches dispari, che la regola 21 non prevede', () => {
  for (let i = 0; i < 400; i++) {
    const odd = L.selectionPlan('O' + i).find(p => p.type === 'odd').q, pays = Object.entries(odd.felt.want).filter(([k]) => k[0] === 's').map(([, v]) => v);
    assert(Math.max(...pays) - Math.min(...pays) === odd.felt.min, 'resto diverso da una fiche ' + JSON.stringify(odd.felt.want));
    assert.strictEqual(pays.filter(v => v === Math.max(...pays)).length, 1, 'una sola fiche in più ' + JSON.stringify(odd.felt.want));
  }
});
ok('pagamenti: il principale dopo i side pot', () => {
  assert(L.payOrderOk(['p2', 'p1', 'p0', 'p0'])); assert(L.payOrderOk(['p1', 's3', 'p0'])); assert(L.payOrderOk([])); assert(L.payOrderOk(undefined));
  assert(!L.payOrderOk(['p0', 'p1'])); assert(!L.payOrderOk(['p1', 'p0', 'p1']));
  for (let i = 0; i < 200; i++) {
    const q = L.GEN.pay('hard'), a = L.solve('pay', q), side = Object.keys(q.felt.want).filter(k => k[0] === 'p' && k !== 'p0');
    if (!side.length) continue;
    assert.strictEqual(L.grade('pay', q, { ...a, seq: [...side, 'p0'] }).ok, true);
    const r = L.grade('pay', q, { ...a, seq: ['p0', ...side] });
    assert.strictEqual(r.ok, false); assert(/prima i side pot/.test(r.steps[0]));
  }
});
ok('solve(): la risposta calcolata viene sempre giudicata giusta', () => {
  for (const type of Object.keys(L.GEN)) for (let i = 0; i < 300; i++) {
    const q = L.GEN[type]('normal');
    assert.strictEqual(L.grade(type, q, L.solve(type, q)).ok, true, 'solve ' + type);
    assert(L.TARGET[type] > 0, 'obiettivo di tempo ' + type);
  }
});
ok('misdeal, fuori turno, parole e gesti: tutti i casi escono e le risposte tornano', () => {
  const seen = {};
  for (let i = 0; i < 6000; i++) {
    const m = L.GEN.misdeal('normal'), o = L.GEN.oot('normal'), w = L.GEN.words('normal');
    const good = q => q.options.find(x => x.ok).t;
    const key = s => s.replace(/[0-9.]+/g, '#'); seen['m:' + key(m.steps[0])] = 1; seen['o:' + key(o.steps[o.steps.length - 1])] = 1; seen['w:' + key(w.steps[0])] = 1;
    // misdeal: after substantial action only the fouled deck changes anything
    if (/Fold e call sono azione sostanziale/.test(m.steps[0])) assert(/^Nessun misdeal/.test(good(m)));
    if (/Due carte identiche/.test(m.steps[0])) assert(/^Mazzo compromesso/.test(good(m)));
    if (/^Misdeal/.test(good(m)) || /^Nessun misdeal/.test(good(m))) assert(m.options.length === 3);
    // out of turn: the fold is the only action that always stays
    if (/folda fuori turno/.test(o.lines.join(' '))) assert(/^Sì, un fold/.test(good(o)));
    if (/Heads-up/.test(o.head)) assert(/non rilanciare/.test(good(o)));
  }
  const n = k => Object.keys(seen).filter(x => x.startsWith(k)).length;
  assert.strictEqual(n('m:'), 11, 'tipi di misdeal ' + n('m:')); assert.strictEqual(n('o:'), 4, 'tipi di fuori turno'); assert.strictEqual(n('w:'), 9, 'tipi di parole ' + n('w:'));
});
ok('giri di penalità: giocatori × giri', () => {
  for (let i = 0; i < 3000; i++) {
    const q = L.GEN.penalty(LEVELS[i % 3]), n = +q.lines[0].match(/in (\d+)/)[1], r = +q.lines[1].match(/dà (\d+)/)[1];
    assert.strictEqual(q.fields[0].answer, n * r); assert.strictEqual(q.table.seats.length, n);
  }
});
ok('quiz: la risposta giusta non si riconosce dalla lunghezza', () => {
  const longest = QUIZ.filter(x => x.a.slice(1).every(t => x.a[0].length > t.length)).length;
  console.log('     giusta strettamente più lunga:', longest, 'su', QUIZ.length);
  assert(longest / QUIZ.length < .55, 'troppe risposte giuste sono le più lunghe');
});
ok('dati TDA completi', () => {
  assert.deepStrictEqual([TDA.order.rules.length, TDA.order.procedures.length, TDA.order.illustrations.length, TDA.order.glossary.length], [74, 29, 15, 49]);
  Object.values(TDA.items).forEach(x => { assert(x.title && x.text, x.id); x.red.forEach(([a, b]) => assert(a >= 0 && b <= x.text.length && a < b, x.id)); });
  TDA.order.rules.concat(TDA.order.procedures, TDA.order.illustrations).forEach(id => assert(TDA.items[id].enText, id));
  assert(/used by permission of the Poker TDA, Copyright 2026/.test(TDA.credit));
  assert.strictEqual(TDA.cats.reduce((a, c) => a + c.ids.length, 0), 74);
  assert(/primo giocatore in gioco alla sinistra del bottone/.test(TDA.items.R21.text));
});
console.log(`\n${pass} gruppi di test passati`);
