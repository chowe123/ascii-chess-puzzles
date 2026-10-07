/* game.js — terminal-style UI for infinite ascii chess puzzles. */
(function () {
'use strict';
var Chess = window.Chess, Puzzles = window.Puzzles;
var C = Chess; // shorthand

var $ = function (id) { return document.getElementById(id); };
var boardEl = $('board'), statusEl = $('status'), statsEl = $('stats'),
    histEl = $('history'), logEl = $('log'), cmdEl = $('cmd');

var LS_KEY = 'ascii-chess-puzzles-v1';
var G = {
  gen: Puzzles.create((Date.now() ^ (Math.random() * 0x7fffffff)) >>> 0),
  puzzle: null, board: null, whiteBottom: true,
  history: [], undos: [], lastMove: null,
  phase: 'key', over: false, count: 0,
  sel: -1, cursor: { f: 4, r: 1 },
  level: 'mix', stats: { solved: 0, streak: 0, best: 0 },
  nextPuzzle: null, pregenBusy: false
};

try {
  var saved = JSON.parse(localStorage.getItem(LS_KEY) || '{}');
  if (saved.stats) G.stats = saved.stats;
  if (saved.level) G.level = saved.level;
} catch (e) {}
function save() {
  try { localStorage.setItem(LS_KEY, JSON.stringify({ stats: G.stats, level: G.level })); } catch (e) {}
}

// ---- output ---------------------------------------------------------------
function say(msg) {
  var d = document.createElement('div');
  d.textContent = msg;
  logEl.appendChild(d);
  while (logEl.children.length > 4) logEl.removeChild(logEl.firstChild);
}

function renderStats() {
  statsEl.textContent = 'solved ' + G.stats.solved + ' · streak ' + G.stats.streak +
                        ' · best ' + G.stats.best + ' · ' + G.level;
}

function pieceChar(p) {
  if (p === C.EMPTY) return '.';
  var ch = { 1: 'P', 2: 'N', 3: 'B', 4: 'R', 5: 'Q', 6: 'K' }[C.pieceType(p)];
  return C.pieceColor(p) === C.BLACK ? ch.toLowerCase() : ch;
}

function render() {
  renderStats();
  if (!G.board) {
    boardEl.innerHTML = '';
    statusEl.textContent = 'searching…';
    histEl.textContent = '';
    return;
  }
  var html = '';
  var ranks = G.whiteBottom ? [7, 6, 5, 4, 3, 2, 1, 0] : [0, 1, 2, 3, 4, 5, 6, 7];
  var files = G.whiteBottom ? [0, 1, 2, 3, 4, 5, 6, 7] : [7, 6, 5, 4, 3, 2, 1, 0];
  ranks.forEach(function (r) {
    html += '<span class="coord">' + (r + 1) + '</span>';
    files.forEach(function (f) {
      var s = C.sq(f, r);
      var cls = 'sq';
      if (G.lastMove && (s === G.lastMove.from || s === G.lastMove.to)) cls += ' lm';
      if (s === G.sel) cls += ' sel';
      if (f === G.cursor.f && r === G.cursor.r) cls += ' cur';
      html += '<span class="' + cls + '" data-f="' + f + '" data-r="' + r + '">' +
              pieceChar(G.board.b[s]) + '</span>';
    });
    html += '\n';
  });
  html += '<span class="coord"> </span>';
  files.forEach(function (f) { html += '<span class="flab">' + 'abcdefgh'[f] + '</span>'; });
  boardEl.innerHTML = html;

  var side = G.board.turn === C.WHITE ? 'white' : 'black';
  var what = G.puzzle.type === 1 ? 'mate in 1' :
             (G.phase === 'key' ? 'mate in 2' : 'mate in 1');
  statusEl.textContent = 'puzzle #' + G.count + ' — ' + side + ' to move — ' + what;
  histEl.textContent = G.history.length ? 'line: ' + G.history.join(' ') : '';
}

// ---- puzzle flow ----------------------------------------------------------
function loadPuzzle(p) {
  G.puzzle = p;
  G.board = C.clone(p.state);
  G.whiteBottom = p.state.turn === C.WHITE;
  G.history = []; G.undos = []; G.lastMove = null;
  G.phase = 'key'; G.over = false;
  G.sel = -1;
  G.cursor = { f: 4, r: G.whiteBottom ? 1 : 6 };
  G.count++;
  render();
  say('puzzle #' + G.count + ' loaded.');
}

function pregenerate() {
  if (G.pregenBusy || G.nextPuzzle) return;
  G.pregenBusy = true;
  setTimeout(function () {
    try { G.nextPuzzle = G.gen.next(G.level, G.stats.solved); } catch (e) {}
    G.pregenBusy = false;
  }, 60);
}

function newPuzzle() {
  G.over = true;
  if (G.nextPuzzle) {
    var p = G.nextPuzzle; G.nextPuzzle = null;
    loadPuzzle(p);
    pregenerate();
    return;
  }
  say('searching…');
  render();
  setTimeout(function () {
    var p = null;
    try { p = G.gen.next(G.level, G.stats.solved); } catch (e) {}
    if (!p) { say('nothing found — type: new'); G.over = false; return; }
    loadPuzzle(p);
    pregenerate();
  }, 30);
}

function solved() {
  G.over = true;
  G.stats.solved++;
  G.stats.streak++;
  if (G.stats.streak > G.stats.best) G.stats.best = G.stats.streak;
  save();
  say('ok. solved #' + G.count + ' — streak ' + G.stats.streak);
  render();
  setTimeout(newPuzzle, 1500);
}

function wrong() {
  G.stats.streak = 0;
  save();
  say('no. (streak reset)');
  render();
}

function sameMove(a, b) {
  return a.from === b.from && a.to === b.to && a.promo === b.promo;
}

function playUserMove(m) {
  var san = C.moveToSan(G.board, m);
  var undo = C.make(G.board, m);
  G.undos.push(undo);
  G.history.push(san);
  G.lastMove = { from: m.from, to: m.to };

  if (G.puzzle.type === 1) {
    if (C.isCheckmate(G.board)) { solved(); return; }
    rollback();
    wrong();
    return;
  }
  // mate in 2
  if (G.phase === 'key') {
    if (sameMove(m, G.puzzle.solutions[0])) {
      var replies = C.legalMoves(G.board);
      var reply = replies[(Math.random() * replies.length) | 0];
      var rsan = C.moveToSan(G.board, reply);
      C.make(G.board, reply);
      G.undos.push(null); // engine move: not user-undoable past this point
      G.history.push(rsan);
      G.lastMove = { from: reply.from, to: reply.to };
      G.phase = 'finish';
      say('ok — ' + rsan + '. mate in 1.');
      render();
    } else {
      rollback();
      wrong();
    }
    return;
  }
  // finish phase
  if (C.isCheckmate(G.board)) { solved(); return; }
  rollback();
  wrong();
}

function rollback() {
  var u = G.undos.pop();
  if (u) C.unmake(G.board, u);
  G.history.pop();
  G.lastMove = null;
  render();
}

function findMateMove() {
  var moves = C.legalMoves(G.board), i, u;
  for (i = 0; i < moves.length; i++) {
    u = C.make(G.board, moves[i]);
    var mate = C.legalMoves(G.board).length === 0 && C.inCheck(G.board, G.board.turn);
    C.unmake(G.board, u);
    if (mate) return moves[i];
  }
  return null;
}

// ---- move entry -----------------------------------------------------------
function attemptMove(from, to, promoName) {
  if (G.over || !G.board) return;
  var moves = C.legalMoves(G.board);
  var cand = moves.filter(function (m) { return m.from === from && m.to === to; });
  if (!cand.length) { say('illegal.'); return; }
  var m;
  if (promoName) {
    var promo = { q: C.Q, r: C.R, b: C.B, n: C.N }[promoName];
    m = cand.filter(function (x) { return x.promo === promo; })[0];
    if (!m) { say('illegal.'); return; }
  } else if (cand.length > 1 && cand[0].promo) {
    m = cand.filter(function (x) { return x.promo === C.Q; })[0]; // auto-queen
    say('(auto-queen — type e.g. e7e8r to underpromote)');
  } else {
    m = cand[0];
  }
  playUserMove(m);
}

function parseAndPlay(text) {
  var m = C.parseUci(G.board, text) || C.parseSan(G.board, text);
  if (!m) { say('no parse. try: Nf3 / e2e4 / help'); return; }
  playUserMove(m);
}

// ---- commands --------------------------------------------------------------
function doHint() {
  if (G.over || !G.board) return;
  var mv = G.phase === 'key' && G.puzzle.type === 2 ? G.puzzle.solutions[0] : findMateMove();
  say(mv ? 'from ' + C.alg(mv.from) : 'no hint available.');
}

function doRestart() {
  if (!G.puzzle || G.over) return;
  G.board = C.clone(G.puzzle.state);
  G.history = []; G.undos = []; G.lastMove = null;
  G.phase = 'key'; G.sel = -1;
  say('restarted.');
  render();
}

var HELP =
  'moves: SAN (Nf3, Qxf7#, O-O) or squares (e2e4, e7e8q)\n' +
  'click/tap squares, or arrow keys + enter when the prompt is empty\n' +
  'commands: new · hint · restart · level 1|2|mix · help';

function doCommand(text) {
  var parts = text.trim().split(/\s+/);
  var cmd = parts[0].toLowerCase();
  if (cmd === 'new') { newPuzzle(); return true; }
  if (cmd === 'hint') { doHint(); return true; }
  if (cmd === 'restart') { doRestart(); return true; }
  if (cmd === 'help') { say(HELP); return true; }
  if (cmd === 'level') {
    var lv = (parts[1] || '').toLowerCase();
    if (lv === '1' || lv === '2' || lv === 'mix') {
      G.level = lv === 'mix' ? 'mix' : +lv;
      G.nextPuzzle = null; // level changed — discard pre-generated
      save(); render();
      say('level: ' + G.level);
    } else say('level: 1, 2, or mix');
    return true;
  }
  return false;
}

// ---- events ----------------------------------------------------------------
cmdEl.addEventListener('keydown', function (e) {
  if (e.key === 'Enter') {
    var text = cmdEl.value.trim();
    cmdEl.value = '';
    if (!text) { cursorConfirm(); return; }
    if (!G.board || G.over) { say('wait…'); return; }
    if (!doCommand(text)) parseAndPlay(text);
  } else if (e.key === 'Escape') {
    G.sel = -1; render();
  } else if (/^Arrow/.test(e.key) && cmdEl.value === '') {
    e.preventDefault();
    moveCursor(e.key);
  }
});

function moveCursor(key) {
  var df = key === 'ArrowLeft' ? -1 : key === 'ArrowRight' ? 1 : 0;
  var dr = key === 'ArrowDown' ? -1 : key === 'ArrowUp' ? 1 : 0; // absolute ranks
  if (!G.whiteBottom) { df = -df; dr = -dr; } // keep visual direction natural
  G.cursor.f = Math.min(7, Math.max(0, G.cursor.f + df));
  G.cursor.r = Math.min(7, Math.max(0, G.cursor.r + dr));
  render();
  refocus();
}

function cursorConfirm() {
  if (G.over || !G.board) return;
  var s = C.sq(G.cursor.f, G.cursor.r);
  squareTap(s);
  refocus();
}

function squareTap(s) {
  if (G.over || !G.board) return;
  var p = G.board.b[s];
  if (G.sel === -1) {
    if (p !== C.EMPTY && C.pieceColor(p) === G.board.turn) { G.sel = s; render(); }
    return;
  }
  if (s === G.sel) { G.sel = -1; render(); return; }
  if (p !== C.EMPTY && C.pieceColor(p) === G.board.turn) { G.sel = s; render(); return; }
  var from = G.sel;
  G.sel = -1;
  attemptMove(from, s);
}

boardEl.addEventListener('click', function (e) {
  var t = e.target.closest ? e.target.closest('.sq') : null;
  if (!t) return;
  squareTap(C.sq(+t.getAttribute('data-f'), +t.getAttribute('data-r')));
  refocus();
});

function refocus() { setTimeout(function () { cmdEl.focus(); }, 0); }
document.addEventListener('click', function (e) {
  if (e.target !== cmdEl) refocus();
});

// ---- debug / console handle --------------------------------------------------
window.PuzzleGame = {
  play: function (text) {
    if (G.over && text.trim().toLowerCase() !== 'new') return 'wait';
    if (!doCommand(text)) parseAndPlay(text);
    return 'ok';
  },
  state: function () {
    var st0 = G.puzzle ? C.clone(G.puzzle.state) : null;
    return {
      count: G.count, phase: G.phase, over: G.over,
      type: G.puzzle && G.puzzle.type,
      solutions: G.puzzle ? G.puzzle.solutions.map(function (m) { return C.moveToSan(st0, m); }) : [],
      stats: JSON.parse(JSON.stringify(G.stats)),
      turn: G.board && G.board.turn,
      history: G.history.slice()
    };
  },
  board: function () { return G.board; }
};

// ---- init ------------------------------------------------------------------
say('infinite chess puzzles — plain text edition.');
say(HELP.split('\n')[2]);
renderStats();
newPuzzle();
refocus();
})();
