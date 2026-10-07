/* puzzles.js — infinite puzzle generator.
 * Plays biased-random games from the start position, then scans the positions
 * for unique mate-in-1 / mate-in-2 solutions. Every solution is verified by
 * exhaustive search, so a generated puzzle is always sound.
 * Depends on chess.js (global Chess in browsers).
 */
(function (root, factory) {
  var P = factory(root.Chess || (typeof require !== 'undefined' && require('./chess.js')));
  if (typeof module !== 'undefined' && module.exports) module.exports = P;
  else root.Puzzles = P;
})(typeof self !== 'undefined' ? self : this, function (Chess) {
'use strict';

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    var t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function posKey(st) {
  return st.b.join(',') + '|' + st.turn + '|' + st.castling + '|' + st.ep;
}

// true if the side to move has a move that checkmates immediately
function existsMateIn1(st) {
  var resp = Chess.legalMoves(st), k, u;
  for (k = 0; k < resp.length; k++) {
    u = Chess.make(st, resp[k]);
    var givesCheck = Chess.inCheck(st, st.turn);
    var mate = givesCheck && Chess.legalMoves(st).length === 0;
    Chess.unmake(st, u);
    if (mate) return true;
  }
  return false;
}

// all unique mate-in-1 moves (stops after 2 — we only care about uniqueness)
function mateIn1Moves(st) {
  var moves = Chess.legalMoves(st), mates = [], j, u;
  for (j = 0; j < moves.length; j++) {
    u = Chess.make(st, moves[j]);
    var oppMoves = Chess.legalMoves(st);
    var isMate = oppMoves.length === 0 && Chess.inCheck(st, st.turn);
    Chess.unmake(st, u);
    if (isMate) { mates.push(moves[j]); if (mates.length > 1) break; }
  }
  return mates;
}

// all unique mate-in-2 key moves (stops after 2)
function mateIn2Keys(st) {
  var moves = Chess.legalMoves(st), keys = [], i, u;
  // try checking keys first — cheap ordering win, does not affect correctness
  var scored = moves.map(function (m) {
    var uu = Chess.make(st, m);
    var chk = Chess.inCheck(st, st.turn);
    Chess.unmake(st, uu);
    return { m: m, chk: chk };
  });
  scored.sort(function (a, b) { return (b.chk ? 1 : 0) - (a.chk ? 1 : 0); });
  for (i = 0; i < scored.length; i++) {
    var m = scored[i].m;
    u = Chess.make(st, m);
    var replies = Chess.legalMoves(st);
    if (replies.length === 0) { Chess.unmake(st, u); continue; } // mate in 1 or stalemate
    var ok = true, r, u2;
    for (r = 0; r < replies.length; r++) {
      u2 = Chess.make(st, replies[r]);
      var mated = existsMateIn1(st);
      Chess.unmake(st, u2);
      if (!mated) { ok = false; break; }
    }
    Chess.unmake(st, u);
    if (ok) { keys.push(m); if (keys.length > 1) break; }
  }
  return keys;
}

// random playout with a bias toward captures and checks (more tactics)
function playout(rng, minPlies, maxPlies) {
  var st = Chess.setupStartpos(Chess.newState());
  var positions = [];
  var target = minPlies + ((rng() * (maxPlies - minPlies)) | 0);
  for (var i = 0; i < target; i++) {
    var moves = Chess.legalMoves(st);
    if (moves.length === 0) break;
    var spicy = [], m, u;
    for (var j = 0; j < moves.length; j++) {
      m = moves[j];
      if (m.captured || m.ep) { spicy.push(m); continue; }
      u = Chess.make(st, m);
      var chk = Chess.inCheck(st, st.turn);
      Chess.unmake(st, u);
      if (chk) spicy.push(m);
    }
    var pool = (spicy.length && rng() < 0.65) ? spicy : moves;
    Chess.make(st, pool[(rng() * pool.length) | 0]);
    if (i >= 8) positions.push(Chess.clone(st));
  }
  return positions;
}

function create(seed) {
  var rng = mulberry32(seed >>> 0);
  var used = {}; // posKey -> true (never repeat a puzzle position)

  function scanPositions(kind, budgetMs, maxPositions) {
    var t0 = Date.now();
    while (Date.now() - t0 < budgetMs) {
      var positions = playout(rng, 30, 110);
      var n = Math.min(positions.length, maxPositions);
      for (var i = 0; i < n; i++) {
        // scan newest positions first (more tactical), with a little jitter
        var idx = positions.length - 1 - i;
        var st = positions[idx];
        var key = posKey(st);
        if (used[key]) continue;
        used[key] = true;
        if (Chess.legalMoves(st).length === 0) continue;
        var sols = kind === 1 ? mateIn1Moves(st) : mateIn2Keys(st);
        if (sols.length === 1)
          return { state: st, type: kind, solutions: sols };
        if (Date.now() - t0 >= budgetMs) break;
      }
    }
    return null;
  }

  return {
    // seed is advanced on every call so the stream never repeats
    nextMate1: function () { return scanPositions(1, 1500, 60); },
    nextMate2: function () { return scanPositions(2, 6000, 14); },
    // level: 'mix' | 1 | 2  — mix leans easy early, harder later
    next: function (level, solvedCount) {
      var p = null;
      if (level === 1) p = this.nextMate1();
      else if (level === 2) p = this.nextMate2() || this.nextMate1();
      else {
        var want2 = solvedCount >= 3 && rng() < Math.min(0.45, 0.1 + solvedCount * 0.02);
        p = want2 ? (this.nextMate2() || this.nextMate1()) : this.nextMate1();
      }
      return p;
    }
  };
}

return { create: create, mateIn1Moves: mateIn1Moves, mateIn2Keys: mateIn2Keys, existsMateIn1: existsMateIn1 };
});
