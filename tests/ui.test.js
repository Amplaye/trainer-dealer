// node tests/ui.test.js  (serves the folder on localhost, so the service worker runs as in production)
const path = require('path'), fs = require('fs'), http = require('http');
const { chromium } = require(path.join(process.env.APPDATA, 'npm/node_modules/playwright'));
const root = path.join(__dirname, '..');
const out = path.join(process.env.LOCALAPPDATA, 'Temp/trainer-dealer-test/v2'); fs.mkdirSync(out, { recursive: true });
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };
const server = http.createServer((q, s) => {
  const p = decodeURIComponent(q.url.split('?')[0]); const f = path.join(root, p === '/' ? 'index.html' : p);
  fs.readFile(f, (e, d) => { if (e) { s.writeHead(404); s.end(); } else { s.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'text/plain' }); s.end(d); } });
});
const TYPES = ['win', 'name', 'board', 'side', 'pay', 'raise', 'call', 'pot', 'odd', 'chips', 'push', 'reopen', 'order', 'show', 'blinds', 'bbante', 'misdeal', 'oot', 'words', 'penalty', 'quiz'];
const errs = [];
const verdict = p => p.textContent('.res b.t');

async function answer(p, right, touch) {
  const plan = await p.evaluate(() => {
    const { type, q } = cur, k = DT.kindOf(type, q);
    if (k === 'felt') return { k, sol: DT.solve(type, q), fields: !!q.fields };
    if (k === 'win') return { k, seats: DT.winners(q.board, q.holes).win };
    if (k === 'name') { const b = DT.best(q.board.concat(q.hole)); return { k, cat: b.score[0], five: b.five }; }
    if (k === 'board') { const i = DT.boardInfo(q.board); return { k, i: { paired: i.paired, flush: i.flush, straight: i.straight }, cat: i.nut[0] }; }
    if (k === 'num') return { k, vals: q.fields.map(f => f.answer) };
    if (k === 'choice') return { k, opt: q.options.findIndex(o => o.ok), wrong: q.options.findIndex(o => !o.ok) };
    if (k === 'seat') return { k, seat: q.answer, seats: q.table.seats.filter(s => s.tag !== 'FOLD').map(s => s.n) };
    return { k, a: q.answer, seats: q.table.seats.map(s => s.n) };
  });
  const { k } = plan;
  if (k === 'felt') {
    await p.evaluate(({ sol, right }) => { cur.a.z = right ? sol.z : { ...sol.z, p0: [...sol.z.p0, 100] }; render(); }, { sol: plan.sol, right });
    if (plan.fields) { const v = plan.sol.vals[0]; if (touch) { await p.click('#f0'); for (const d of v) await p.click(`[data-act=key][data-v="${d}"]`); } else await p.fill('#f0', v); }
  }
  else if (k === 'win') { const s = right ? plan.seats : (plan.seats.includes(0) && plan.seats.length === 1 ? [1] : [0]); for (const i of s) await p.click(`[data-act=seat][data-v="${i}"]`); }
  else if (k === 'name') { await p.click(`[data-act=cat][data-v="${right ? plan.cat : (plan.cat + 1) % 9}"]`); for (const c of plan.five) await p.click(`[data-act=card][data-v="${c}"]`); }
  else if (k === 'board') { for (const x of ['paired', 'flush', 'straight']) await p.click(`[data-act=yn][data-k=${x}][data-v="${plan.i[x] ? 1 : 0}"]`); await p.click(`[data-act=cat][data-v="${right ? plan.cat : (plan.cat + 1) % 9}"]`); }
  else if (k === 'num') {
    for (let i = 0; i < plan.vals.length; i++) {
      const v = String(right ? plan.vals[i] : plan.vals[i] + 100);
      if (touch) { await p.click('#f' + i); for (const d of v) await p.click(`[data-act=key][data-v="${d}"]`); }
      else await p.fill('#f' + i, v);
    }
  }
  else if (k === 'choice') await p.click(`.opts [data-v="${right ? plan.opt : plan.wrong}"]`);
  else if (k === 'seat') { const w = plan.seats.find(s => s !== plan.seat); await p.click(`[data-act=pickseat][data-v="${right ? plan.seat : w}"]`); }
  else {
    await p.click('[data-act=role][data-v=bb]'); await p.click(`[data-act=pickseat][data-v="${right ? plan.a.bb : plan.seats.find(s => s !== plan.a.bb)}"]`);
    await p.click('[data-act=role][data-v=sb]');
    if (plan.a.sb === 0) await p.click('[data-act=nosb]'); else await p.click(`[data-act=pickseat][data-v="${plan.a.sb}"]`);
    await p.click('[data-act=role][data-v=btn]'); await p.click(`[data-act=pickseat][data-v="${plan.a.btn}"]`);
  }
}
const overflow = async (p, tag) => { const o = await p.evaluate(() => document.documentElement.scrollWidth - innerWidth); if (o > 0) errs.push(`overflow ${o}px in ${tag}`); };
const clash = async (p, tag) => {
  const bad = await p.evaluate(() => {
    const t = document.querySelector('.table'); if (!t) return [];
    const els = [...t.querySelectorAll('.ts,.tboard,.potlbl,.you,.stacks,.tb')], R = e => e.getBoundingClientRect(), out = [], tb = R(t);
    for (let i = 0; i < els.length; i++) for (let j = i + 1; j < els.length; j++) { const a = R(els[i]), c = R(els[j]); if (a.left < c.right - 2 && c.left < a.right - 2 && a.top < c.bottom - 2 && c.top < a.bottom - 2) out.push(els[i].className + ' x ' + els[j].className); }
    els.forEach(e => { const r = R(e); if (r.left < tb.left - 2 || r.right > tb.right + 2 || r.top < tb.top - 2 || r.bottom > tb.bottom + 2) out.push('fuori: ' + e.className); });
    return out;
  });
  if (bad.length) errs.push(`tavolo ${tag}: ${bad.slice(0, 2).join(' | ')}`);
};
async function drill(p, tag, touch, shots) {
  await p.goto(base + '#/'); await p.waitForSelector('.start');
  await p.click('[data-act=level][data-v=hard]');
  for (const t of TYPES) {
    await p.click(`[data-act=start][data-v=${t}]`);
    await p.waitForSelector('[data-act=confirm]');
    await p.click('[data-act=confirm]');
    if (!(await p.textContent('#hint'))) errs.push('nessun avviso a risposta vuota in ' + t);
    for (let i = 0; i < 4; i++) {
      await answer(p, true, touch); await overflow(p, t); await clash(p, tag + ' ' + t);
      if (shots && i === 0) await p.screenshot({ path: `${out}/${tag}-${t}-q.png`, fullPage: true });
      await p.click('[data-act=confirm]');
      const v = await verdict(p); if (v !== 'Giusto') errs.push(`${tag} ${t}: risposta giusta segnata ${v}`);
      await overflow(p, t + ' esito');
      if (shots && i === 0) await p.screenshot({ path: `${out}/${tag}-${t}-r.png`, fullPage: true });
      await p.click('[data-act=next]');
    }
    await answer(p, false, touch);
    await p.click('[data-act=confirm]');
    if (await verdict(p) !== 'Sbagliato') errs.push(`${tag} ${t}: sbagliata segnata giusta`);
    await p.click('[data-act=same]');
    await p.waitForSelector('[data-act=confirm]');
    await p.click('[data-act=exit]');
    await p.waitForSelector('.start');
  }
}
let base;
(async () => {
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}/`;
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
  const p = await ctx.newPage();
  p.on('pageerror', e => errs.push('JS: ' + e.message));
  p.on('console', m => m.type() === 'error' && !/favicon/.test(m.text()) && errs.push('console: ' + m.text()));
  await drill(p, 'm', true, true);
  console.log('telefono: tutti gli esercizi ok');

  // chips: tap to count, tap to place, change, side pot, wrong total shows the fix
  await p.click('[data-act=start][data-v=side]'); await p.waitForSelector('.felt2');
  await p.screenshot({ path: out + '/felt-side.png', fullPage: true });
  await p.evaluate(() => { Object.assign(cur.q.felt, { z: { s1: [1000, 1000, 500], s2: [5000], p0: [] }, want: { s1: 0, s2: 2500, p0: 5000 }, min: 500, add: true }); cur.q.table.seats = [{ n: 1, tag: 'ALL-IN' }, { n: 2, tag: 'ALL-IN' }]; render(); });
  const inZ = id => p.evaluate(i => zones()[i].slice().sort((a, b) => a - b).join(), id);
  await p.click('[data-z=s1][data-v="1000"]'); await p.click('[data-z=s1][data-v="1000"]');
  if (await inZ('s1') !== '500,1000,1000') errs.push('il tocco non deve spostare finché non posi');
  await p.click('.zone[data-z=p0] .zh');
  if (await inZ('p0') !== '1000,1000' || await inZ('s1') !== '500') errs.push('tocca e posa');
  await p.click('[data-z=s2][data-v="5000"]'); await p.click('button[data-z=change]');
  if (await inZ('s2') !== '1000,1000,1000,1000,1000') errs.push('cambio');
  await p.click('[data-z=s2][data-v="1000"]'); await p.click('[data-act=putback]');
  if (await p.evaluate(() => cur.hand)) errs.push('rimetti giù');
  await p.click('[data-act=addpot]'); if (!await p.$('.zone[data-z=p1]')) errs.push('side pot non aperto');
  await p.screenshot({ path: out + '/felt-moves.png', fullPage: true });
  await p.click('[data-act=confirm]'); await p.waitForSelector('.res');
  if (await verdict(p) !== 'Sbagliato') errs.push('chips sbagliate segnate giuste');
  if (!await p.$('.zone.wrong .fix')) errs.push('manca la cifra giusta sulla zona sbagliata');
  await p.screenshot({ path: out + '/felt-wrong.png', fullPage: true });
  await p.click('[data-act=exit]'); await p.waitForSelector('.start');
  console.log('chips al tocco ok');

  // a real finger: raw touch events, no mouse
  await p.click('[data-act=start][data-v=side]'); await p.waitForSelector('.felt2');
  await p.evaluate(() => { Object.assign(cur.q.felt, { z: { s1: [1000, 1000, 500], p0: [] }, want: { s1: 0, p0: 2500 } }); cur.q.table.seats = [{ n: 1 }]; render(); });
  const cdp = await ctx.newCDPSession(p);
  const centre = async s => { const r = await (await p.$(s)).boundingBox(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; };
  const finger = async (a, b) => {
    const A = await centre(a), B = await centre(b);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [A] });
    for (let i = 1; i <= 6; i++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: A.x + (B.x - A.x) * i / 6, y: A.y + (B.y - A.y) * i / 6 }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  };
  const y0 = await p.evaluate(() => scrollY);
  await finger('[data-z=s1][data-v="1000"]', '.zone[data-z=p0]'); await p.waitForTimeout(50);
  if (await inZ('p0') !== '1000,1000' || await inZ('s1') !== '500') errs.push('dito: pila non spostata ' + await inZ('p0'));
  if (await p.evaluate(() => scrollY) !== y0) errs.push('dito: la pagina scorre mentre trascini');
  await finger('.zone[data-z=s1] .zh', '.zone[data-z=p0]'); await p.waitForTimeout(50);
  if (await inZ('p0') !== '500,1000,1000') errs.push('dito: zona non spostata ' + await inZ('p0'));
  if (await p.$('.ghost')) errs.push('dito: fantasma rimasto');
  await p.click('[data-act=confirm]'); await p.waitForSelector('.res');
  if (await verdict(p) !== 'Giusto') errs.push('dito: esito');
  await p.click('[data-act=exit]'); await p.waitForSelector('.start');
  console.log('trascinamento col dito ok');

  // chips in hand when the clock stops must not vanish from the table
  await p.click('[data-act=start][data-v=side]'); await p.waitForSelector('.felt2');
  await p.evaluate(() => { Object.assign(cur.q.felt, { z: { s1: [1000], p0: [] }, want: { s1: 0, p0: 1000 } }); cur.q.table.seats = [{ n: 1 }]; render(); });
  await p.click('[data-z=s1][data-v="1000"]');
  await p.evaluate(() => { cur.a.z = zones(); timeout(); });
  if (!await p.$('.zone[data-z=s1] .fp')) errs.push('fiche in mano sparita allo scadere');
  await p.click('[data-act=exit]'); await p.waitForSelector('.start');

  // odd chip: the button stays visible even on a seat that is not splitting
  await p.click('[data-act=start][data-v=odd]'); await p.waitForSelector('.felt2');
  if (!await p.$('.felt2 .dbtn')) errs.push('fiche dispari: bottone non visibile');
  if (await p.evaluate(() => document.querySelectorAll('.felt2 .zone:not(.potz)').length) !== 9) errs.push('fiche dispari: mancano dei posti');
  await p.click('[data-act=exit]'); await p.waitForSelector('.start');

  // errors saved before 2.2: still numbers, still answerable
  await p.evaluate(() => { store.srs = [{ id: 'old', type: 'side', box: 0, due: 0, q: { title: 'Dividi i piatti', head: '', lines: ['Posto 1: all-in per 500'], shown: [], table: { seats: [{ n: 1, bet: 500, tag: 'ALL-IN' }] }, fields: [{ label: 'Piatto principale', answer: 500 }], steps: ['Somma.'], tip: 'x', rules: ['R23'] } }]; save(); });
  await p.reload(); await p.waitForSelector('.start');
  await p.click('[data-act=start][data-v=review]'); await p.waitForSelector('#f0');
  if (await p.$('.felt2')) errs.push('errore vecchio finito sul tavolo nuovo');
  await p.click('#f0'); for (const c of '500') await p.click(`[data-act=key][data-v="${c}"]`);
  await p.click('[data-act=confirm]'); await p.waitForSelector('.res');
  if (await verdict(p) !== 'Giusto') errs.push('errore vecchio: esito');
  await p.click('[data-act=next]'); await p.waitForSelector('text=Sessione finita'); await p.click('[data-act=gohome]'); await p.waitForSelector('.start');
  console.log('errori vecchi ok');

  // resume after closing
  await p.click('[data-act=start][data-v=mix5]'); await p.waitForSelector('[data-act=confirm]');
  await answer(p, true, true); await p.click('[data-act=confirm]'); await p.click('[data-act=next]');
  await p.waitForSelector('[data-act=confirm]');
  await p.reload(); await p.waitForTimeout(300);
  await p.goto(base + '#/'); await p.waitForSelector('[data-act=resume]');
  await p.click('[data-act=resume]'); await p.waitForSelector('[data-act=confirm]');
  for (let i = 0; i < 4; i++) { await answer(p, i !== 1, true); await p.click('[data-act=confirm]'); await p.click('[data-act=next]'); await p.waitForTimeout(30); }
  await p.waitForSelector('text=Sessione finita'); await p.screenshot({ path: out + '/summary.png', fullPage: true });
  if (await p.$('[data-act=seelog]')) { await p.click('[data-act=seelog]'); await p.waitForSelector('.res'); await p.click('[data-act=backsum]'); await p.waitForSelector('text=Sessione finita'); }
  await p.click('[data-act=gohome]'); await p.waitForSelector('.start');
  if (await p.$('[data-act=resume]')) errs.push('sessione finita ma ancora da riprendere');
  console.log('ripresa della sessione ok');

  // exam: no explanations until the end
  await p.click('[data-act=start][data-v=exam]');
  for (let i = 0; i < 20; i++) { await p.waitForSelector('[data-act=confirm]'); await answer(p, i % 4 !== 0, true); await p.click('[data-act=confirm]'); if (i < 19 && await p.$('.res')) errs.push('spiegazione durante la prova'); }
  await p.waitForSelector('text=Sessione finita');
  if (!/Non ancora: la soglia è 85%/.test(await p.textContent('#app'))) errs.push('esito della prova (soglia) non mostrato');
  if (!await p.evaluate(() => store.runs.some(r => r.k === 'exam' && r.n === 20))) errs.push('prova non registrata nello storico');
  await p.click('[data-act=gohome]'); await p.waitForSelector('.start');
  console.log('prova senza aiuti ok');

  // timed session: countdown, a timeout counts as missed and still shows the answer
  await p.click('[data-act=start][data-v=timed10]'); await p.waitForSelector('[data-act=confirm]');
  const clock0 = await p.textContent('#clock'); if (!/^\d+s$/.test(clock0)) errs.push('conto alla rovescia: ' + clock0);
  await p.evaluate(() => { cur.t0 -= 200000; }); await p.waitForSelector('.res', { timeout: 3000 });
  if (await verdict(p) !== 'Sbagliato') errs.push('tempo scaduto non segnato sbagliato');
  if (!/Tempo scaduto/.test(await p.textContent('.res'))) errs.push('manca "Tempo scaduto" nella spiegazione');
  await p.click('[data-act=next]');
  for (let i = 1; i < 10; i++) { await p.waitForSelector('[data-act=confirm]'); await answer(p, true, true); await p.click('[data-act=confirm]'); await p.click('[data-act=next]'); }
  await p.waitForSelector('text=Sessione finita');
  if (!/1 domanda scaduta/.test(await p.textContent('#app'))) errs.push('riepilogo a tempo senza le scadute');
  if (await p.evaluate(() => store.runs.filter(r => r.k === 'timed').length) !== 1) errs.push('sessione a tempo non registrata');
  await p.click('[data-act=gohome]'); await p.waitForSelector('.start');
  console.log('sessione a tempo ok');

  // spaced review
  await p.evaluate(() => { store.srs.forEach(x => { x.due = 0; }); save(); }); await p.reload(); await p.waitForSelector('.start');
  const due = await p.evaluate(() => Math.min(20, dueItems().length));
  await p.click('[data-act=start][data-v=review]');
  for (let i = 0; i < due; i++) { await p.waitForSelector('[data-act=confirm]'); await answer(p, true, true); await p.click('[data-act=confirm]'); await p.click('[data-act=next]'); }
  await p.waitForSelector('text=Sessione finita'); await p.click('[data-act=gohome]'); await p.waitForSelector('.start');
  const boxes = await p.evaluate(() => store.srs.filter(x => x.box >= 1).length); if (boxes < 1) errs.push('il ripasso non fa avanzare gli errori');
  console.log('ripasso ok, errori ripassati:', due);

  // TDA
  await p.click('[data-tab=tda]'); await p.waitForSelector('#tdasearch'); await p.screenshot({ path: out + '/tda.png' });
  const counts = {};
  for (const t of ['rules', 'procedures', 'illustrations', 'glossary', 'news', 'ess']) { await p.click(`[data-act=tdatab][data-v=${t}]`); await p.waitForSelector('#tdalist'); counts[t] = await p.evaluate(() => document.querySelectorAll('#tdalist .row').length); await overflow(p, 'tda ' + t); }
  console.log('righe TDA', counts);
  if (counts.rules !== 74 || counts.procedures !== 29 || counts.illustrations !== 15 || counts.glossary !== 49) errs.push('sezioni TDA incomplete');
  await p.fill('#tdasearch', 'gettone dispari'); await p.waitForSelector('#tdalist .row'); await p.screenshot({ path: out + '/tda-search.png' });
  const first = await p.textContent('#tdalist .row .n'); if (first.trim() !== '21') errs.push('la ricerca "gettone dispari" non trova per prima la 21: ' + first);
  await p.click('#tdalist .row'); await p.waitForSelector('.rule'); await p.screenshot({ path: out + '/rule21.png', fullPage: true });
  if (!await p.$('.body mark')) errs.push('novità non evidenziate nella 21');
  if (!/pokertda\.com/.test(await p.textContent('.credit'))) errs.push('credito mancante');
  const live = await p.getAttribute('.credit a', 'href'); if (!/^http:\/\/www\.pokertda\.com/.test(live)) errs.push('link credito non attivo');
  await p.click('[data-act=lang]'); await p.waitForSelector('text=first seat left of the button'); await p.click('[data-act=lang]');
  await p.click('[data-act=mark]'); await p.waitForSelector('text=★ Preferita');
  await p.goto(base + '#/r/R45'); await p.waitForSelector('details.ex'); await overflow(p, 'regola 45'); await p.screenshot({ path: out + '/rule45.png', fullPage: true });
  await p.goto(base + '#/r/RP12'); await p.waitForSelector('.body a');
  const hrefs = await p.evaluate(() => [...document.querySelectorAll('.body a')].map(x => x.getAttribute('href'))); if (!hrefs.includes('#/r/R51')) errs.push('RP-12 deve puntare alla regola 51: ' + hrefs);
  await p.goto(base + '#/r/R21'); await p.waitForSelector('[data-act=rulequiz]'); await p.click('[data-act=rulequiz]'); await p.waitForSelector('.opts');
  await answer(p, true, true); await p.click('[data-act=confirm]'); await p.waitForSelector('.chip');
  await p.click('.chip'); await p.waitForSelector('.sheetbox'); await p.screenshot({ path: out + '/sheet.png' });
  await p.goBack(); await p.waitForFunction(() => document.getElementById('sheet').hidden);
  if (!await p.$('.res')) errs.push('chiudendo la regola si è persa la domanda');
  await p.click('[data-act=exit]'); await p.waitForSelector('.start');
  console.log('TDA ok');

  // settings and backup
  await p.click('[data-tab=stats]'); await p.waitForSelector('.days'); await p.screenshot({ path: out + '/stats.png', fullPage: true }); await overflow(p, 'progressi');
  for (const t of ['per settimana', 'per argomento', 'Prova senza aiuti', 'Sessioni a tempo']) if (!await p.$(`h2:has-text("${t}")`)) errs.push('statistiche: manca la sezione "' + t + '"');
  // backup reminder: shown when 30+ answers and no recent export
  await p.evaluate(() => { store.lastExport = 0; save(); });
  await p.click('[data-tab=home]'); await p.waitForSelector('.start');
  if (!await p.$('.tile.alert[data-act=export]')) errs.push('promemoria backup assente');
  await p.click('[data-tab=settings]'); await p.waitForSelector('[data-act=export]'); await p.screenshot({ path: out + '/settings.png', fullPage: true });
  await p.click('[data-act=size][data-v=xl]'); await overflow(p, 'testo grande');
  if (await p.evaluate(() => document.documentElement.style.fontSize) !== '20px') errs.push('dimensione del testo non applicata');
  await p.screenshot({ path: out + '/settings-xl.png', fullPage: true });
  await p.click('[data-act=size][data-v=m]');
  const [dl] = await Promise.all([p.waitForEvent('download'), p.click('[data-act=export]')]);
  const file = path.join(out, 'backup.json'); await dl.saveAs(file);
  if (!await p.evaluate(() => store.lastExport > 0)) errs.push('data del backup non registrata');
  const n = await p.evaluate(() => Object.values(store.stats).reduce((a, s) => a + s.n, 0));
  await p.evaluate(() => { store = blankStore(); save(); });
  await p.setInputFiles('#importfile', file); await p.waitForFunction(x => Object.values(store.stats).reduce((a, s) => a + s.n, 0) === x, n);
  console.log('backup ok, domande salvate:', n);

  // offline: service worker must serve the whole app
  await p.reload(); await p.waitForFunction(() => navigator.serviceWorker.ready.then(() => !!navigator.serviceWorker.controller), null, { timeout: 8000 }).catch(() => errs.push('service worker non attivo'));
  await ctx.setOffline(true);
  await p.reload(); await p.waitForSelector('[data-act=export]');
  await p.click('[data-tab=tda]'); await p.waitForSelector('#tdasearch');
  await p.click('[data-tab=home]'); await p.waitForSelector('.start');
  await p.click('[data-act=start][data-v=quiz]'); await p.waitForSelector('.opts');
  await ctx.setOffline(false);
  console.log('offline ok');
  await ctx.close();

  // old data migrates
  const c3 = await b.newContext({ viewport: { width: 390, height: 844 } }); const p3 = await c3.newPage();
  await p3.addInitScript(() => { if (!localStorage.getItem('x')) { localStorage.setItem('x', '1'); localStorage.setItem('trainer-dealer-v1', JSON.stringify({ stats: { win: { n: 7, ok: 5, ms: 9000 } }, days: { '2026-11-05': { n: 7, ok: 5 } }, errors: [{ id: 'a', type: 'win', q: { board: ['As', 'Kd', '7c', '2h', '9s'], holes: [['Qs', 'Qd'], ['3c', '3d']] } }, { id: 'b', type: 'pot', q: {} }], level: 'hard' })); } });
  await p3.goto(base); await p3.waitForSelector('.start');
  const mig = await p3.evaluate(() => [store.stats.win.n, store.srs.length, store.level]);
  if (mig.join() !== '7,1,hard') errs.push('migrazione: ' + mig);
  await c3.close();
  console.log('migrazione dati vecchi ok');

  // desktop
  const c2 = await b.newContext({ viewport: { width: 1200, height: 860 } }); const d = await c2.newPage();
  d.on('pageerror', e => errs.push('JS desktop: ' + e.message));
  await drill(d, 'd', false, false);
  // drag: a whole pile, a whole zone, dropped nowhere goes back
  await d.goto(base + '#/'); await d.waitForSelector('.start');
  await d.click('[data-act=start][data-v=side]'); await d.waitForSelector('.felt2');
  await d.evaluate(() => { Object.assign(cur.q.felt, { z: { s1: [1000, 1000, 500], s2: [500], p0: [] }, want: { s1: 0, s2: 0, p0: 3000 } }); cur.q.table.seats = [{ n: 1 }, { n: 2 }]; render(); });
  const mid = async s => { const r = await (await d.$(s)).boundingBox(); return [r.x + r.width / 2, r.y + r.height / 2]; };
  const dragTo = async (a, b) => { const [x, y] = await mid(a), [X, Y] = await mid(b); await d.mouse.move(x, y); await d.mouse.down(); await d.mouse.move(x + 20, y + 20, { steps: 3 }); await d.mouse.move(X, Y, { steps: 5 }); await d.mouse.up(); };
  const zs = () => d.evaluate(() => JSON.stringify(zones()));
  await dragTo('[data-z=s1][data-v="1000"]', '.zone[data-z=p0]');
  if (await zs() !== JSON.stringify({ s1: [500], s2: [500], p0: [1000, 1000] })) errs.push('trascina la pila: ' + await zs());
  await dragTo('.zone[data-z=s2] .zh', '.zone[data-z=p0]');
  if (await zs() !== JSON.stringify({ s1: [500], s2: [], p0: [1000, 1000, 500] })) errs.push('trascina tutta la zona: ' + await zs());
  await dragTo('[data-z=s1][data-v="500"]', '.q');
  if (await zs() !== JSON.stringify({ s1: [500], s2: [], p0: [1000, 1000, 500] }) || await d.evaluate(() => cur.hand)) errs.push('posata fuori deve tornare indietro');
  if (await d.$('.ghost')) errs.push('fantasma rimasto');
  await dragTo('[data-z=s1][data-v="500"]', '.zone[data-z=p0]');
  await d.click('[data-act=confirm]'); await d.waitForSelector('.res');
  if (await verdict(d) !== 'Giusto') errs.push('trascinando tutto giusto non è Giusto');
  await d.click('[data-act=exit]'); await d.waitForSelector('.start');
  console.log('trascinamento ok');

  // smallest phone with the biggest text: nothing may stick out of the screen
  const c4 = await b.newContext({ viewport: { width: 320, height: 640 }, hasTouch: true, isMobile: true }); const s = await c4.newPage();
  await s.goto(base); await s.waitForSelector('.start');
  await s.evaluate(() => { store.size = 'xl'; save(); applySize(); store.level = 'hard'; });
  for (const t of ['side', 'pay', 'pot', 'odd']) {
    await s.click(`[data-act=start][data-v=${t}]`); await s.waitForSelector('.felt2'); await overflow(s, 'schermo piccolo ' + t);
    const out2 = await s.evaluate(() => [...document.querySelectorAll('.zone,.fp,.zh')].filter(e => { const r = e.getBoundingClientRect(), f = document.querySelector('.felt2').getBoundingClientRect(); return r.right > f.right + 1 || r.left < f.left - 1; }).length);
    if (out2) errs.push(`schermo piccolo ${t}: ${out2} elementi fuori dal tavolo`);
    await s.screenshot({ path: `${out}/small-${t}.png`, fullPage: true });
    await s.click('[data-act=exit]'); await s.waitForSelector('.start');
  }
  await c4.close();
  console.log('schermo piccolo ok');
  await d.goto(base + '#/'); await d.waitForSelector('.start'); await d.screenshot({ path: out + '/home-d.png', fullPage: true });
  await d.click('[data-act=start][data-v=raise]'); await d.waitForSelector('#f0');
  const a = await d.evaluate(() => cur.q.fields[0].answer);
  await d.fill('#f0', '"><img src=x onerror=alert()>'); await d.keyboard.press('Enter');
  if (await d.$('.res')) errs.push('testo non numerico accettato');
  if (await d.$('img')) errs.push('html iniettato');
  await d.fill('#f0', String(a)); await d.keyboard.press('Enter');
  if (await verdict(d) !== 'Giusto') errs.push('Invio da tastiera');
  await d.keyboard.press('Enter'); await d.waitForSelector('[data-act=confirm]');
  await d.click('[data-act=exit]'); await d.waitForSelector('.start');
  await d.click('[data-act=start][data-v=quiz]'); await d.waitForSelector('.opts');
  await d.keyboard.press('2'); if (!await d.$('.opts .btn.on')) errs.push('tasto numerico nel quiz');
  await c2.close();
  console.log('desktop ok');
  await b.close(); server.close();
  console.log(errs.length ? 'PROBLEMI (' + errs.length + '):\n' + [...new Set(errs)].slice(0, 25).join('\n') : 'nessun problema');
  process.exit(errs.length ? 1 : 0);
})().catch(e => { console.error(e); console.log(errs.join('\n')); process.exit(1); });
