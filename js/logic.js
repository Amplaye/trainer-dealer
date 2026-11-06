// Pure game logic: no DOM here, so everything can be tested in Node.
// Explanations use {Kd} tokens for cards; the UI turns them into coloured text.
(function (root) {
  'use strict';
  const RANKS = '23456789TJQKA', SUITS = 'shdc';
  const SYM = { s: '♠︎', h: '♥︎', d: '♦︎', c: '♣︎' };
  const SUITN = { s: 'picche', h: 'cuori', d: 'quadri', c: 'fiori' };
  const CATS = ['Carta alta', 'Coppia', 'Doppia coppia', 'Tris', 'Scala', 'Colore', 'Full', 'Poker', 'Scala colore'];
  const RN = v => ({ 14: 'A', 13: 'K', 12: 'Q', 11: 'J' }[v] || String(v));
  const rv = c => RANKS.indexOf(c[0]) + 2;
  const al = v => (v === 14 || v === 8 ? "all'" : 'al ') + RN(v);
  // Everything random goes through rnd, so a seeded run gives the same exam on every device.
  let rnd = Math.random;
  const rint = (a, b) => a + Math.floor(rnd() * (b - a + 1));
  const pick = a => a[Math.floor(rnd() * a.length)];
  const coin = (p = .5) => rnd() < p;
  const fmt = n => String(n).replace(/\B(?=(\d{3})+$)/g, '.');
  const parseNum = s => { const t = String(s).replace(/[.\s,]/g, ''); return t === '' || !/^\d+$/.test(t) ? NaN : Number(t); };
  const tok = c => '{' + c + '}';
  const toks = cs => cs.map(tok).join(' ');
  function shuffle(a) { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1));[a[i], a[j]] = [a[j], a[i]]; } return a; }
  function deck() { const d = []; for (const r of RANKS) for (const s of SUITS) d.push(r + s); return shuffle(d); }
  const deckMinus = used => deck().filter(c => !used.includes(c));
  const byRank = cs => cs.slice().sort((a, b) => rv(b) - rv(a));

  // ---------- hand evaluation ----------
  function eval5(cs) {
    const rs = cs.map(rv).sort((a, b) => b - a);
    const flush = cs.every(c => c[1] === cs[0][1]);
    const cnt = {}; rs.forEach(r => cnt[r] = (cnt[r] || 0) + 1);
    const g = Object.keys(cnt).map(r => [+r, cnt[r]]).sort((a, b) => b[1] - a[1] || b[0] - a[0]);
    let st = 0;
    if (g.length === 5) { if (rs[0] - rs[4] === 4) st = rs[0]; else if (rs[0] === 14 && rs[1] === 5) st = 5; }
    if (st && flush) return [8, st];
    if (g[0][1] === 4) return [7, g[0][0], g[1][0]];
    if (g[0][1] === 3 && g[1][1] === 2) return [6, g[0][0], g[1][0]];
    if (flush) return [5, ...rs];
    if (st) return [4, st];
    if (g[0][1] === 3) return [3, g[0][0], g[1][0], g[2][0]];
    if (g[0][1] === 2 && g[1][1] === 2) return [2, g[0][0], g[1][0], g[2][0]];
    if (g[0][1] === 2) return [1, g[0][0], g[1][0], g[2][0], g[3][0]];
    return [0, ...rs];
  }
  function cmp(a, b) { for (let i = 0; i < Math.max(a.length, b.length); i++) { const d = (a[i] || 0) - (b[i] || 0); if (d) return d; } return 0; }
  function best(cards) {
    let top = null, five = null; const n = cards.length;
    for (let a = 0; a < n; a++) for (let b = a + 1; b < n; b++) for (let c = b + 1; c < n; c++) for (let d = c + 1; d < n; d++) for (let e = d + 1; e < n; e++) {
      const h = [cards[a], cards[b], cards[c], cards[d], cards[e]], s = eval5(h);
      if (!top || cmp(s, top) > 0) { top = s; five = h; }
    }
    return { score: top, five };
  }
  function describe(s) {
    const t = s.slice(1).map(RN);
    switch (s[0]) {
      case 0: return `Carta alta ${t[0]}, poi ${t.slice(1).join('-')}`;
      case 1: return `Coppia di ${t[0]}, kicker ${t.slice(1).join('-')}`;
      case 2: return `Doppia coppia ${t[0]} e ${t[1]}, kicker ${t[2]}`;
      case 3: return `Tris di ${t[0]}, kicker ${t.slice(1).join('-')}`;
      case 4: return `Scala ${al(s[1])}`;
      case 5: return `Colore ${al(s[1])} (${t.join('-')})`;
      case 6: return `Full di ${t[0]} con ${t[1]}`;
      case 7: return `Poker di ${t[0]}, kicker ${t[1]}`;
      default: return s[1] === 14 ? 'Scala reale' : `Scala colore ${al(s[1])}`;
    }
  }
  const kickerFrom = cat => ({ 1: 2, 2: 3, 3: 2, 7: 2 }[cat] ?? 99);
  function winners(board, holes) {
    const res = holes.map(h => best(board.concat(h)));
    let top = res[0].score; res.forEach(r => { if (cmp(r.score, top) > 0) top = r.score; });
    const win = res.map((r, i) => cmp(r.score, top) === 0 ? i : -1).filter(i => i >= 0);
    return { res, win, top };
  }
  function usedText(five, hole) {
    const u = hole.filter(c => five.includes(c));
    if (!u.length) return 'non usa carte della mano, gioca il board';
    return u.length === 2 ? 'usa entrambe le carte' : `usa solo ${tok(u[0])}`;
  }
  function verdictLine(board, holes) {
    const { res, win, top } = winners(board, holes);
    if (win.length > 1) {
      if (cmp(top, eval5(board)) === 0) return 'Le 5 carte migliori sono tutte sul board: gioca il board e il piatto si divide.';
      return 'Stesso punto, stesse 5 carte come valore: il piatto si divide.';
    }
    let second = null; res.forEach((r, i) => { if (i !== win[0] && (!second || cmp(r.score, second) > 0)) second = r.score; });
    if (top[0] !== second[0]) return `${CATS[top[0]]} batte ${CATS[second[0]].toLowerCase()}.`;
    for (let i = 1; i < top.length; i++) {
      if (top[i] !== second[i]) return `Stessa categoria, decide ${i >= kickerFrom(top[0]) ? 'il kicker' : 'la carta'}: ${RN(top[i])} contro ${RN(second[i])}.`;
    }
    return '';
  }
  function boardFacts(board) {
    const rs = board.map(rv), cnt = {}; rs.forEach(r => cnt[r] = (cnt[r] || 0) + 1);
    const groups = Object.keys(cnt).map(r => [+r, cnt[r]]).filter(g => g[1] > 1).sort((a, b) => b[1] - a[1] || b[0] - a[0]);
    const sc = {}; board.forEach(c => sc[c[1]] = (sc[c[1]] || 0) + 1);
    const topSuit = Object.keys(sc).sort((a, b) => sc[b] - sc[a])[0];
    const run = straightWindow(board);
    return { groups, topSuit, suitN: sc[topSuit], run };
  }
  function straightWindow(board) {
    const set = new Set(board.map(rv)); if (set.has(14)) set.add(1);
    for (let lo = 10; lo >= 1; lo--) {
      const inside = []; for (let v = lo; v < lo + 5; v++) if (set.has(v)) inside.push(v);
      if (inside.length >= 3) return { lo, hi: lo + 4, inside };
    }
    return null;
  }
  const seqText = inside => inside.map(v => v === 1 ? 'A' : RN(v)).join('-');
  function boardLine(board) {
    const f = boardFacts(board), parts = [];
    if (f.groups.length) parts.push(f.groups[0][1] === 4 ? `poker di ${RN(f.groups[0][0])} sul board` : f.groups[0][1] === 3 ? `tris di ${RN(f.groups[0][0])} sul board` : f.groups.length > 1 ? 'due coppie sul board' : `coppia di ${RN(f.groups[0][0])} sul board`);
    if (f.suitN >= 3) parts.push(`${f.suitN} carte di ${SUITN[f.topSuit]}`);
    if (f.run) parts.push(`scala possibile (${seqText(f.run.inside)})`);
    return parts.length ? `Prima guarda il board: ${parts.join(', ')}.` : 'Prima guarda il board: niente coppie, niente colore, niente scala. Il massimo possibile è il tris.';
  }
  function nearMiss(board, hole, score) {
    const all = board.concat(hole), out = [];
    const sc = {}; all.forEach(c => sc[c[1]] = (sc[c[1]] || 0) + 1);
    const four = Object.keys(sc).find(s => sc[s] === 4);
    if (four && score[0] < 5) out.push(`Occhio al colore: ci sono solo 4 carte di ${SUITN[four]}, ne servono 5.`);
    if (score[0] < 4) {
      const set = new Set(all.map(rv)); if (set.has(14)) set.add(1);
      for (let lo = 10; lo >= 1; lo--) { let k = 0; for (let v = lo; v < lo + 5; v++) if (set.has(v)) k++; if (k === 4) { out.push('Occhio alla scala: 4 carte in fila non bastano, ne servono 5 consecutive.'); break; } }
    }
    const cnt = {}; all.forEach(c => cnt[c[0]] = (cnt[c[0]] || 0) + 1);
    const pairs = Object.values(cnt).filter(n => n === 2).length, trips = Object.values(cnt).filter(n => n === 3).length;
    if (pairs === 3) out.push('Ci sono tre coppie: ne contano solo due, le più alte, più il kicker.');
    if (trips === 2) out.push('Due tris fanno full: il tris più alto, più una coppia presa dall\'altro.');
    if (score[0] === 4 && score[1] === 5) out.push('A-2-3-4-5 è la scala più bassa: qui l\'asso vale 1.');
    return out;
  }

  // ---------- generators: cards ----------
  function take(d, pred) { const o = d.filter(pred); const c = o.length ? pick(o) : d[0]; d.splice(d.indexOf(c), 1); return c; }
  function trapBoard() {
    const d = deck(), R = () => pick(RANKS), out = [];
    const rank = r => out.push(take(d, c => c[0] === r));
    const any = () => out.push(take(d, () => true));
    const two = () => { const a = R(); let b = R(); while (b === a) b = R(); return [a, b]; };
    const run = len => { const lo = rint(-1, 13 - len), seq = []; for (let i = 0; i < len; i++) { const x = lo + i; seq.push(x < 0 ? 'A' : RANKS[x]); } return seq; };
    const t = pick(['2p', 'trips', 'fullb', 'quads', 'f4', 'f5', 'st5', 'st4', 'wheel', 'sf']);
    const s = pick(SUITS);
    if (t === '2p') { const [a, b] = two();[a, a, b, b].forEach(rank); any(); }
    else if (t === 'trips') { const [a] = two();[a, a, a].forEach(rank); any(); any(); }
    else if (t === 'fullb') { const [a, b] = two();[a, a, a, b, b].forEach(rank); }
    else if (t === 'quads') { const [a] = two();[a, a, a, a].forEach(rank); any(); }
    else if (t === 'f4') { for (let i = 0; i < 4; i++) out.push(take(d, c => c[1] === s)); out.push(take(d, c => c[1] !== s)); }
    else if (t === 'f5') { for (let i = 0; i < 5; i++) out.push(take(d, c => c[1] === s)); }
    else if (t === 'st5') { run(5).forEach(rank); }
    else if (t === 'st4') { run(4).forEach(rank); any(); }
    else if (t === 'wheel') { ['A', '2', '3', '4'].forEach(rank); any(); }
    else { run(3).forEach(r => out.push(take(d, c => c[0] === r && c[1] === s))); any(); any(); }
    return shuffle(out);
  }
  const LV = { easy: { hands: 2, trap: 0, side: 3 }, normal: { hands: 3, trap: .5, side: 4 }, hard: { hands: 4, trap: 1, side: 5 } };
  // Where the hands sit on the table, as seat indexes: seat number is index + 1.
  const SLOTS = { 1: [4], 2: [1, 7], 3: [1, 4, 7], 4: [1, 3, 5, 7] };
  const genBoard = level => coin(LV[level].trap) ? trapBoard() : deck().slice(0, 5);
  function genWin(level) {
    const n = LV[level].hands, board = genBoard(level), trap = LV[level].trap > 0;
    let holes = [];
    for (let k = 0; k < (trap ? 200 : 1); k++) {
      const rest = deckMinus(board);
      holes = []; for (let i = 0; i < n; i++) holes.push([rest[2 * i], rest[2 * i + 1]]);
      if (!trap) break;
      const sc = holes.map(h => best(board.concat(h)).score).sort((a, b) => cmp(b, a));
      if (sc[0][0] === sc[1][0]) break;
    }
    return { board, holes };
  }
  function genName(level) { const board = genBoard(level), r = deckMinus(board); return { board, hole: [r[0], r[1]] }; }
  function boardInfo(board) {
    const rs = board.map(rv);
    const paired = new Set(rs).size < rs.length;
    const sc = {}; board.forEach(c => sc[c[1]] = (sc[c[1]] || 0) + 1);
    const flush = Object.values(sc).some(n => n >= 3);
    const straight = !!straightWindow(board);
    const rest = deckMinus(board); let top = null, hole = null;
    for (let i = 0; i < rest.length; i++) for (let j = i + 1; j < rest.length; j++) {
      const s = best(board.concat([rest[i], rest[j]])).score;
      if (!top || cmp(s, top) > 0) { top = s; hole = [rest[i], rest[j]]; }
    }
    return { paired, flush, straight, nut: top, nutHole: hole };
  }
  function genBoardRead(level) {
    const len = pick([3, 4, 5, 5]), b = genBoard(level === 'easy' ? 'normal' : level);
    return { board: shuffle(b).slice(0, len) };
  }

  // ---------- table helpers ----------
  const BLINDS = [[100, 200], [200, 400], [300, 600], [500, 1000], [1000, 2000], [1500, 3000], [2000, 4000], [5000, 10000]];
  const unitOf = bb => Math.max(100, bb / 10);
  const seatAt = (b, k) => ((b - 1 + k) % 9) + 1;
  const mkTable = b => ({ button: b, seats: [1, 2, 3, 4, 5, 6, 7, 8, 9].map(n => ({ n })) });
  const st = (t, n, o) => Object.assign(t.seats.find(s => s.n === n), o);
  const ALL_SEATS = [1, 2, 3, 4, 5, 6, 7, 8, 9];
  const someSeats = n => shuffle(ALL_SEATS).slice(0, n).sort((a, b) => a - b);
  function actTable(o) {
    const btn = rint(1, 9), t = mkTable(btn);
    if (o.pre) { st(t, seatAt(btn, 1), { bet: o.sb, tag: o.sbFold ? 'FOLD' : 'SB' }); st(t, seatAt(btn, 2), { bet: o.bb, tag: 'BB' }); }
    const k = (o.pre ? 3 : 1) + rint(0, 2), f = seatAt(btn, k);
    st(t, f, { bet: o.a, tag: o.pre ? 'RILANCIA' : 'PUNTA' });
    if (o.b) st(t, seatAt(btn, k + 1), { bet: o.b, tag: o.tag2 || 'RILANCIA' });
    const nx = o.hot ? seatAt(btn, o.hot) : (o.back ? f : seatAt(btn, k + (o.b ? 2 : 1)));
    st(t, nx, { hot: true });
    return t;
  }
  function limpTable(sb, bb) {
    const btn = rint(1, 9), t = mkTable(btn);
    st(t, seatAt(btn, 1), { bet: sb, tag: 'SB', hot: true }); st(t, seatAt(btn, 2), { bet: bb, tag: 'BB' });
    for (let k = 3; k <= 9; k++) st(t, seatAt(btn, k), { bet: bb, tag: 'CHIAMA' });
    return t;
  }

  // ---------- generators: raises and calls ----------
  function genMinRaise(level) {
    const [sb, bb] = pick(BLINDS), u = unitOf(bb);
    const k = pick(level === 'easy' ? ['limp', 'open', 'post'] : ['open', 're', 'short', 'shortbb', 'post', 'postre', 'postshort', 'chain']);
    const open = bb * rint(2, 4) + u * rint(0, 4);
    let lines, ans, steps, table, rules = ['R45', 'I45'], tip = 'Il rilancio minimo è il totale da chiamare più l\'ultimo rilancio pieno. Raddoppiare il totale funziona solo sulla prima puntata, non dopo un rilancio. Un all-in corto non cambia la misura.';
    if (k === 'limp') {
      lines = ['Preflop: tutti chiamano il BB, nessun rilancio.']; ans = bb * 2; table = limpTable(sb, bb);
      steps = [`Il BB è la puntata di apertura: vale ${fmt(bb)}.`, `Il rilancio deve essere almeno pari alla puntata: ${fmt(bb)} + ${fmt(bb)} = ${fmt(ans)}.`];
    } else if (k === 'open') {
      const r = open - bb; lines = [`Preflop: il primo rilancia a ${fmt(open)}.`]; ans = open + r; table = actTable({ pre: 1, sb, bb, a: open });
      steps = [`L'ultimo rilancio vale ${fmt(open)} − ${fmt(bb)} = ${fmt(r)}.`, `Il prossimo deve arrivare ad almeno ${fmt(open)} + ${fmt(r)} = ${fmt(ans)}.`];
    } else if (k === 're') {
      const r0 = open - bb, y = open + r0 + u * rint(0, 20), r = y - open; lines = [`Preflop: il primo rilancia a ${fmt(open)}.`, `Il secondo rilancia a ${fmt(y)}.`]; ans = y + r; table = actTable({ pre: 1, sb, bb, a: open, b: y });
      steps = [`L'ultimo rilancio è quello del secondo: ${fmt(y)} − ${fmt(open)} = ${fmt(r)}.`, `Il prossimo deve arrivare ad almeno ${fmt(y)} + ${fmt(r)} = ${fmt(ans)}.`];
    } else if (k === 'short') {
      const r0 = open - bb, steps0 = Math.max(1, Math.floor((r0 - 1) / u)), z = open + u * rint(1, steps0); lines = [`Preflop: il primo rilancia a ${fmt(open)}.`, `Il secondo va all-in per ${fmt(z)}: rilancio incompleto.`]; ans = z + r0; table = actTable({ pre: 1, sb, bb, a: open, b: z, tag2: 'ALL-IN' });
      rules = ['R45', 'R49', 'I49'];
      steps = [`L'ultimo rilancio pieno è quello del primo: ${fmt(open)} − ${fmt(bb)} = ${fmt(r0)}.`, `L'all-in aggiunge solo ${fmt(z - open)}, meno di ${fmt(r0)}: non è un rilancio pieno e non cambia la misura.`, `Il prossimo parte dal totale da chiamare: ${fmt(z)} + ${fmt(r0)} = ${fmt(ans)}.`];
    } else if (k === 'shortbb') {
      const steps0 = Math.max(1, Math.floor((bb - 1) / u)), z = bb + u * rint(1, steps0); lines = [`Preflop: il primo va all-in per ${fmt(z)}, meno di un rilancio pieno.`]; ans = z + bb;
      const btn = rint(1, 9); table = mkTable(btn); st(table, seatAt(btn, 1), { bet: sb, tag: 'SB' }); st(table, seatAt(btn, 2), { bet: bb, tag: 'BB' }); st(table, seatAt(btn, 3), { bet: z, tag: 'ALL-IN' }); st(table, seatAt(btn, 4), { hot: true });
      rules = ['R45', 'I45'];
      steps = [`La puntata valida resta il BB da ${fmt(bb)}: l'all-in ha aggiunto solo ${fmt(z - bb)}.`, `Il rilancio minimo quindi vale ${fmt(bb)}.`, `Il prossimo deve arrivare ad almeno ${fmt(z)} + ${fmt(bb)} = ${fmt(ans)}.`];
      tip = 'È l\'Esempio 2 della regola 45 nell\'Illustration Addendum: all-in di 150 con bui 50-100, il prossimo rilancia almeno a 250.';
    } else if (k === 'post') {
      const b = bb * rint(1, 6) + u * rint(0, 4); lines = [`Dopo il flop: il primo punta ${fmt(b)}.`]; ans = b * 2; table = actTable({ a: b });
      steps = [`La puntata di apertura vale ${fmt(b)}.`, `Il rilancio deve essere almeno uguale: ${fmt(b)} + ${fmt(b)} = ${fmt(ans)}.`];
    } else if (k === 'postre') {
      const b = bb * rint(1, 6), y = b * 2 + u * rint(0, 20), r = y - b; lines = [`Dopo il flop: il primo punta ${fmt(b)}.`, `Il secondo rilancia a ${fmt(y)}.`]; ans = y + r; table = actTable({ a: b, b: y });
      steps = [`L'ultimo rilancio vale ${fmt(y)} − ${fmt(b)} = ${fmt(r)}.`, `Il prossimo deve arrivare ad almeno ${fmt(y)} + ${fmt(r)} = ${fmt(ans)}.`];
    } else if (k === 'postshort') {
      const b = bb * rint(2, 6), steps0 = Math.max(1, Math.floor((b - 1) / u)), z = b + u * rint(1, steps0); lines = [`Dopo il flop: il primo punta ${fmt(b)}.`, `Il secondo va all-in per ${fmt(z)}: rilancio incompleto.`]; ans = z + b; table = actTable({ a: b, b: z, tag2: 'ALL-IN' });
      rules = ['R45', 'R49', 'I49'];
      steps = [`L'ultima puntata piena è ${fmt(b)}.`, `L'all-in aggiunge solo ${fmt(z - b)}: non cambia la misura.`, `Il prossimo deve arrivare ad almeno ${fmt(z)} + ${fmt(b)} = ${fmt(ans)}.`];
    } else {
      const b = bb * rint(2, 6), a1 = u * rint(1, Math.max(1, Math.floor((b - 1) / u))), a2 = u * rint(1, Math.max(1, Math.floor((b - 1) / u))), y = b + a1, z = y + a2;
      lines = [`Dopo il flop: il primo punta ${fmt(b)}.`, `Il secondo va all-in per ${fmt(y)}.`, `Il terzo va all-in per ${fmt(z)}.`]; ans = z + b;
      const btn = rint(1, 9), kk = 1 + rint(0, 2); table = mkTable(btn); st(table, seatAt(btn, kk), { bet: b, tag: 'PUNTA' }); st(table, seatAt(btn, kk + 1), { bet: y, tag: 'ALL-IN' }); st(table, seatAt(btn, kk + 2), { bet: z, tag: 'ALL-IN' }); st(table, seatAt(btn, kk + 3), { hot: true });
      rules = ['R49', 'I49'];
      steps = [`La puntata piena è ${fmt(b)}.`, `Gli all-in aggiungono ${fmt(a1)} e ${fmt(a2)}: presi uno per uno sono meno di ${fmt(b)}, quindi nessuno dei due è un rilancio pieno.`, `Anche se la somma riaprisse i rilanci, il minimo resta l'ultima puntata piena valida: ${fmt(z)} + ${fmt(b)} = ${fmt(ans)}.`];
      tip = 'È l\'Esempio 2 della regola 49: apre 300, all-in 500, 650 e 800, il prossimo rilancia almeno a 1.100.';
    }
    return { title: 'Il prossimo vuole rilanciare', head: `Bui ${fmt(sb)}/${fmt(bb)}.`, lines, table, fields: [{ label: 'Rilancio minimo a', answer: ans }], steps, tip, rules };
  }
  function genCall() {
    const [sb, bb] = pick(BLINDS), u = unitOf(bb);
    const x = bb * rint(2, 4) + u * rint(0, 4), k = pick(['sb', 'bb', 're', 'post']);
    let lines, ans, steps, table, tip = 'Se un giocatore te lo chiede rispondi col numero secco: "Cinquemila", non "solo cinquemila" (RP-24).';
    if (k === 'sb') {
      lines = [`Rilancio a ${fmt(x)}, tutti foldano fino allo small blind.`]; ans = x - sb; table = actTable({ pre: 1, sb, bb, a: x, hot: 1 });
      steps = [`Lo small blind ha già davanti ${fmt(sb)}.`, `Gli mancano ${fmt(x)} − ${fmt(sb)} = ${fmt(ans)}.`];
    } else if (k === 'bb') {
      lines = [`Rilancio a ${fmt(x)}, si arriva al big blind che ha pagato anche il BB ante.`]; ans = x - bb; table = actTable({ pre: 1, sb, bb, a: x, hot: 2, sbFold: 1 });
      steps = [`Il big blind ha davanti ${fmt(bb)} di buio. L'ante va nel piatto a parte e per prassi non conta per il call.`, `Gli mancano ${fmt(x)} − ${fmt(bb)} = ${fmt(ans)}.`];
    } else if (k === 're') {
      const y = x + (x - bb) + u * rint(0, 15); lines = [`Il primo rilancia a ${fmt(x)}, il secondo rilancia a ${fmt(y)}.`, 'Tocca di nuovo al primo.']; ans = y - x; table = actTable({ pre: 1, sb, bb, a: x, b: y, back: 1 });
      steps = [`Il primo ha già messo ${fmt(x)}.`, `Gli mancano ${fmt(y)} − ${fmt(x)} = ${fmt(ans)}.`];
    } else {
      const b = bb * rint(1, 5), y = b * 2 + u * rint(0, 15); lines = [`Al flop il primo punta ${fmt(b)}, il secondo rilancia a ${fmt(y)}.`, 'Tocca di nuovo al primo.']; ans = y - b; table = actTable({ a: b, b: y, back: 1 });
      steps = [`Il primo ha già messo ${fmt(b)} in questo giro.`, `Gli mancano ${fmt(y)} − ${fmt(b)} = ${fmt(ans)}.`];
    }
    return { title: 'Quanto deve aggiungere per chiamare?', head: `Bui ${fmt(sb)}/${fmt(bb)}.`, lines, table, fields: [{ label: 'Da aggiungere', answer: ans }], steps, tip, rules: ['R51', 'RP12', 'RP24'] };
  }
  // ---------- chips on the felt: the table itself holds the state, nothing to keep in your head ----------
  const DENOMS = [25000, 5000, 1000, 500, 100];
  const BREAK = { 25000: [5000, 5], 5000: [1000, 5], 1000: [500, 2], 500: [100, 5] };
  function chipsFor(x) { const out = []; for (const d of DENOMS) while (x >= d) { out.push(d); x -= d; } return out; }
  const zoneSum = cs => (cs || []).reduce((a, b) => a + b, 0);
  const copyZ = z => JSON.parse(JSON.stringify(z));
  const pull = (cs, v) => { const i = cs.indexOf(v); if (i < 0) throw new Error('fiche assente: ' + v); cs.splice(i, 1); };
  function moveChips(z, from, chips, to) {
    const o = copyZ(z);
    chips.forEach(v => { pull(o[from], v); (o[to] = o[to] || []).push(v); });
    return o;
  }
  // Change stays in the zone it came from, like swapping a chip with the tray. Never below the smallest chip in play.
  function breakChips(z, from, chips, min) {
    const o = copyZ(z);
    chips.forEach(v => { const b = BREAK[v]; if (!b || b[0] < min) return; pull(o[from], v); for (let i = 0; i < b[1]; i++) o[from].push(b[0]); });
    return o;
  }
  // Illustration Addendum 17: the side pots are awarded before the main pot.
  function payOrderOk(seq) { const ps = (seq || []).filter(z => z[0] === 'p'), i = ps.indexOf('p0'); return i < 0 || ps.slice(i).every(z => z === 'p0'); }
  const feltOk = (f, z) => [...new Set([...Object.keys(f.want), ...Object.keys(z)])].every(id => zoneSum(z[id]) === (f.want[id] || 0));
  // Errors saved before v2.2 have no felt: they stay number exercises, so the review list keeps working.
  const kindOf = (type, q) => q && q.felt ? 'felt' : TYPES[type].k;

  function genPot(level) {
    const [sb, bb] = pick(BLINDS), u = unitOf(bb), seats = rint(6, 9);
    const ante = level === 'easy' ? 'none' : pick(['none', 'bb', 'bb', 'each']);
    const lines = [], steps = []; let pot = 0;
    if (ante === 'bb') { lines.push(`BB ante: ${fmt(bb)}.`); pot += bb; steps.push(`Ante del big blind: ${fmt(bb)}.`); }
    if (ante === 'each') { const a = Math.max(100, Math.round(bb / 1000) * 100); lines.push(`Ante ${fmt(a)} a testa, ${seats} giocatori.`); pot += a * seats; steps.push(`Ante: ${fmt(a)} × ${seats} = ${fmt(a * seats)}.`); }
    const x = bb * rint(2, 4) + u * rint(0, 3);
    let c = rint(0, 2); const sc = coin(), bc = coin();
    if (!c && !sc && !bc) c = 1;
    lines.push(`Un giocatore rilancia a ${fmt(x)}.`);
    if (c) lines.push(`${c === 1 ? 'Un altro chiama' : c + ' giocatori chiamano'}, gli altri foldano.`);
    lines.push(sc ? 'Lo small blind chiama.' : `Lo small blind folda (lascia ${fmt(sb)}).`);
    lines.push(bc ? 'Il big blind chiama.' : `Il big blind folda (lascia ${fmt(bb)}).`);
    const inn = 1 + c + (sc ? 1 : 0) + (bc ? 1 : 0);
    const occ = someSeats(seats), bi = rint(0, seats - 1), at = k => occ[(bi + k) % seats];
    const table = { button: occ[bi], seats: occ.map(n => ({ n, tag: 'FOLD' })) };
    const kr = rint(3, seats - c), alive = [];
    st(table, at(kr), { bet: x, tag: 'RILANCIA' }); alive.push(at(kr));
    for (let i = 1; i <= c; i++) { st(table, at(kr + i), { bet: x, tag: 'CHIAMA' }); alive.push(at(kr + i)); }
    st(table, at(1), sc ? { bet: x, tag: 'CHIAMA' } : { bet: sb, tag: 'FOLD' }); if (sc) alive.push(at(1));
    st(table, at(2), bc ? { bet: x, tag: 'CHIAMA' } : { bet: bb, tag: 'FOLD' }); if (bc) alive.push(at(2));
    if (ante === 'bb') st(table, at(2), { note: 'BB ante' });
    const antes = pot;
    pot += x * inn; steps.push(`${inn} giocatori hanno messo ${fmt(x)}: ${fmt(x)} × ${inn} = ${fmt(x * inn)}.`);
    if (!sc) { pot += sb; steps.push(`Lo small blind foldato resta nel piatto: + ${fmt(sb)}.`); }
    if (!bc) { pot += bb; steps.push(`Il big blind foldato resta nel piatto: + ${fmt(bb)}.`); }
    let flop = null;
    if (level !== 'easy' && coin(.6)) {
      const b = Math.max(bb, Math.round(pot / 2 / bb) * bb), k = rint(1, inn - 1);
      lines.push(`Al flop uno punta ${fmt(b)}, ${k === 1 ? 'uno chiama' : k + ' chiamano'}, gli altri foldano.`);
      flop = { b, seats: alive.slice(0, 1 + k), before: pot };
      pot += b * (1 + k); steps.push(`Giro del flop: ${fmt(b)} × ${1 + k} = ${fmt(b * (1 + k))}.`);
      table.seats.forEach(s => { const i = flop.seats.indexOf(s.n); s.tag = i < 0 ? 'FOLD' : i ? 'CHIAMA' : 'PUNTA'; });
    }
    const z = { p0: chipsFor(flop ? flop.before : antes) }, want = { p0: pot };
    table.seats.forEach(s => { const c = flop ? (flop.seats.includes(s.n) ? flop.b : 0) : s.bet || 0; z['s' + s.n] = chipsFor(c); want['s' + s.n] = 0; });
    steps.push(`Totale: ${fmt(pot)}.`);
    return { title: 'Quanto c\'è nel piatto?', head: `Bui ${fmt(sb)}/${fmt(bb)}.`, lines, table, felt: { z, want, min: 100 }, fields: [{ label: 'Piatto totale', answer: pot }], steps, tip: 'In no-limit il piatto non si annuncia: è un conto che tieni per te, per esempio per la regola 59 sulle puntate ambigue.', rules: ['R56', 'R59'] };
  }
  function genChips(level) {
    const set = pick([[100, 500, 1000, 5000], [500, 1000, 5000, 25000], [25, 100, 500, 1000]]);
    const use = level === 'easy' ? set.slice(0, 2) : set;
    const lines = [], steps = [], stacks = []; let t = 0;
    use.forEach(v => {
      const n = level === 'hard' ? rint(3, 60) : level === 'easy' ? rint(2, 20) : rint(1, 40);
      const piles = Math.floor(n / 20), rest = n % 20;
      lines.push(`${piles ? `${piles} ${piles === 1 ? 'pila' : 'pile'} da 20${rest ? ` + ${rest}` : ''}` : n} da ${fmt(v)}`);
      steps.push(`${n} × ${fmt(v)} = ${fmt(n * v)}.`);
      stacks.push({ v, n }); t += n * v;
    });
    steps.push(`Totale: ${fmt(t)}.`);
    return { title: 'Conta lo stack', head: 'Pile ordinate da 20 pezzi, come vuole la regola 27.', lines, shown: level === 'easy' ? lines : [], stacks, fields: [{ label: 'Totale', answer: t }], steps, tip: 'Conta per pile: una pila da 20 vale 20 volte il gettone. È il modo più veloce per stimare un all-in.', rules: ['R27', 'R62'] };
  }
  function splitPot(pot, chip, seats, button) {
    const order = seats.slice().sort((a, b) => ((a - button + 8) % 9) - ((b - button + 8) % 9));
    const chips = pot / chip, base = Math.floor(chips / seats.length), extra = chips % seats.length;
    const pay = {}; order.forEach((s, i) => pay[s] = (base + (i < extra ? 1 : 0)) * chip);
    return { pay, order, extra };
  }
  function genOdd(level, oneOnly) {
    const n = level === 'easy' ? 2 : pick([2, 3]), chip = pick([100, 500, 1000]);
    let chips = rint(21, 240); while (chips % n === 0 || (oneOnly && chips % n !== 1)) chips++;
    const seats = someSeats(n), button = rint(1, 9), pot = chips * chip;
    const { pay, order, extra } = splitPot(pot, chip, seats, button);
    const table = mkTable(button);
    seats.forEach(s => st(table, s, { tag: 'DIVIDE', hot: true }));
    const walk = []; for (let k = 1; k <= 9; k++) { const s = seatAt(button, k); walk.push(s); if (s === order[0]) break; }
    const base = Math.floor(chips / n);
    const steps = [
      `In fiches: ${fmt(pot)} ÷ ${fmt(chip)} = ${chips} fiches, da dividere tra ${n}.`,
      `A testa ${base} fiches (${fmt(base * chip)}) e ne avanza${extra > 1 ? 'no' : ''} ${extra}.`,
      `Parti dal bottone al posto ${button} e vai a sinistra: ${walk.join(', ')}. Il primo che divide è il posto ${order[0]}.`,
      extra > 1 ? `Le ${extra} fiches in più, per prassi, vanno una a testa nell'ordine: ${order.slice(0, extra).join(', ')}.` : `La fiche in più va al posto ${order[0]}.`
    ];
    return {
      title: 'Piatto diviso con fiche dispari', head: '', table,
      lines: [`Fiche più piccola in gioco: ${fmt(chip)}.`, `Bottone al posto ${button}.`, `Dividono i posti ${seats.join(', ')}.`],
      felt: { z: { p0: chipsFor(pot), ...Object.fromEntries(seats.map(s => ['s' + s, []])) }, want: { p0: 0, ...Object.fromEntries(seats.map(s => ['s' + s, pay[s]])) }, min: chip }, steps,
      tip: 'Nei giochi con board la fiche in più va al primo a sinistra del bottone. La "posizione peggiore" (21-D, novità 2026) vale solo nei giochi non standard, non nell\'hold\'em. Con i side pot ogni piatto si divide per conto suo (regola 23).',
      rules: ['R21', 'R23']
    };
  }
  function computePots(players) {
    const act = players.filter(p => !p.folded);
    const levels = [...new Set(act.map(p => p.c))].sort((a, b) => a - b);
    let prev = 0, refund = null; const pots = [];
    levels.forEach(L => {
      const amount = players.reduce((s, p) => s + Math.min(p.c, L) - Math.min(p.c, prev), 0);
      const elig = act.filter(p => p.c >= L).map(p => p.name);
      if (elig.length === 1) refund = { name: elig[0], amount }; else pots.push({ amount, elig, step: L - prev });
      prev = L;
    });
    return { pots, refund };
  }
  // groups: names from best to worst, players in the same group tie.
  function payouts(players, groups, button, chip) {
    const { pots, refund } = computePots(players), pay = {}, lines = [];
    players.forEach(p => pay[p.name] = 0);
    const num = name => players.find(p => p.name === name).n;
    pots.forEach((p, i) => {
      const g = groups.find(x => x.some(n => p.elig.includes(n)));
      const w = g.filter(n => p.elig.includes(n));
      if (w.length === 1) { pay[w[0]] += p.amount; lines.push({ i, w, amount: p.amount }); }
      else {
        const s = splitPot(p.amount, chip, w.map(num), button);
        w.forEach(n => { pay[n] += s.pay[num(n)]; });
        lines.push({ i, w, amount: p.amount, split: s });
      }
    });
    if (refund) pay[refund.name] += refund.amount;
    return { pay, lines, refund };
  }
  const potName = i => i === 0 ? 'Piatto principale' : `Side pot ${i}`;
  function sideScenario(level) {
    const n = LV[level].side, seats = someSeats(n + 1);
    const step = pick([100, 500, 1000]);
    const cs = []; while (cs.length < n) { const v = rint(8, 80) * step; if (!cs.includes(v)) cs.push(v); }
    if (coin(.3)) { cs.sort((a, b) => a - b); const i = rint(0, n - 2); cs[i] = cs[i + 1]; }
    const sh = shuffle(cs);
    const players = sh.map((c, i) => ({ name: `Posto ${seats[i]}`, n: seats[i], c, folded: false }));
    if (level === 'hard') { const low = Math.min(...cs); players.push({ name: `Posto ${seats[n]}`, n: seats[n], c: Math.max(step, Math.floor(low / 2 / step) * step), folded: true }); }
    players.step = step;
    return players;
  }
  const sideTable = pl => ({ seats: pl.map(p => ({ n: p.n, bet: p.c, tag: p.folded ? 'FOLD' : 'ALL-IN' })) });
  function potSteps(pl, pots) {
    const act = pl.filter(p => !p.folded).map(p => p.c).sort((a, b) => a - b);
    const out = [`Metti in fila gli all-in dal più piccolo: ${[...new Set(act)].map(fmt).join(', ')}.`];
    pots.forEach((p, i) => {
      const k = p.elig.length, dead = p.amount - p.step * k;
      out.push(`${potName(i)}: ${fmt(p.step)} × ${k}${dead ? ` + ${fmt(dead)} morti del giocatore foldato` : ''} = ${fmt(p.amount)}. Se lo giocano ${p.elig.join(', ')}.`);
    });
    return out;
  }
  function genSide(level) {
    const pl = sideScenario(level), { pots, refund } = computePots(pl);
    const z = { p0: [] }, want = {};
    pl.forEach(p => { z['s' + p.n] = chipsFor(p.c); want['s' + p.n] = refund && refund.name === p.name ? refund.amount : 0; });
    pots.forEach((p, i) => { want['p' + i] = p.amount; });
    const steps = potSteps(pl, pots);
    if (refund) steps.push(`${refund.name}: i ${fmt(refund.amount)} in più non li copre nessuno, quindi tornano indietro. Non sono un piatto.`);
    return { title: 'Dividi i piatti', head: '', lines: ['Conta gli all-in e costruisci i piatti. Quello che nessuno copre resta davanti al giocatore.'], table: sideTable(pl), felt: { z, want, min: pl.step, add: true }, steps, tip: 'Il gradino di ogni piatto è la differenza tra un all-in e il precedente, moltiplicata per chi ci arriva.', rules: ['R23', 'I17'] };
  }
  function genPay(level) {
    const pl = sideScenario(level), act = pl.filter(p => !p.folded), order = shuffle(act.map(p => p.name));
    const tie = level !== 'easy' && coin(.3);
    const groups = tie ? [[order[0], order[1]], ...order.slice(2).map(n => [n])] : order.map(n => [n]);
    const button = pick(pl).n, chip = pl.step;
    const { pay, lines, refund } = payouts(pl, groups, button, chip), { pots } = computePots(pl);
    const steps = lines.slice().reverse().map(l => {
      if (!l.split) return `${potName(l.i)} (${fmt(l.amount)}): lo vince il ${l.w[0]}, la mano migliore tra chi può giocarlo.`;
      const s = l.split;
      return `${potName(l.i)} (${fmt(l.amount)}): dividono ${l.w.join(' e ')}.${s.extra ? ` Fiche in più al posto ${s.order[0]}, il primo a sinistra del bottone.` : ''}`;
    });
    if (refund) steps.push(`${fmt(refund.amount)} tornano al ${refund.name}: sono gettoni che nessuno ha coperto.`);
    steps.push('Somma quello che prende ogni posto.');
    const table = sideTable(pl); table.button = button;
    groups.forEach((g, i) => g.forEach(nm => st(table, pl.find(p => p.name === nm).n, { tag: `${i + 1}ª MANO` })));
    const rank = 'Mani dalla migliore alla peggiore: ' + groups.map(g => g.join(' = ')).join(' > ') + '.';
    const shown = [...pots.map((p, i) => `${potName(i)}: se lo giocano ${p.elig.join(', ')}.`), rank]; if (tie) shown.push(`Fiche più piccola in gioco: ${fmt(chip)}.`);
    const z = {}, want = {};
    pots.forEach((p, i) => { z['p' + i] = chipsFor(p.amount); want['p' + i] = 0; });
    pl.forEach(p => { z['s' + p.n] = refund && refund.name === p.name ? chipsFor(refund.amount) : []; want['s' + p.n] = pay[p.name]; });
    return {
      title: 'Paga i piatti', head: '', lines: shown, table, felt: { z, want, min: chip, order: true }, steps,
      tip: 'Si assegna prima il side pot e poi il principale (Illustration Addendum, regola 17). Con più side pot la prassi è partire dall\'ultimo e tornare indietro. Le carte di chi gioca solo il principale si scoprono subito con le altre, non si aspetta il side pot.',
      rules: ['R23', 'I17', 'R21']
    };
  }

  // ---------- generators: table procedure ----------
  // Rules 45, 46 and 47: chips pushed silently by a player who has more chips behind.
  function classifyPush(C, R, chips) {
    const T = chips.reduce((a, b) => a + b, 0);
    if (chips.length === 1) return { kind: 'call', total: C, back: T - C, why: 'single' };
    const m = Math.min(...chips);
    if (T - m < C) return { kind: 'call', total: C, back: T - C, why: 'all' };
    const over = T - C;
    if (over * 2 < R) return { kind: 'call', total: C, back: T - C, why: 'half' };
    if (T >= C + R) return { kind: 'raise', total: T, back: 0, why: 'full' };
    return { kind: 'forced', total: C + R, back: 0, why: 'forced' };
  }
  const chipText = cs => {
    const g = {}; cs.forEach(c => g[c] = (g[c] || 0) + 1);
    const parts = Object.keys(g).map(Number).sort((a, b) => b - a).map(v => `${g[v]} ${g[v] === 1 ? 'gettone' : 'gettoni'} da ${fmt(v)}`);
    return parts.length > 1 ? parts.slice(0, -1).join(', ') + ' e ' + parts[parts.length - 1] : parts[0];
  };
  function genPush(level) {
    const want = pick(level === 'easy' ? ['single', 'all', 'half'] : ['single', 'all', 'half', 'forced', 'forced', 'full', 'declared', 'nobet']);
    for (let tries = 0; tries < 4000; tries++) {
      const [sb, bb] = pick(BLINDS.slice(0, 6)), pre = coin();
      const denoms = bb >= 2000 ? [500, 1000, 5000, 25000] : [100, 500, 1000, 5000];
      let C, R, head, table;
      if (pre) { const y = bb * rint(2, 4) + unitOf(bb) * rint(0, 3); C = y; R = y - bb; head = `Bui ${fmt(sb)}/${fmt(bb)}. Preflop rilancio a ${fmt(y)}.`; table = actTable({ pre: 1, sb, bb, a: y }); }
      else { const x = bb * rint(1, 6); C = x; R = x; head = `Bui ${fmt(sb)}/${fmt(bb)}. Dopo il flop il primo punta ${fmt(x)}.`; table = actTable({ a: x }); }
      const callTxt = (back) => `Call da ${fmt(C)}${back ? `, restituisci ${fmt(back)}` : ''}`;
      if (want === 'nobet') {
        const big = denoms.filter(d => d > bb); if (!big.length) continue;
        const v = pick(big);
        const t = mkTable(rint(1, 9)); st(t, seatAt(t.button, 1), { hot: true });
        return {
          title: 'Che azione è?', head: `Bui ${fmt(sb)}/${fmt(bb)}. Dopo il flop nessuno ha ancora puntato.`, table: t,
          lines: [`Il primo a parlare mette in silenzio 1 gettone da ${fmt(v)} e ha altri gettoni dietro.`],
          options: shuffle([{ t: `Puntata da ${fmt(v)}`, ok: true }, { t: `Puntata minima da ${fmt(bb)}, restituisci il resto`, ok: false }, { t: 'Check, gli restituisci il gettone', ok: false }]),
          steps: ['Non sta facendo fronte a nessuna puntata.', `Un solo gettone messo senza parlare vale una puntata del massimo possibile per quel gettone: ${fmt(v)}.`],
          rules: ['R46']
        };
      }
      if (want === 'declared') {
        const v = denoms.find(d => d >= C + R && d > C); if (!v) continue;
        return {
          title: 'Che azione è?', head, table, lines: [`Il giocatore di turno dice "raise" senza importo, prima che il gettone tocchi il tavolo, e mette 1 gettone da ${fmt(v)}. Ha altri gettoni dietro.`],
          options: shuffle([{ t: `Rilancio a ${fmt(v)}`, ok: true }, { t: `Rilancio obbligato a ${fmt(C + R)}`, ok: C + R === v }, { t: callTxt(v - C), ok: false }].filter((o, i) => i !== 1 || C + R !== v)),
          steps: [`Ha detto "raise" prima che il gettone toccasse il tavolo, quindi non è un call.`, `Senza importo, il rilancio è il massimo possibile per quel gettone: ${fmt(v)}.`],
          rules: ['R46']
        };
      }
      let chips;
      if (want === 'single') { const v = denoms.find(d => d > C); if (!v) continue; chips = [v]; }
      else {
        const d1 = pick(denoms), lower = denoms.filter(d => d < d1); if (!lower.length) continue;
        const d2 = pick(lower); chips = [];
        for (let i = rint(1, 4); i > 0; i--) chips.push(d1);
        for (let i = rint(1, 6); i > 0; i--) chips.push(d2);
      }
      const T = chips.reduce((a, b) => a + b, 0);
      if (T < C) continue;
      const k = classifyPush(C, R, chips);
      if (k.why !== want) continue;
      const m = Math.min(...chips), half = R / 2, min = C + R;
      const steps = [`Da chiamare: ${fmt(C)}. L'ultimo rilancio o puntata piena vale ${fmt(R)}.`];
      if (k.why === 'single') steps.push(`È un solo gettone, più grande del call, e non ha detto "raise": è un call da ${fmt(C)}. Gli restituisci ${fmt(T - C)}.`);
      else {
        steps.push(`Ha messo ${fmt(T)}. Togli il gettone più piccolo (${fmt(m)}): restano ${fmt(T - m)}, ${T - m < C ? 'meno del call' : 'che coprono il call'}.`);
        if (k.why === 'all') steps.push(`Tutti i gettoni servono per il call: è un call da ${fmt(C)}${T > C ? `, restituisci ${fmt(T - C)}` : ''}.`);
        else {
          steps.push(`Allora vale la regola del 50%: metà del rilancio è ${fmt(half)}, cioè serve arrivare ad almeno ${fmt(C + half)}.`);
          if (k.why === 'half') steps.push(`Ha messo solo ${fmt(T - C)} oltre il call, meno di ${fmt(half)}: è un call, restituisci ${fmt(T - C)}.`);
          else if (k.why === 'forced') steps.push(`Ha messo ${fmt(T - C)} oltre il call, almeno ${fmt(half)}: deve completare il rilancio minimo a ${fmt(min)}.`);
          else steps.push(`Ha messo ${fmt(T)}, già oltre il rilancio minimo di ${fmt(min)}: è un rilancio a ${fmt(T)}.`);
        }
      }
      const options = [{ t: callTxt(T - C), ok: k.kind === 'call' }];
      if (min !== T) options.push({ t: `Rilancio obbligato a ${fmt(min)}`, ok: k.kind === 'forced' });
      if (T !== C) options.push({ t: `Rilancio a ${fmt(T)}`, ok: k.kind === 'raise' });
      return {
        title: 'Che azione è?', head, table, lines: [`Il giocatore di turno mette in silenzio ${chipText(chips)}. Ha altri gettoni dietro.`],
        options: shuffle(options), steps, tip: 'Queste regole valgono quando il giocatore non ha detto nulla. Se dichiara prima, conta la dichiarazione.',
        rules: k.why === 'single' ? ['R46', 'R43'] : ['R47', 'R45', 'I47']
      };
    }
    throw new Error('genPush: nessuno scenario trovato');
  }
  function genReopen() {
    const [sb, bb] = pick(BLINDS), u = unitOf(bb);
    const kind = pick(['backA', 'backA2', 'caller', 'caller2', 'pre', 'preBB']);
    const yes = 'Sì, può rilanciare', no = 'No, può solo chiamare o foldare';
    const opts = ok => shuffle([{ t: yes, ok }, { t: no, ok: !ok }]);
    const btn = rint(1, 9), t = mkTable(btn), head = `Bui ${fmt(sb)}/${fmt(bb)}.`;
    const inc = (max) => u * rint(1, Math.max(1, Math.floor((max - 1) / u)));
    if (kind === 'pre' || kind === 'preBB') {
      const a = inc(bb), z = bb + a;
      st(t, seatAt(btn, 1), { bet: sb, tag: 'FOLD' }); st(t, seatAt(btn, 2), { bet: kind === 'pre' ? z : bb, tag: kind === 'pre' ? 'CHIAMA' : 'BB', hot: kind === 'preBB' });
      st(t, seatAt(btn, 3), { bet: bb, tag: 'CHIAMA', hot: kind === 'pre' }); st(t, seatAt(btn, 4), { bet: z, tag: 'ALL-IN' });
      if (kind === 'pre') return {
        kind, title: 'Si può rilanciare?', head, table: t,
        lines: [`Preflop il posto ${seatAt(btn, 3)} chiama ${fmt(bb)}.`, `Il posto ${seatAt(btn, 4)} va all-in per ${fmt(z)}.`, 'Gli altri foldano, il big blind chiama.', `L'azione torna al posto ${seatAt(btn, 3)}.`],
        options: opts(false),
        steps: [`Il posto ${seatAt(btn, 3)} ha già agito e ora ha davanti solo ${fmt(a)} in più.`, `Un rilancio pieno sarebbe ${fmt(bb)}: ${fmt(a)} è meno.`, 'I rilanci non si riaprono per lui: può solo chiamare o foldare.'],
        tip: 'È l\'Esempio 3-A della regola 49.', rules: ['R49', 'I49']
      };
      return {
        kind, title: 'Si può rilanciare?', head, table: t,
        lines: [`Preflop il posto ${seatAt(btn, 3)} chiama ${fmt(bb)}.`, `Il posto ${seatAt(btn, 4)} va all-in per ${fmt(z)}.`, 'Gli altri foldano fino al big blind.'],
        options: opts(true),
        steps: ['Il big blind non ha ancora agito in questo giro.', 'La limitazione della regola 49 tocca solo chi ha già fatto azione.', `Quindi può rilanciare, almeno a ${fmt(z)} + ${fmt(bb)} = ${fmt(z + bb)}.`],
        tip: 'È l\'Esempio 3-A della regola 49: chi non ha ancora parlato ha tutte le opzioni.', rules: ['R49', 'I49']
      };
    }
    const X = bb * rint(2, 5), k = 1 + rint(0, 1), A = seatAt(btn, k), B = seatAt(btn, k + 1), Cc = seatAt(btn, k + 2), D = seatAt(btn, k + 3);
    const a1 = inc(X), y = X + a1;
    if (kind === 'backA') {
      st(t, A, { bet: X, tag: 'PUNTA', hot: true }); st(t, B, { bet: y, tag: 'ALL-IN' });
      return {
        kind, title: 'Si può rilanciare?', head, table: t, lines: [`Dopo il flop il posto ${A} punta ${fmt(X)}.`, `Il posto ${B} va all-in per ${fmt(y)}.`, 'Gli altri foldano.', `L'azione torna al posto ${A}.`],
        options: opts(false), steps: [`Il posto ${A} ha già agito e ha davanti ${fmt(y)} − ${fmt(X)} = ${fmt(a1)} in più.`, `Un rilancio pieno sarebbe ${fmt(X)}: ${fmt(a1)} è meno.`, 'I rilanci non si riaprono: può solo chiamare o foldare.'],
        rules: ['R49', 'I49']
      };
    }
    if (kind === 'backA2') {
      const need = X - a1, a2 = coin() ? need + u * rint(0, 3) : Math.max(u, need - u * rint(1, 3));
      if (a2 >= X || a2 <= 0) return genReopen();
      const z = y + a2, ok = z - X >= X;
      st(t, A, { bet: X, tag: 'PUNTA', hot: true }); st(t, B, { bet: y, tag: 'ALL-IN' }); st(t, Cc, { bet: z, tag: 'ALL-IN' }); st(t, D, { bet: z, tag: 'CHIAMA' });
      return {
        kind, title: 'Si può rilanciare?', head, table: t, lines: [`Dopo il flop il posto ${A} punta ${fmt(X)}.`, `Il posto ${B} va all-in per ${fmt(y)}.`, `Il posto ${Cc} va all-in per ${fmt(z)}.`, `Il posto ${D} chiama ${fmt(z)}.`, `L'azione torna al posto ${A}.`],
        options: opts(ok),
        steps: ['Presi uno per uno, i due all-in non sono rilanci pieni, ma la regola guarda anche la loro somma.', `Il posto ${A} ha davanti ${fmt(z)} − ${fmt(X)} = ${fmt(z - X)} in più. Un rilancio pieno è ${fmt(X)}.`, ok ? `${fmt(z - X)} arriva almeno a ${fmt(X)}: i rilanci si riaprono. Il minimo resta ${fmt(z)} + ${fmt(X)} = ${fmt(z + X)}.` : `${fmt(z - X)} è meno di ${fmt(X)}: i rilanci non si riaprono.`],
        tip: ok ? 'È l\'Esempio 1 della regola 49.' : '', rules: ['R49', 'I49']
      };
    }
    const a2 = inc(X), z = y + a2;
    if (kind === 'caller') {
      st(t, A, { bet: z, tag: 'CHIAMA' }); st(t, B, { bet: y, tag: 'ALL-IN' }); st(t, Cc, { bet: y, tag: 'CHIAMA', hot: true }); st(t, D, { bet: z, tag: 'ALL-IN' });
      return {
        kind, title: 'Si può rilanciare?', head, table: t,
        lines: [`Dopo il flop il posto ${A} punta ${fmt(X)}.`, `Il posto ${B} va all-in per ${fmt(y)}, il posto ${Cc} chiama.`, `Il posto ${D} va all-in per ${fmt(z)}.`, `Il posto ${A} chiama ${fmt(z)}.`, `L'azione torna al posto ${Cc}.`],
        options: opts(false),
        steps: [`Il posto ${Cc} aveva chiamato ${fmt(y)} e ora ha davanti ${fmt(z)} − ${fmt(y)} = ${fmt(a2)} in più.`, `Per riaprire servirebbe un rilancio pieno, cioè almeno ${fmt(X)}.`, `${fmt(a2)} è meno: può solo chiamare o foldare.`],
        tip: 'È l\'Esempio 1-A della regola 49: ogni giocatore guarda quanto è salita la puntata da quando ha agito lui.', rules: ['R49', 'I49']
      };
    }
    // Example 1-B of rule 49: A may raise only because the short all-ins add up to a full raise.
    if (z - X < X) return genReopen();
    const r = z + X;
    st(t, A, { bet: r, tag: 'RILANCIA' }); st(t, B, { bet: y, tag: 'ALL-IN' }); st(t, Cc, { bet: y, tag: 'CHIAMA', hot: true }); st(t, D, { bet: z, tag: 'ALL-IN' });
    return {
      kind, title: 'Si può rilanciare?', head, table: t,
      lines: [`Dopo il flop il posto ${A} punta ${fmt(X)}.`, `Il posto ${B} va all-in per ${fmt(y)}, il posto ${Cc} chiama.`, `Il posto ${D} va all-in per ${fmt(z)}.`, `Il posto ${A} rilancia a ${fmt(r)}.`, `L'azione torna al posto ${Cc}.`],
      options: opts(true),
      steps: [`Il posto ${Cc} aveva chiamato ${fmt(y)} e ora ha davanti ${fmt(r)} − ${fmt(y)} = ${fmt(r - y)} in più.`, `È almeno un rilancio pieno (${fmt(X)}): i rilanci si riaprono per lui.`],
      tip: 'È l\'Esempio 1-B della regola 49.', rules: ['R49', 'I49']
    };
  }
  const ringFrom = (occ, seat) => { const i = occ.indexOf(seat); return occ.slice(i + 1).concat(occ.slice(0, i + 1)); };
  function genOrder(level) {
    const hu = level !== 'easy' && coin(.25), n = hu ? 2 : rint(level === 'easy' ? 6 : 3, 9);
    const occ = someSeats(n), button = pick(occ), ring = ringFrom(occ, button);
    const table = { button, seats: occ.map(s => ({ n: s })) };
    const pre = coin();
    if (hu) {
      const other = ring[0];
      st(table, button, { tag: 'SB' }); st(table, other, { tag: 'BB' });
      return {
        title: 'Chi parla per primo?', head: 'Heads-up.', lines: [pre ? 'Preflop: sono rimasti in due al torneo o al tavolo.' : 'Dopo il flop: sono rimasti in due al torneo o al tavolo.'], table, answer: pre ? button : other, ask: 'Tocca il posto che parla per primo.',
        steps: ['In heads-up il bottone è anche small blind.', pre ? `Preflop parla per primo il bottone: posto ${button}.` : `Dopo il flop il bottone parla per ultimo: per primo parla il posto ${other}.`],
        rules: ['R36']
      };
    }
    const sbS = ring[0], bbS = ring[1];
    st(table, sbS, { tag: 'SB' }); st(table, bbS, { tag: 'BB' });
    if (pre) {
      const first = ring[2 % n];
      return {
        title: 'Chi parla per primo?', head: 'Preflop, nuova mano.', lines: [`${n} giocatori al tavolo.`], table, answer: first, ask: 'Tocca il posto che parla per primo.',
        steps: [`Bottone al posto ${button}, small blind al ${sbS}, big blind al ${bbS}.`, `Preflop parla il primo a sinistra del big blind: posto ${first}.`, ...(n === 3 ? ['In tre, il primo a sinistra del big blind è proprio il bottone.'] : [])],
        rules: ['G19', 'R36']
      };
    }
    const folded = shuffle(occ).slice(0, rint(0, n - 2));
    folded.forEach(s => st(table, s, { tag: 'FOLD' }));
    const first = ring.find(s => !folded.includes(s));
    const skipped = ring.slice(0, ring.indexOf(first));
    return {
      title: 'Chi parla per primo?', head: 'Dopo il flop.', lines: ['Chi ha il tag FOLD non è più in mano.'], table, answer: first, ask: 'Tocca il posto che parla per primo.',
      steps: [`Dopo il flop parla il primo giocatore ancora in mano a sinistra del bottone (posto ${button}).`, skipped.length ? `Salti ${skipped.length === 1 ? 'il posto' : 'i posti'} ${skipped.join(', ')}, che ha${skipped.length === 1 ? '' : 'nno'} foldato: tocca al posto ${first}.` : `È il posto ${first}.`],
      tip: 'Il bottone resta il riferimento anche se chi ce l\'ha ha foldato.', rules: ['R18']
    };
  }
  function genShow(level) {
    const n = rint(6, 9), occ = someSeats(n), button = pick(occ), ring = ringFrom(occ, button);
    const alive = shuffle(occ).slice(0, rint(2, level === 'easy' ? 3 : 4));
    const inOrder = ring.filter(s => alive.includes(s));
    const table = { button, seats: occ.map(s => ({ n: s, tag: alive.includes(s) ? undefined : 'FOLD' })) };
    table.seats.forEach(s => { if (s.tag === undefined) delete s.tag; });
    const first = inOrder[0];
    const kind = pick(level === 'easy' ? ['check', 'bet'] : ['check', 'bet', 'raise', 'trap']);
    const base = { title: 'Chi mostra per primo?', head: 'Showdown senza all-in. Nessuno mostra spontaneamente.', table, ask: 'Tocca il posto che deve mostrare per primo.', rules: ['R18'], tip: 'Vale quando nessuno mostra spontaneamente: il TD può imporre questo ordine.' };
    if (kind === 'check') return {
      ...base, lines: ['Al river tutti fanno check.'], answer: first,
      steps: ['Al river non c\'è stata nessuna azione aggressiva.', `Allora mostra per primo chi sarebbe il primo a parlare: il primo in mano a sinistra del bottone (posto ${button}).`, `È il posto ${first}.`]
    };
    if (kind === 'trap') {
      const b = pick(inOrder); st(table, b, { note: 'punta al turn' });
      return {
        ...base, lines: [`Al turn il posto ${b} punta e tutti chiamano.`, 'Al river tutti fanno check.'], answer: first,
        steps: ['Conta solo l\'ultimo giro di puntate: il river.', `La puntata del turn non vale. Al river nessuna azione aggressiva, quindi mostra il primo in mano a sinistra del bottone (posto ${button}).`, `È il posto ${first}.`],
        tip: 'È la trappola classica: l\'ultimo aggressore si cerca solo al river.'
      };
    }
    if (kind === 'bet') {
      const b = pick(inOrder); st(table, b, { tag: 'PUNTA' });
      return {
        ...base, lines: [`Al river il posto ${b} punta e gli altri chiamano.`], answer: b,
        steps: [`L'ultima azione aggressiva al river è la puntata del posto ${b}.`, 'Mostra per primo chi l\'ha fatta.']
      };
    }
    const i = rint(0, inOrder.length - 2), b = inOrder[i], r = inOrder[i + 1];
    st(table, b, { tag: 'PUNTA' }); st(table, r, { tag: 'RILANCIA' });
    return {
      ...base, lines: [`Al river il posto ${b} punta, il posto ${r} rilancia e gli altri chiamano.`], answer: r,
      steps: [`Il posto ${b} ha puntato, ma l'ultima azione aggressiva è il rilancio del posto ${r}.`, `Mostra per primo il posto ${r}.`]
    };
  }
  function genBlinds() {
    // SB and BB sit next to each other, so the dead button can only stay on the SB seat (see rule 36-B for the other case).
    const n = rint(6, 9);
    const start = rint(1, 9);
    const fixed = [seatAt(start, 0), seatAt(start, 1), seatAt(start, 2)]; // button, SB, BB
    const others = shuffle(ALL_SEATS.filter(s => !fixed.includes(s))).slice(0, n - 3);
    const occ = [...fixed, ...others].sort((a, b) => a - b);
    const [btn, sb, bb] = fixed, ring = ringFrom(occ, bb);
    const kind = pick(['none', 'sb', 'bb', 'next', 'other']);
    let out = null;
    if (kind === 'sb') out = sb; else if (kind === 'bb') out = bb; else if (kind === 'next') out = ring[0]; else if (kind === 'other') out = pick(occ.filter(s => ![btn, sb, bb, ring[0]].includes(s)));
    const nbb = ring.find(s => s !== out && s !== bb);
    const answer = { btn: sb, sb: out === bb ? 0 : bb, bb: nbb };
    const table = { button: btn, seats: occ.map(s => ({ n: s })) };
    st(table, sb, { tag: 'SB' }); st(table, bb, { tag: 'BB' });
    if (out) st(table, out, { tag: 'ELIMINATO' });
    const lines = [out ? `Il posto ${out} è stato eliminato in questa mano.` : 'Nessuno è stato eliminato in questa mano.', 'Dove vanno bottone, small blind e big blind nella prossima mano?'];
    const steps = [`Il big blind avanza sempre al prossimo giocatore: dal posto ${bb} va al posto ${nbb}${out === ring[0] ? `, saltando il posto ${out} eliminato` : ''}.`];
    if (out === bb) steps.push(`Lo small blind andrebbe al posto ${bb}, che ora è vuoto: nella prossima mano non c'è small blind.`);
    else steps.push(`Lo small blind va dove c'era il big blind: posto ${bb}.`);
    if (out === sb) steps.push(`Il bottone va dove c'era lo small blind: il posto ${sb} è vuoto, quindi è un dead button.`);
    else steps.push(`Il bottone va dove c'era lo small blind: posto ${sb}.`);
    return {
      title: 'Bui e bottone', head: 'Si gioca con il dead button.', lines, table, answer,
      steps, tip: 'Il TDA dice solo che si usa il dead button (regola 34): questa è la procedura standard, in cui nessuno salta il big blind né lo paga due volte di fila. Se ci sono più posti vuoti per giocatori in arrivo il bottone può avanzare ancora (36-B), ma i bui restano questi.',
      rules: ['R34', 'R36', 'R56']
    };
  }
  function genBBAnte() {
    const [sb, bb] = pick(BLINDS), u = unitOf(bb);
    const stack = u * rint(Math.ceil(bb * .3 / u), Math.floor((bb * 2 - u) / u));
    const blind = Math.min(stack, bb), ante = stack - blind;
    const t = mkTable(rint(1, 9)); st(t, seatAt(t.button, 1), { bet: sb, tag: 'SB' }); st(t, seatAt(t.button, 2), { tag: 'BB', hot: true, note: `stack ${fmt(stack)}` });
    const steps = ['Con il big blind ante si calcola prima il buio, poi l\'ante.', stack >= bb ? `Il buio è coperto per intero: ${fmt(bb)}.` : `Non copre nemmeno il buio: mette tutto ${fmt(stack)} nel buio.`, ante ? `Quello che resta va nell'ante: ${fmt(stack)} − ${fmt(bb)} = ${fmt(ante)}.` : 'Per l\'ante non resta niente.'];
    return {
      title: 'BB ante corto', head: `Bui ${fmt(sb)}/${fmt(bb)}, BB ante ${fmt(bb)}.`, lines: [`Il big blind ha solo ${fmt(stack)} e va all-in forzato.`], table: t,
      fields: [{ label: 'Va nel big blind', answer: blind }, { label: 'Va nell\'ante', answer: ante }], steps,
      tip: 'RP-11 raccomanda il calcolo "big blind first". È una procedura raccomandata: controlla sempre le regole della tua sala.', rules: ['RP11']
    };
  }

  // ---------- generators: irregularities, out-of-turn action and wording ----------
  const optsOf = (right, ...wrong) => shuffle([{ t: right, ok: true }, ...wrong.map(t => ({ t, ok: false }))]);
  const MIS = 'Misdeal: si rifà la mano identica (stesso bottone, stessi giocatori)', GO = 'Nessun misdeal: la mano prosegue';
  const ASK = 'Misdeal solo se un giocatore lo chiede', FOUL = 'Mazzo compromesso: fermi il gioco e restituisci tutte le puntate';
  function genMisdeal() {
    const btn = rint(1, 9), t = mkTable(btn), sbS = seatAt(btn, 1), bbS = seatAt(btn, 2);
    const [o1, o2] = shuffle([3, 4, 5, 6, 7, 8]).slice(0, 2).map(k => seatAt(btn, k)), [a1, a2] = [seatAt(btn, 3), seatAt(btn, 4)], tgt = seatAt(btn, 5);
    st(t, sbS, { tag: 'SB' }); st(t, bbS, { tag: 'BB' });
    const sa = (extra) => { st(t, a1, { tag: 'FOLD' }); st(t, a2, { tag: 'CHIAMA', bet: pick(BLINDS)[1] }); st(t, tgt, extra); };
    const kinds = {
      first2: () => { st(t, sbS, { note: 'carta scoperta' }); return { lines: [`Stai distribuendo. Scopri per errore la prima carta, quella dello small blind (posto ${sbS}).`], ok: MIS, wrong: [GO, ASK], steps: ['Una delle prime 2 carte uscite dal mazzo è stata scoperta per errore del dealer.', 'È uno dei casi di misdeal della regola 37-A.'] }; },
      twoDown: () => { st(t, o1, { note: 'carta scoperta' }); st(t, o2, { note: 'carta scoperta' }); return { lines: [`Durante la distribuzione scopri per errore due carte coperte: una del posto ${o1} e una del posto ${o2}.`], ok: MIS, wrong: [GO, ASK], steps: ['Due carte coperte qualunque esposte per errore del dealer sono misdeal.', 'Regola 37-A, punto 6.'] }; },
      box2: () => { st(t, o1, { note: 'carta boxed' }); st(t, o2, { note: 'carta boxed' }); return { lines: [`Finita la distribuzione, due carte risultano girate al contrario nel mazzo: una al posto ${o1} e una al posto ${o2}.`], ok: MIS, wrong: [GO, ASK], steps: ['Due o più carte boxed nella distribuzione iniziale sono misdeal.', 'Regola 37-A, punto 1.'] }; },
      box1: () => { st(t, o1, { note: 'carta boxed' }); return { lines: [`Finita la distribuzione, una sola carta risulta girata al contrario: quella del posto ${o1}.`], ok: GO, wrong: [MIS, ASK], steps: ['La regola 37-A conta come misdeal 2 o più carte boxed nella distribuzione iniziale.', 'Una sola non basta.'] }; },
      wrongSeat: () => { st(t, o1, { note: 'prima carta' }); return { lines: [`Dai la prima carta al posto ${o1}, invece che allo small blind (posto ${sbS}).`], ok: MIS, wrong: [GO, ASK], steps: ['La prima carta distribuita va allo small blind.', 'Se finisce al posto sbagliato è misdeal (regola 37-A).'] }; },
      noHand: () => { st(t, o1, { tag: 'ELIMINATO' }); return { lines: [`Il posto ${o1} è stato eliminato nella mano precedente. Per distrazione gli dai due carte.`], ok: MIS, wrong: [GO, ASK], steps: ['Un posto eliminato non ha diritto a una mano.', 'Dare carte a un posto che non ne ha diritto è misdeal (regola 37-A).'] }; },
      dealtOut: () => { st(t, o1, { note: 'saltato' }); return { lines: [`Salti per errore il posto ${o1}, che ha diritto alla mano.`], ok: MIS, wrong: [GO, ASK], steps: ['Un posto con diritto alla mano che resta senza carte è misdeal.', 'Regola 37-A.'] }; },
      three: () => { st(t, o1, { note: '3 carte' }); return { lines: [`Finita la distribuzione ti accorgi che il posto ${o1} ha ricevuto 3 carte. Nessuno ha ancora agito.`], ok: MIS, wrong: [GO, ASK], steps: ['Un numero sbagliato di carte a un giocatore è misdeal.', 'L\'unica eccezione è il bottone con troppo poche carte (regola 39), non con carte in più.'] }; },
      btn2: () => { st(t, btn, { note: '2 carte di fila' }); return { lines: [`Dai due carte consecutive al giocatore di bottone, il posto ${btn}.`], ok: GO, wrong: [MIS, ASK], steps: ['Il bottone può ricevere 2 carte consecutive.', 'Non è un caso di misdeal (regola 37-B).'] }; },
      sa: () => { sa({ note: '3 carte' }); return { lines: [`Il posto ${a1} folda e il posto ${a2} chiama. Poi ti accorgi che il posto ${tgt} ha 3 carte.`], ok: GO, wrong: [MIS, ASK], steps: ['Fold e call sono azione sostanziale: un\'azione con gettoni più un\'altra azione (regola 38).', 'Dopo azione sostanziale non si può dichiarare misdeal, a meno che il mazzo sia compromesso (regola 37-D).', `La mano del posto ${tgt} è morta: le sue carte vanno nel muck e si brucia una sola carta per strada (regola 40, Esempio 1-B).`], rules: ['R37', 'R38', 'R40'] }; },
      foul: () => { sa({}); return { lines: [`Il posto ${a1} folda e il posto ${a2} chiama. Poi trovi nel mazzo due K di picche.`], ok: FOUL, wrong: [GO, MIS], steps: ['Due carte identiche rendono il mazzo compromesso.', 'Si ferma il gioco e si restituiscono tutte le puntate, anche dopo azione sostanziale (regola 37-E).'] }; }
    };
    const k = kinds[pick(Object.keys(kinds))]();
    return { title: 'È misdeal?', head: 'Hold\'em, nuova mano.', table: t, lines: k.lines, options: optsOf(k.ok, ...k.wrong), steps: k.steps, tip: 'Dopo un misdeal la mano si rifà identica: il bottone non si muove e non entra nessun nuovo giocatore.', rules: k.rules || ['R37', 'R38'] };
  }
  function genOOT() {
    const [, bb] = pick(BLINDS.slice(0, 6)), btn = rint(1, 9), t = mkTable(btn);
    const offs = shuffle([1, 2, 3, 4, 5, 6, 7, 8, 9]).slice(0, 4).sort((a, b) => a - b), P = offs.map(k => seatAt(btn, k));
    t.seats.forEach(s => { if (!P.includes(s.n)) s.tag = 'FOLD'; });
    const kind = pick(['call', 'raise', 'fold', 'hu']), X = bb * rint(2, 5);
    if (kind === 'hu') {
      const [A, B] = P; t.seats.forEach(s => { if (s.n !== A && s.n !== B) s.tag = 'FOLD'; else delete s.tag; });
      st(t, A, { bet: X, tag: 'PUNTA', hot: true }); st(t, B, { tag: 'CHECK', note: 'fuori turno' });
      return {
        title: 'Cosa vale?', head: 'Heads-up, dopo il flop.', table: t,
        lines: [`Tocca al posto ${A}, ma il posto ${B} fa check fuori turno.`, `Il posto ${A} agisce e punta ${fmt(X)}.`, `Cosa può fare il posto ${B}?`],
        options: optsOf('Chiamare o foldare, ma non rilanciare in questo giro', 'Ha tutte le opzioni: il check fuori turno non vincola', 'Solo foldare', 'Rilanciare, ma solo con il rilancio minimo'),
        steps: ['In heads-up, un\'azione passiva fuori turno (il check) vincola in parte.', `Il posto ${B} può solo chiamare o foldare davanti alla puntata, non rilanciare in questo giro (regola 55-B).`], tip: 'In heads-up il check fuori turno non è azione libera: toglie il rilancio.', rules: ['R55', 'I55-B']
      };
    }
    const [B, A, C] = P, head = `Dopo il flop, in ${P.length} ancora in mano.`;
    st(t, B, { bet: X, tag: 'PUNTA' }); st(t, A, { hot: true });
    if (kind === 'call') {
      st(t, A, { tag: 'FOLD', hot: false }); st(t, C, { bet: X, tag: 'CHIAMA', note: 'fuori turno' });
      return {
        title: 'Cosa vale?', head, table: t,
        lines: [`Il posto ${B} punta ${fmt(X)}.`, `Tocca al posto ${A}, ma il posto ${C} chiama ${fmt(X)} fuori turno.`, `Il posto ${A} folda.`, `Cosa succede al call del posto ${C}?`],
        options: optsOf(`Resta valido: il fold del posto ${A} non cambia l'azione`, 'Viene annullato: l\'azione è cambiata', `Il posto ${C} riprende i gettoni e sceglie di nuovo`, `Il posto ${C} è fuori dalla mano`),
        steps: [`L'azione si riporta al giocatore giusto, il posto ${A}.`, 'Un check, un call o un fold del giocatore giusto non cambiano l\'azione.', `Quindi il call fuori turno del posto ${C} è vincolante, con una possibile penalità.`], tip: 'Fuori turno: se l\'azione non cambia, resta valido. Vale per check, call e raise.', rules: ['R55', 'I55-A1']
      };
    }
    if (kind === 'raise') {
      const Y = X * 3, Z = X * 4;
      st(t, C, { bet: Y, tag: 'RILANCIA', note: 'fuori turno' }); st(t, A, { bet: Z, tag: 'RILANCIA', hot: false });
      return {
        title: 'Cosa vale?', head, table: t,
        lines: [`Il posto ${B} punta ${fmt(X)}.`, `Tocca al posto ${A}, ma il posto ${C} rilancia a ${fmt(Y)} fuori turno.`, `L'azione torna al posto ${A}, che rilancia a ${fmt(Z)}.`, `Cosa può fare ora il posto ${C}?`],
        options: optsOf('Riprende i gettoni e può chiamare, rilanciare o foldare', 'Deve lasciare il suo rilancio nel piatto e può solo chiamare', 'Deve foldare: ha agito fuori turno', `Può solo chiamare ${fmt(Z)} senza riprendere i gettoni`),
        steps: [`Il rilancio del posto ${A} cambia l'azione.`, `Quindi il rilancio fuori turno del posto ${C} non è più vincolante: i suoi gettoni gli tornano.`, `Il posto ${C} ha di nuovo tutte le opzioni: call, raise o fold.`], tip: 'L\'azione fuori turno vale solo se l\'azione non cambia fino a chi ha agito fuori turno.', rules: ['R55', 'I55-A1']
      };
    }
    st(t, C, { tag: 'FOLD', note: 'fuori turno' }); st(t, A, { bet: X * 3, tag: 'RILANCIA', hot: false });
    return {
      title: 'Cosa vale?', head, table: t,
      lines: [`Il posto ${B} punta ${fmt(X)}.`, `Tocca al posto ${A}, ma il posto ${C} folda fuori turno.`, `L'azione torna al posto ${A}, che rilancia a ${fmt(X * 3)}.`, `Il fold del posto ${C} è valido?`],
      options: optsOf('Sì, un fold fuori turno è sempre vincolante', 'No: dopo il rilancio l\'azione è cambiata e può tornare in mano', 'Solo se non aveva ancora toccato le carte', 'Decide il giocatore che ha rilanciato'),
      steps: ['Check, call e raise fuori turno valgono solo se l\'azione non cambia.', `Il fold fuori turno invece è sempre vincolante: anche dopo il rilancio del posto ${A} il posto ${C} resta fuori dalla mano.`], tip: 'Il fold fuori turno è l\'unico che non si recupera.', rules: ['R55', 'I55-A1']
    };
  }
  function genWords() {
    const [sb, bb] = pick(BLINDS.slice(0, 6)), btn = rint(1, 9), t = mkTable(btn), me = seatAt(btn, rint(1, 8)), op = seatAt(me, 8), X = bb * rint(2, 5);
    st(t, me, { hot: true });
    const bet = () => st(t, op, { bet: X, tag: 'PUNTA' });
    const S = [
      () => ({ say: 'dice "call"', ask: 'Che azione è?', ok: 'Un check', wrong: [`Una puntata da ${fmt(bb)}`, 'Un\'azione non valida: deve ripetere', 'Un fold'], steps: ['Non c\'è nessuna puntata da chiamare.', 'Chi dice "call" senza puntate di fronte fa check.'], rules: ['R57'] }),
      () => ({ say: 'dice "raise"', ask: 'Che azione è?', ok: `Deve fare almeno una puntata minima valida (${fmt(bb)})`, wrong: ['Un check', 'Un all-in', `Deve puntare esattamente il doppio del big blind (${fmt(bb * 2)})`], steps: ['Non c\'è nessuna puntata da rilanciare.', 'Chi dice "raise" senza puntate di fronte deve fare almeno una puntata minima valida (regola 57-B).'], rules: ['R57'] }),
      () => { bet(); return { facing: 1, say: 'dice "check"', ask: 'Che cosa può fare ora?', ok: 'Può chiamare o foldare, ma non rilanciare', wrong: ['Il check vale come fold', 'Può ancora rilanciare', 'La dichiarazione è nulla e decide da capo'], steps: [`Davanti a una puntata di ${fmt(X)} dice "check".`, 'Chi dice "check" facendo fronte a una puntata può fare call o fold, ma non rilanciare (regola 57).'], rules: ['R57'] }; },
      () => ({ say: 'batte la mano sul tavolo', ask: 'Che azione è?', ok: 'Un check', wrong: ['Niente: serve sempre una dichiarazione a voce', `Una puntata minima da ${fmt(bb)}`, 'Un fold'], steps: ['Senza una puntata di fronte, battere o picchiettare sul tavolo è un check (regola 3-A).'], rules: ['R3'] }),
      () => { bet(); return { facing: 1, say: 'dice "pot" (no-limit)', ask: 'Che valore ha?', ok: `Non è una puntata valida, ma lo vincola a un rilancio valido (almeno a ${fmt(X * 2)})`, wrong: ['Rilancia del valore esatto del piatto', 'È un call', 'È un fold'], steps: ['In no-limit "pot" non è una puntata valida.', 'Però lo vincola a una puntata valida, e può dare una penalità. Davanti a una puntata deve fare un rilancio valido (regola 56-D).'], rules: ['R56'] }; },
      () => ({ say: 'dice "se punti, io rilancio"', ask: 'Che valore ha?', ok: 'È una dichiarazione condizionale non standard: il TD può vincolarla e penalizzarla', wrong: ['È un check', `È una puntata minima da ${fmt(bb)}`, 'Non ha nessun valore: la ignori'], steps: ['Le dichiarazioni "se… allora…" sono non standard e fortemente scoraggiate.', 'A discrezione del TD possono essere vincolanti e/o penalizzate (regola 61-A).'], rules: ['R61'] }),
      () => { bet(); return { facing: 1, say: 'chiede ad alta voce "ha rilanciato?"', ask: 'Che rischio c\'è?', ok: 'Può essere interpretata come dichiarazione di rilancio e diventare vincolante', wrong: ['È solo una domanda, non può mai vincolare', 'Vale come fold', 'Vale come call'], steps: ['Usare un termine ufficiale in una domanda può essere ritenuto vincolante, se interpretato come l\'azione voluta.', 'Meglio una domanda neutra: "qual è stata la sua azione?" (regola 3-B).'], rules: ['R3'] }; },
      () => { bet(); return { facing: 1, say: `spinge i gettoni per un call da ${fmt(X)}, poi torna al suo stack a prenderne altri da aggiungere`, ask: 'Che cos\'è?', ok: 'String bet: non è ammessa', wrong: ['Un rilancio valido, fatto in due movimenti', 'Un call con aggiunta facoltativa', 'Un rilancio valido se non ha parlato'], steps: ['Mette fuori una puntata e poi torna allo stack per aggiungere: sono più movimenti.', 'Le string bet e i string raise non sono ammessi (regola 58).'], rules: ['R58'] }; },
      () => { bet(); const R = X * 3; return { facing: 1, say: `dichiara "raise a ${fmt(R)}" e poi mette i gettoni in due movimenti`, ask: 'È valido?', ok: 'Sì, ha dichiarato il totale prima di mettere i gettoni', wrong: ['No, è uno string raise', 'È solo un call', 'Vale l\'importo dei primi gettoni messi'], steps: [`Ha dichiarato il totale (${fmt(R)}) prima di mettere i gettoni.`, 'Il rilancio è valido se è in un solo movimento oppure se il totale è dichiarato prima (regola 44).'], rules: ['R44'] }; }
    ];
    const k = pick(S)();
    return { title: 'Cosa vale?', head: `Bui ${fmt(sb)}/${fmt(bb)}, no-limit. Dopo il flop.`, table: t, lines: [k.facing ? `Il posto ${op} ha puntato ${fmt(X)}.` : 'Nessuno ha ancora puntato.', `Il posto ${me} ${k.say}.`, k.ask], options: optsOf(k.ok, ...k.wrong), steps: k.steps, tip: 'Chi parla al tavolo sceglie le parole: se sono non standard, rischia un\'interpretazione diversa da quella che voleva.', rules: k.rules };
  }
  function genPenalty(level) {
    const n = rint(4, 9), rounds = rint(1, 3), occ = someSeats(n), off = pick(occ);
    const table = { button: pick(occ), seats: occ.map(s => ({ n: s })) };
    st(table, off, { tag: 'PENALITÀ', hot: true });
    const twist = level !== 'easy' && coin(.5);
    const lines = [`Al tavolo siete in ${n}, il giocatore penalizzato compreso (posto ${off}).`, `Il floor gli dà ${rounds} ${rounds === 1 ? 'giro' : 'giri'} di penalità.`];
    if (twist) lines.push('Subito dopo, due giocatori al tavolo vengono eliminati.');
    const total = n * rounds;
    return {
      title: 'Quante mani salta?', head: '', lines, table, fields: [{ label: 'Mani saltate', answer: total }],
      steps: [`Salta una mano per ogni giocatore al tavolo, lui compreso, al momento della penalità: ${n}.`, `Per ${rounds} ${rounds === 1 ? 'giro' : 'giri'}: ${n} × ${rounds} = ${total}.`, ...(twist ? ['Le eliminazioni successive non cambiano il conto: si usa il numero di giocatori quando la penalità è data.'] : [])],
      tip: 'Intanto le carte vanno al suo posto, bui e ante si raccolgono e la mano si folda a fine distribuzione.', rules: ['R74']
    };
  }

  // The answer that grades as right: used for the timeout (to show the explanation) and by the tests.
  function solve(type, q) {
    const k = kindOf(type, q);
    if (k === 'felt') return { z: Object.fromEntries(Object.entries(q.felt.want).map(([id, v]) => [id, chipsFor(v)])), vals: (q.fields || []).map(f => String(f.answer)) };
    if (k === 'win') return { seats: winners(q.board, q.holes).win };
    if (k === 'name') { const b = best(q.board.concat(q.hole)); return { cat: b.score[0], cards: b.five }; }
    if (k === 'board') { const i = boardInfo(q.board); return { paired: i.paired, flush: i.flush, straight: i.straight, cat: i.nut[0] }; }
    if (k === 'num') return { vals: q.fields.map(f => String(f.answer)) };
    if (k === 'choice') return { opt: q.options.findIndex(o => o.ok) };
    if (k === 'seat') return { seat: q.answer };
    return { roles: q.answer };
  }
  // Seconds a dealer should need at the table. The timed session counts down from these.
  const TARGET = { win: 25, name: 30, board: 30, side: 90, pay: 90, raise: 30, call: 20, pot: 60, odd: 60, chips: 30, push: 25, reopen: 30, order: 15, show: 20, blinds: 30, bbante: 25, misdeal: 20, oot: 25, words: 20, penalty: 20, quiz: 20 };

  let QUIZ = [];
  function quizQ(id) {
    const x = QUIZ.find(k => k.id === id) || pick(QUIZ);
    return {
      id: x.id, title: 'Quiz TDA', head: x.cat || '', lines: [x.q], quiz: true,
      options: shuffle(x.a.map((t, i) => ({ t, ok: i === 0 }))), steps: [x.why], tip: x.tip || '', rules: x.r
    };
  }
  const GEN = { win: genWin, name: genName, board: genBoardRead, side: genSide, pay: genPay, raise: genMinRaise, call: genCall, pot: genPot, odd: genOdd, chips: genChips, push: genPush, reopen: genReopen, order: genOrder, show: genShow, blinds: genBlinds, bbante: genBBAnte, misdeal: genMisdeal, oot: genOOT, words: genWords, penalty: genPenalty, quiz: () => quizQ() };
  const TYPES = {
    win: { n: 'Chi vince?', d: 'Board e mani scoperte, tocca il vincitore', g: 'p', k: 'win' },
    name: { n: 'Trova il punto', d: 'Nomina il punto e tocca le 5 carte', g: 'p', k: 'name' },
    board: { n: 'Leggi il board', d: 'Coppia, colore, scala e punto massimo', g: 'p', k: 'board' },
    side: { n: 'Side pot', d: 'Conta gli all-in e sposta le chips nei piatti', g: 'c', k: 'num' },
    pay: { n: 'Pagamenti', d: 'Spingi le chips ai vincitori, anche con i pareggi', g: 'c', k: 'num' },
    raise: { n: 'Rilancio minimo', d: 'Anche con all-in incompleti', g: 'c', k: 'num' },
    call: { n: 'Quanto chiamare', d: 'Quanto manca a chi ha già messo', g: 'c', k: 'num' },
    pot: { n: 'Conta il piatto', d: 'Raccogli le puntate e conta le chips', g: 'c', k: 'num' },
    odd: { n: 'Fiche dispari', d: 'Dividi le chips, cambio compreso', g: 'c', k: 'num' },
    chips: { n: 'Conta lo stack', d: 'Pile da 20, come al tavolo', g: 'c', k: 'num' },
    push: { n: 'Call o rilancio?', d: 'Gettoni in silenzio e regola del 50%', g: 'a', k: 'choice' },
    reopen: { n: 'Riapre i rilanci?', d: 'All-in corti, regola 49', g: 'a', k: 'choice' },
    order: { n: 'Chi parla?', d: 'Primo ad agire, anche in heads-up', g: 'a', k: 'seat' },
    show: { n: 'Chi mostra prima?', d: 'Ordine allo showdown', g: 'a', k: 'seat' },
    blinds: { n: 'Bui e bottone', d: 'Dead button dopo un\'eliminazione', g: 'a', k: 'roles' },
    bbante: { n: 'BB ante corto', d: 'Prima il buio, poi l\'ante', g: 'a', k: 'num' },
    misdeal: { n: 'È misdeal?', d: 'Carte girate, distribuzioni sbagliate, mazzo compromesso', g: 'a', k: 'choice' },
    oot: { n: 'Azione fuori turno', d: 'Cosa resta valido e cosa torna indietro', g: 'a', k: 'choice' },
    words: { n: 'Parole e gesti', d: 'Check, call e raise detti nel momento sbagliato', g: 'a', k: 'choice' },
    penalty: { n: 'Giri di penalità', d: 'Quante mani salta chi è penalizzato', g: 'a', k: 'num' },
    quiz: { n: 'Quiz TDA', d: 'Situazioni reali, con la regola', g: 't', k: 'choice' }
  };
  const GROUPS = { p: 'Punti', c: 'Calcoli da torneo', a: 'Azione al tavolo', t: 'Regolamento' };

  // ---------- grading: same input, same explanation, also for the review list ----------
  function grade(type, q, a) {
    const k = kindOf(type, q);
    if (k === 'felt') {
      if (!a.z) return null;
      const vals = (q.fields || []).map((f, i) => parseNum(a.vals && a.vals[i] != null ? a.vals[i] : ''));
      if (vals.some(Number.isNaN)) return null;
      const inOrder = !q.felt.order || payOrderOk(a.seq);
      return { ok: inOrder && feltOk(q.felt, a.z) && (q.fields || []).every((f, i) => vals[i] === f.answer), steps: inOrder ? q.steps : ['Hai toccato il piatto principale prima di aver finito i side pot: si assegnano prima i side pot, poi il principale.', ...q.steps], tip: q.tip, rules: q.rules };
    }
    if (k === 'win') {
      if (!a.seats || !a.seats.length) return null;
      const { board, holes } = q, w = winners(board, holes);
      const ok = a.seats.slice().sort().join() === w.win.slice().sort().join();
      const label = i => SLOTS[holes.length][i] + 1;
      const steps = [boardLine(board)];
      holes.forEach((h, i) => steps.push(`Posto ${label(i)}: ${describe(w.res[i].score)}. Le 5 carte: ${toks(byRank(w.res[i].five))}. ${usedText(w.res[i].five, h).replace(/^./, m => m.toUpperCase())}.`));
      steps.push(verdictLine(board, holes));
      const boardPlays = w.win.length > 1 && cmp(w.top, eval5(board)) === 0;
      const rules = ['R13', 'R14']; if (boardPlays) rules.push('R20'); if (w.win.length > 1) rules.push('R21');
      return { ok, steps, tip: boardPlays ? 'Per dividere col board il giocatore deve comunque mostrare entrambe le carte (regola 20).' : 'Le carte parlano: leggi tu le mani, quello che dice il giocatore non conta (regola 13).', rules };
    }
    if (k === 'name') {
      if (a.cat == null || !a.cards || a.cards.length !== 5) return null;
      const { board, hole } = q, b = best(board.concat(hole)), mine = eval5(a.cards);
      const ok = a.cat === b.score[0] && cmp(mine, b.score) === 0;
      const steps = [`Il punto è: ${describe(b.score)}.`, `Le 5 carte: ${toks(byRank(b.five))}. ${usedText(b.five, hole).replace(/^./, m => m.toUpperCase())}.`];
      if (a.cat === b.score[0] && !ok) steps.push(`Categoria giusta, ma con le 5 carte che hai toccato fai ${describe(mine).toLowerCase()}.`);
      nearMiss(board, hole, b.score).forEach(l => steps.push(l));
      return { ok, steps, tip: 'Metodo: parti dal punto più alto possibile e scendi. Il punto è sempre fatto da 5 carte esatte.', rules: ['R13', 'R14'] };
    }
    if (k === 'board') {
      if (a.paired == null || a.flush == null || a.straight == null || a.cat == null) return null;
      const i = boardInfo(q.board), f = boardFacts(q.board);
      const ok = a.paired === i.paired && a.flush === i.flush && a.straight === i.straight && a.cat === i.nut[0];
      const steps = [];
      steps.push(i.paired ? `Accoppiato: sì, ${f.groups[0][1] === 3 ? 'c\'è un tris' : f.groups[0][1] === 4 ? 'c\'è un poker' : f.groups.length > 1 ? 'ci sono due coppie' : `ci sono due ${RN(f.groups[0][0])}`}. Full e poker sono possibili.` : 'Accoppiato: no, nessuna carta uguale. Full e poker sono impossibili.');
      steps.push(i.flush ? `Colore: sì, ci sono ${f.suitN} carte di ${SUITN[f.topSuit]}. ${f.suitN >= 5 ? 'È già sul board.' : f.suitN === 4 ? 'Basta 1 carta di quel seme in mano.' : 'Servono 2 carte di quel seme in mano.'}` : 'Colore: no, servono almeno 3 carte dello stesso seme sul board.');
      steps.push(i.straight ? `Scala: sì, ${seqText(f.run.inside)} stanno dentro 5 valori consecutivi.` : 'Scala: no, nessun gruppo di 3 carte sta dentro 5 valori consecutivi.');
      steps.push(`Il punto massimo adesso è ${describe(i.nut).toLowerCase()}, per esempio con ${toks(i.nutHole)}.`);
      return { ok, steps, tip: 'Fai queste domande a ogni strada, mentre i giocatori pensano: allo showdown dovrai solo confrontare.', rules: ['R14'] };
    }
    if (k === 'num') {
      const vals = q.fields.map((f, i) => parseNum(a.vals && a.vals[i] != null ? a.vals[i] : ''));
      if (vals.some(Number.isNaN)) return null;
      return { ok: q.fields.every((f, i) => vals[i] === f.answer), steps: q.steps, tip: q.tip, rules: q.rules };
    }
    if (k === 'choice') {
      if (a.opt == null) return null;
      return { ok: !!q.options[a.opt].ok, steps: q.steps, tip: q.tip, rules: q.rules };
    }
    if (k === 'seat') {
      if (a.seat == null) return null;
      return { ok: a.seat === q.answer, steps: q.steps, tip: q.tip, rules: q.rules };
    }
    if (k === 'roles') {
      const r = a.roles || {};
      if (r.btn == null || r.sb == null || r.bb == null) return null;
      return { ok: r.btn === q.answer.btn && r.sb === q.answer.sb && r.bb === q.answer.bb, steps: q.steps, tip: q.tip, rules: q.rules };
    }
    return null;
  }

  // ---------- selection test: same code, same exam, so candidates can be compared ----------
  const SEL = {
    pass: 85, areaMin: 70, slack: 2, level: 'hard',
    areas: [
      { n: 'Lettura dei punti', t: ['win', 'win', 'win', 'win', 'name', 'name', 'board', 'board'] },
      { n: 'Piatti e chips', t: ['side', 'side', 'pay', 'pay', 'pot', 'odd', 'chips'] },
      { n: 'Calcoli di puntata', t: ['raise', 'raise', 'call', 'call', 'bbante'] },
      { n: 'Procedura al tavolo', t: ['push', 'reopen', 'order', 'show', 'blinds', 'misdeal', 'oot', 'words', 'penalty'] },
      { n: 'Regolamento TDA', t: ['quiz', 'quiz', 'quiz', 'quiz', 'quiz', 'quiz'] }
    ]
  };
  function seeded(code) {
    let h = 1779033703;
    for (const c of String(code)) { h = Math.imul(h ^ c.charCodeAt(0), 3432918353); h = h << 13 | h >>> 19; }
    return () => { h = h + 0x6D2B79F5 | 0; let t = Math.imul(h ^ h >>> 15, 1 | h); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  }
  function selectionPlan(code) {
    const prev = rnd; rnd = seeded(code);
    try {
      const ids = shuffle(QUIZ.map(x => x.id));
      return shuffle(SEL.areas.flatMap(a => a.t.map(type => ({ type, area: a.n, q: type === 'quiz' ? quizQ(ids.pop()) : GEN[type](SEL.level, true) }))));
    } finally { rnd = prev; }
  }
  // What was not answered counts as wrong: the base is always the whole exam.
  function scoreSelection(items) {
    const areas = SEL.areas.map(a => { const ok = items.filter(x => x.area === a.n && x.ok).length; return { n: a.n, ok, total: a.t.length, pct: Math.round(ok / a.t.length * 100) }; });
    const total = areas.reduce((s, a) => s + a.total, 0), ok = areas.reduce((s, a) => s + a.ok, 0), pct = Math.round(ok / total * 100);
    return { ok, total, pct, areas, answered: items.length, inTime: items.filter(x => !x.to && x.ms <= TARGET[x.type] * 1000).length, timeouts: items.filter(x => x.to).length, pass: items.length === total && pct >= SEL.pass && areas.every(a => a.pct >= SEL.areaMin) };
  }

  const api = {
    RANKS, SUITS, SYM, SUITN, CATS, RN, rv, fmt, parseNum, deck, deckMinus, shuffle, pick, eval5, cmp, best, describe, winners, boardInfo, boardFacts, straightWindow,
    computePots, payouts, splitPot, classifyPush, SEL, selectionPlan, scoreSelection, payOrderOk, chipsFor, zoneSum, moveChips, breakChips, feltOk, kindOf, potName, DENOMS, sideScenario, trapBoard, GEN, TYPES, GROUPS, grade, quizQ, verdictLine, LV, SLOTS, solve, TARGET,
    setQuiz: list => { QUIZ = list; }, quizList: () => QUIZ, ringFrom, seatAt
  };
  root.DT = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
