// Run after tools/build-tda.js: node tools/patch-glossary.js
// The Italian and English glossaries do not hold the same entries, so pairing them by position
// showed the English of another term. Pairs are by term, and what has no English stays without it.
const fs = require('fs'), path = require('path');
const file = path.join(__dirname, '..', 'data', 'tda.json'), t = JSON.parse(fs.readFileSync(file, 'utf8'));
const pairs = { 1: 'Dealer’s choice', 4: 'Mixed games', 5: 'NL', 6: 'NLH or NLTH', 7: 'O8', 8: 'PL', 9: 'PLO', 10: 'PLO/8', 13: 'BB', 14: 'BTN', 15: 'CO', 16: 'HJ', 17: 'MP', 18: 'SB', 19: 'UTG', 20: 'BBA', 21: 'Bring-in', 22: 'On the bubble', 23: 'C-bet', 24: 'H4H', 26: 'Action OOT', 28: 'SA', 30: 'XR', 37: 'ITM', 39: 'MLR', 47: 'ROI', 48: 'TD', 49: 'TDA' };
const gloss = Object.values(t.items).filter(x => x.s === 'glossary');
const en = {}; gloss.forEach(x => { if (x.enTitle) en[x.enTitle] = { enTitle: x.enTitle, enText: x.enText, enRed: x.enRed }; });
gloss.forEach(x => {
  const term = pairs[+x.id.slice(1)];
  if (term && !en[term]) throw new Error('voce inglese assente: ' + term);
  Object.assign(x, term ? en[term] : { enTitle: null, enText: null, enRed: [] });
});
// Slips of the source: the leading 2 was lost, and GTO stands for Optimal.
t.items.G6.title = 'NLH';
t.items.G11.title = '2-7 SD';
t.items.G12.title = '2-7 TD';
t.items.G35.text = t.items.G35.text.replace('Optional', 'Optimal');
fs.writeFileSync(file, JSON.stringify(t));
console.log('glossario riallineato:', gloss.filter(x => x.enText).length, 'voci con inglese su', gloss.length);
