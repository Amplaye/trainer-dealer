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
    const { type, q } = cur, k = DT.TYPES[type].k;
    if (k === 'win') return { k, seats: DT.winners(q.board, q.holes).win };
    if (k === 'name') { const b = DT.best(q.board.concat(q.hole)); return { k, cat: b.score[0], five: b.five }; }
    if (k === 'board') { const i = DT.boardInfo(q.board); return { k, i: { paired: i.paired, flush: i.flush, straight: i.straight }, cat: i.nut[0] }; }
    if (k === 'num') return { k, vals: q.fields.map(f => f.answer) };
    if (k === 'choice') return { k, opt: q.options.findIndex(o => o.ok), wrong: q.options.findIndex(o => !o.ok) };
    if (k === 'seat') return { k, seat: q.answer, seats: q.table.seats.filter(s => s.tag !== 'FOLD').map(s => s.n) };
    return { k, a: q.answer, seats: q.table.seats.map(s => s.n) };
  });
  const { k } = plan;
  if (k === 'win') { const s = right ? plan.seats : (plan.seats.includes(0) && plan.seats.length === 1 ? [1] : [0]); for (const i of s) await p.click(`[data-act=seat][data-v="${i}"]`); }
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
