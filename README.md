# Trainer Dealer

Web app per allenarsi come dealer di Texas Hold'em: lettura dei punti, calcoli da torneo, azione al tavolo e regolamento TDA 2026 completo. Si installa sul telefono e funziona offline.

App non ufficiale, non affiliata al Poker TDA.

TDA rules used by permission of the Poker TDA, Copyright 2026, [http://www.pokertda.com](http://www.pokertda.com), All rights reserved. Traduzione italiana a cura di Fabiano Stefanini, revisione a cura di Jacopo Marcelletti.

## Struttura

- `js/logic.js`: punti, generatori degli esercizi e spiegazioni, senza DOM
- `js/quiz.js`: domande sul regolamento
- `js/app.js`: interfaccia
- `data/tda.json`: regolamento, generato da `tools/build-tda.js`
- `sw.js`: offline. Ad ogni rilascio va aumentata `VERSION`, altrimenti i telefoni non vedono l'aggiornamento

## Test

```
node tests/logic.test.js
node tests/ui.test.js
```
