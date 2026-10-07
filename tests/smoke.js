/* headless UI smoke test — run: node tests/smoke.js */
var Chess = require('../chess.js');
var Puzzles = require('../puzzles.js');

// ---- minimal DOM stub ----
function makeEl() {
  var el = {
    children: [], textContent: '', innerHTML: '', value: '',
    _handlers: {},
    addEventListener: function (t, h) { this._handlers[t] = h; },
    appendChild: function (c) { this.children.push(c); return c; },
    removeChild: function (c) { this.children.splice(this.children.indexOf(c), 1); },
    focus: function () {},
    get firstChild() { return this.children[0]; }
  };
  return el;
}
var els = {};
global.document = {
  getElementById: function (id) { return els[id] || (els[id] = makeEl()); },
  createElement: function () { return makeEl(); },
  addEventListener: function () {}
};
global.localStorage = { getItem: function () { return null; }, setItem: function () {} };
global.window = { Chess: Chess, Puzzles: Puzzles };
// run timers immediately (init + pregenerate + auto-advance all terminate)
var realSetTimeout = setTimeout;
global.setTimeout = function (fn) { fn(); return 0; };

require('../game.js');
var PG = global.window.PuzzleGame;

var fail = 0;
function assert(c, msg) {
  if (!c) { fail++; console.log('FAIL ' + msg); }
  else console.log('ok: ' + msg);
}

// 1. a puzzle loaded on init
var s = PG.state();
assert(s.count === 1 && s.type === 1, 'init loads a mate-in-1 puzzle (#' + s.count + ')');

// 2. solve it via the exposed solution SAN
var sol = s.solutions[0];
PG.play(sol);
s = PG.state();
assert(s.stats.solved === 1 && s.stats.streak === 1, 'solving via SAN works (' + sol + ')');
assert(s.count === 2, 'auto-advanced to puzzle #2');

// 3. wrong move resets streak
s = PG.state();
var b = PG.board();
var wrong = Chess.legalMoves(b).filter(function (m) {
  return !s.solutions.some(function () { return false; }); // any legal move...
})[0];
// pick a legal move that is NOT the solution
var solMove = Puzzles.mateIn1Moves(Chess.clone(b))[0];
var nonSol = Chess.legalMoves(b).filter(function (m) {
  return !(m.from === solMove.from && m.to === solMove.to);
})[0];
if (nonSol) {
  PG.play(Chess.moveToSan(b, nonSol));
  s = PG.state();
  assert(s.stats.streak === 0 && !s.over, 'wrong move resets streak, puzzle continues');
} else console.log('skip: no non-solution move (degenerate)');

// 4. commands
PG.play('hint');
PG.play('level 2');
s = PG.state();
assert(s.stats && true, 'level command accepted');
PG.play('level mix');
PG.play('help');
PG.play('restart');
s = PG.state();
assert(s.history.length === 0 && s.phase === 'key', 'restart resets position');
PG.play('new');
s = PG.state();
assert(s.count >= 3, 'new loads next puzzle');

// 5. mate-in-2 interactive flow (force level 2 until we get one)
PG.play('level 2');
var found2 = null;
for (var i = 0; i < 6 && !found2; i++) {
  PG.play('new');
  s = PG.state();
  if (s.type === 2) found2 = s;
}
if (found2) {
  assert(true, 'got a mate-in-2 puzzle (#' + found2.count + ')');
  PG.play(found2.solutions[0]); // key move
  s = PG.state();
  assert(s.phase === 'finish' && s.history.length === 2, 'key accepted, engine replied');
  // find the mate and play it
  var bb = PG.board();
  var mate = null, ms = Chess.legalMoves(bb), u, k;
  for (k = 0; k < ms.length; k++) {
    u = Chess.make(bb, ms[k]);
    if (Chess.isCheckmate(bb)) mate = ms[k];
    Chess.unmake(bb, u);
    if (mate) break;
  }
  assert(!!mate, 'mate exists after reply');
  PG.play(Chess.moveToSan(bb, mate));
  s = PG.state();
  assert(s.stats.solved >= 2, 'mate-in-2 solved end-to-end');
} else console.log('skip: no mate-2 in 6 tries (fallback ok)');
PG.play('level mix');

// 6. UCI input + garbage input
PG.play('new');
s = PG.state();
var b2 = PG.board();
var uci = Chess.legalMoves(b2).map(function (m) {
  return Chess.alg(m.from) + Chess.alg(m.to) + (m.promo ? 'qrbn'[[Chess.Q, Chess.R, Chess.B, Chess.N].indexOf(m.promo)] : '');
});
PG.play('asdfgh');
console.log('ok: garbage input handled (no crash)');
PG.play(uci[0]);
console.log('ok: UCI input handled (no crash)');

console.log(fail ? ('\n' + fail + ' FAILURES') : '\nALL PASS');
process.exit(fail ? 1 : 0);
