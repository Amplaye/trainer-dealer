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

## Modalità

- sessioni da 5, 10 o 20 domande, con ripasso degli errori a intervalli
- **A tempo**: 10 domande con il conto alla rovescia (obiettivi in `TARGET`, `js/logic.js`). Allo scadere la domanda conta come sbagliata e mostra la risposta
- **Prova senza aiuti**: 20 domande, si passa con l'85% (`PASS` in `js/app.js`), con storico delle ultime prove
- il testo inglese delle regole è la 2026 Version 1.1 (21 set 2026), ricontrollato sulla copia archiviata di pokertda.com con `tools/patch-tda-1-1.js`. Procedure, addendum, glossario e traduzione italiana restano alla 1.0 (la 1.1 corregge soprattutto rimandi interni)

## Test

```
node tests/logic.test.js
node tests/ui.test.js
```
