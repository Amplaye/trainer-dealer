// Draws the app icons with a headless browser: node tools/make-icons.js
const path = require('path'), fs = require('fs');
const { chromium } = require(path.join(process.env.APPDATA, 'npm/node_modules/playwright'));
const spade = 'M50 8C50 8 16 36 16 58c0 13 10 21 21 21 4 0 8-1 11-3-1 6-4 11-9 15h22c-5-4-8-9-9-15 3 2 7 3 11 3 11 0 21-8 21-21C84 36 50 8 50 8z';
const page = (size, pad, round) => `<!doctype html><html><body style="margin:0;background:transparent">
<div style="width:${size}px;height:${size}px;background:radial-gradient(circle at 50% 42%,#1f8a5f,#0d5439 78%);border-radius:${round}px;display:flex;align-items:center;justify-content:center;overflow:hidden">
<svg viewBox="0 0 100 100" style="width:${size * pad * 1.32}px;height:${size * pad * 1.32}px"><circle cx="50" cy="50" r="48" fill="#0a1411"/><circle cx="50" cy="50" r="42" fill="none" stroke="#fff" stroke-width="12" stroke-dasharray="16.5 16.5"/><circle cx="50" cy="50" r="48" fill="none" stroke="#e8c264" stroke-width="2"/><circle cx="50" cy="50" r="33" fill="#0c4f37" stroke="#e8c264" stroke-width="2"/><g transform="translate(25.5 25) scale(.49)"><path d="${spade}" fill="#e8c264"/></g></svg></div></body></html>`;
(async () => {
  const dir = path.join(__dirname, '..', 'icons'); fs.mkdirSync(dir, { recursive: true });
  const b = await chromium.launch();
  for (const [name, size, pad, round] of [['icon-192', 192, .66, 40], ['icon-512', 512, .66, 108], ['maskable-512', 512, .5, 0], ['apple-touch-icon', 180, .62, 0]]) {
    const p = await b.newPage({ viewport: { width: size, height: size } });
    await p.setContent(page(size, pad, round));
    await p.screenshot({ path: path.join(dir, name + '.png'), omitBackground: true });
    await p.close();
  }
  await b.close();
  console.log(fs.readdirSync(dir));
})();
