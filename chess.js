/* chess.js — minimal but complete chess engine (0x88 board).
 * Move generation, check / checkmate / stalemate detection, SAN + UCI parsing.
 * No dependencies. Works in browsers and node.
 */
(function (root, factory) {
  var C = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = C;
  else root.Chess = C;
})(typeof self !== 'undefined' ? self : this, function () {
'use strict';

// ---- constants -------------------------------------------------------------
var EMPTY = 0;
var P = 1, N = 2, B = 3, R = 4, Q = 5, K = 6;
var WHITE = 8, BLACK = 16;

var KNIGHT_STEPS = [33, 31, 18, 14, -14, -18, -31, -33];
var KING_STEPS   = [16, -16, 1, -1, 17, -17, 15, -15];
var ORTHO        = [16, -16, 1, -1];
var DIAG         = [17, -17, 15, -15];

function sq(file, rank) { return rank * 16 + file; }       // rank 0 == rank 1
function onBoard(s) { return (s & 0x88) === 0; }
function fileOf(s) { return s & 7; }
function rankOf(s) { return s >> 4; }
function alg(s) { return 'abcdefgh'[fileOf(s)] + (rankOf(s) + 1); }
function sqFromAlg(a) {
  return sq(a.charCodeAt(0) - 97, a.charCodeAt(1) - 49);
}
function opp(c) { return c ^ 24; }                          // 8 ^ 16 == 24
function pieceColor(p) { return p & 24; }
function pieceType(p) { return p & 7; }

var PIECE_LETTER = { 1: '', 2: 'N', 3: 'B', 4: 'R', 5: 'Q', 6: 'K' };
var ASCII_PIECE  = { 0: '.', 1: 'P', 2: 'N', 3: 'B', 4: 'R', 5: 'Q', 6: 'K' };

// castling rights bits: 1 = white K, 2 = white Q, 4 = black K, 8 = black Q
// rights cleared when a king/rook leaves (or a rook is captured on) these squares:
var CASTLE_CLEAR = { 4: 3, 7: 1, 0: 2, 116: 12, 119: 4, 112: 8 }; // e1 h1 a1 e8 h8 a8

// ---- game state ------------------------------------------------------------
function newState() {
  return { b: new Array(128).fill(EMPTY), turn: WHITE, castling: 0,
           ep: -1, half: 0, full: 1, kings: {} };
}

function setupStartpos(st) {
  var back = [R, N, B, Q, K, B, N, R], f;
  for (f = 0; f < 8; f++) {
    st.b[sq(f, 0)] = WHITE | back[f];
    st.b[sq(f, 1)] = WHITE | P;
    st.b[sq(f, 6)] = BLACK | P;
    st.b[sq(f, 7)] = BLACK | back[f];
  }
  st.kings[WHITE] = sq(4, 0);
  st.kings[BLACK] = sq(4, 7);
  st.castling = 15;
  return st;
}

// minimal FEN parser (placement, side, castling, ep; ignores clocks)
function loadFen(st, fen) {
  var parts = fen.trim().split(/\s+/);
  var rows = parts[0].split('/'), r, f, i, ch;
  st.b.fill(EMPTY);
  for (r = 0; r < 8; r++) {
    f = 0;
    for (i = 0; i < rows[7 - r].length; i++) {
      ch = rows[7 - r][i];
      if (ch >= '1' && ch <= '8') { f += ch.charCodeAt(0) - 48; continue; }
      var type = { p: P, n: N, b: B, r: R, q: Q, k: K }[ch.toLowerCase()];
      var color = ch === ch.toUpperCase() ? WHITE : BLACK;
      st.b[sq(f, r)] = color | type;
      if (type === K) st.kings[color] = sq(f, r);
      f++;
    }
  }
  st.turn = parts[1] === 'b' ? BLACK : WHITE;
  st.castling = 0;
  if (parts[2]) {
    if (parts[2].indexOf('K') >= 0) st.castling |= 1;
    if (parts[2].indexOf('Q') >= 0) st.castling |= 2;
    if (parts[2].indexOf('k') >= 0) st.castling |= 4;
    if (parts[2].indexOf('q') >= 0) st.castling |= 8;
  }
  st.ep = (parts[3] && parts[3] !== '-') ? sqFromAlg(parts[3]) : -1;
  st.half = parts[4] ? +parts[4] : 0;
  st.full = parts[5] ? +parts[5] : 1;
  return st;
}

function clone(st) {
  return { b: st.b.slice(), turn: st.turn, castling: st.castling, ep: st.ep,
           half: st.half, full: st.full, kings: { 8: st.kings[8], 16: st.kings[16] } };
}

// ---- attack detection ------------------------------------------------------
function isAttacked(b, s, by) {
  var t, p, o, i;
  // pawns
  if (by === WHITE) {
    t = s - 15; if (onBoard(t) && b[t] === (WHITE | P)) return true;
    t = s - 17; if (onBoard(t) && b[t] === (WHITE | P)) return true;
  } else {
    t = s + 15; if (onBoard(t) && b[t] === (BLACK | P)) return true;
    t = s + 17; if (onBoard(t) && b[t] === (BLACK | P)) return true;
  }
  // knights
  for (i = 0; i < 8; i++) {
    t = s + KNIGHT_STEPS[i];
    if (onBoard(t) && b[t] === (by | N)) return true;
  }
  // king
  for (i = 0; i < 8; i++) {
    t = s + KING_STEPS[i];
    if (onBoard(t) && b[t] === (by | K)) return true;
  }
  // orthogonal sliders
  for (i = 0; i < 4; i++) {
    o = ORTHO[i]; t = s + o;
    while (onBoard(t)) {
      p = b[t];
      if (p !== EMPTY) {
        if (pieceColor(p) === by && (pieceType(p) === R || pieceType(p) === Q)) return true;
        break;
      }
      t += o;
    }
  }
  // diagonal sliders
  for (i = 0; i < 4; i++) {
    o = DIAG[i]; t = s + o;
    while (onBoard(t)) {
      p = b[t];
      if (p !== EMPTY) {
        if (pieceColor(p) === by && (pieceType(p) === B || pieceType(p) === Q)) return true;
        break;
      }
      t += o;
    }
  }
  return false;
}

function inCheck(st, color) {
  return isAttacked(st.b, st.kings[color], opp(color));
}

// ---- move generation -------------------------------------------------------
// move: {from,to,piece,captured,promo,double,ep,castle}  (castle: 0 | 'K' | 'Q')
function genPseudo(st) {
  var moves = [], b = st.b, us = st.turn, them = opp(us);
  var s, p, type, t, i, o;
  var up = us === WHITE ? 16 : -16;
  var startRank = us === WHITE ? 1 : 6;
  var promoRank = us === WHITE ? 7 : 0;

  function addPawnMove(from, to, isCapture, isEp) {
    if (rankOf(to) === promoRank) {
      var pr;
      for (pr = 0; pr < 4; pr++) {
        moves.push({ from: from, to: to, piece: us | P,
          captured: isEp ? (them | P) : pieceType(b[to]),
          promo: [Q, R, B, N][pr], double: false, ep: isEp, castle: 0 });
      }
    } else {
      moves.push({ from: from, to: to, piece: us | P,
        captured: isEp ? (them | P) : pieceType(b[to]),
        promo: 0, double: false, ep: isEp, castle: 0 });
    }
  }

  for (s = 0; s < 128; s++) {
    if (!onBoard(s)) continue;
    p = b[s];
    if (p === EMPTY || pieceColor(p) !== us) continue;
    type = pieceType(p);

    if (type === P) {
      t = s + up;
      if (onBoard(t) && b[t] === EMPTY) {
        addPawnMove(s, t, false, false);
        t = s + 2 * up;
        if (rankOf(s) === startRank && b[t] === EMPTY)
          moves.push({ from: s, to: t, piece: p, captured: 0, promo: 0,
                       double: true, ep: false, castle: 0 });
      }
      var cap;
      cap = s + up + 1;
      if (onBoard(cap) && fileOf(cap) === fileOf(s) + 1) {
        if (b[cap] !== EMPTY && pieceColor(b[cap]) === them) addPawnMove(s, cap, true, false);
        else if (cap === st.ep) addPawnMove(s, cap, true, true);
      }
      cap = s + up - 1;
      if (onBoard(cap) && fileOf(cap) === fileOf(s) - 1) {
        if (b[cap] !== EMPTY && pieceColor(b[cap]) === them) addPawnMove(s, cap, true, false);
        else if (cap === st.ep) addPawnMove(s, cap, true, true);
      }
    } else if (type === N || type === K) {
      var steps = type === N ? KNIGHT_STEPS : KING_STEPS;
      for (i = 0; i < steps.length; i++) {
        t = s + steps[i];
        if (!onBoard(t)) continue;
        if (b[t] === EMPTY || pieceColor(b[t]) === them)
          moves.push({ from: s, to: t, piece: p, captured: pieceType(b[t]),
                       promo: 0, double: false, ep: false, castle: 0 });
      }
    } else {
      var dirs = type === R ? ORTHO : type === B ? DIAG : KING_STEPS;
      for (i = 0; i < dirs.length; i++) {
        o = dirs[i]; t = s + o;
        while (onBoard(t)) {
          if (b[t] === EMPTY) {
            moves.push({ from: s, to: t, piece: p, captured: 0,
                         promo: 0, double: false, ep: false, castle: 0 });
          } else {
            if (pieceColor(b[t]) === them)
              moves.push({ from: s, to: t, piece: p, captured: pieceType(b[t]),
                           promo: 0, double: false, ep: false, castle: 0 });
            break;
          }
          t += o;
        }
      }
    }
  }

  // castling
  var home = us === WHITE ? 0 : 7;
  var e = sq(4, home);
  if (b[e] === (us | K)) {
    var kBit = us === WHITE ? 1 : 4, qBit = us === WHITE ? 2 : 8;
    if ((st.castling & kBit) && b[sq(5, home)] === EMPTY && b[sq(6, home)] === EMPTY &&
        b[sq(7, home)] === (us | R) &&
        !isAttacked(b, e, them) && !isAttacked(b, sq(5, home), them) && !isAttacked(b, sq(6, home), them))
      moves.push({ from: e, to: sq(6, home), piece: us | K, captured: 0,
                   promo: 0, double: false, ep: false, castle: 'K' });
    if ((st.castling & qBit) && b[sq(3, home)] === EMPTY && b[sq(2, home)] === EMPTY &&
        b[sq(1, home)] === EMPTY && b[sq(0, home)] === (us | R) &&
        !isAttacked(b, e, them) && !isAttacked(b, sq(3, home), them) && !isAttacked(b, sq(2, home), them))
      moves.push({ from: e, to: sq(2, home), piece: us | K, captured: 0,
                   promo: 0, double: false, ep: false, castle: 'Q' });
  }
  return moves;
}

function make(st, m) {
  var undo = { m: m, captured: st.b[m.to], castling: st.castling,
               ep: st.ep, half: st.half, piece: st.b[m.from] };
  var us = st.turn, them = opp(us);
  st.half = (pieceType(m.piece) === P || undo.captured !== EMPTY) ? 0 : st.half + 1;
  st.ep = -1;
  if (m.double) st.ep = m.from + (us === WHITE ? 16 : -16);
  st.b[m.from] = EMPTY;
  if (m.ep) {
    var cap = m.to + (us === WHITE ? -16 : 16);
    undo.epCaptured = st.b[cap];
    st.b[cap] = EMPTY;
  }
  st.b[m.to] = m.promo ? (us | m.promo) : undo.piece;
  if (m.castle) {
    var rf, rt;
    if (m.castle === 'K') { rf = m.from + 3; rt = m.from + 1; }
    else { rf = m.from - 4; rt = m.from - 1; }
    st.b[rt] = st.b[rf]; st.b[rf] = EMPTY;
  }
  if (CASTLE_CLEAR[m.from]) st.castling &= ~CASTLE_CLEAR[m.from];
  if (CASTLE_CLEAR[m.to]) st.castling &= ~CASTLE_CLEAR[m.to];
  if (pieceType(undo.piece) === K) st.kings[us] = m.to;
  st.turn = them;
  if (us === BLACK) st.full++;
  return undo;
}

function unmake(st, undo) {
  var m = undo.m, us = st.turn ^ 24;
  st.turn = us;
  st.castling = undo.castling;
  st.ep = undo.ep;
  st.half = undo.half;
  if (us === BLACK) st.full--;
  if (m.castle) {
    var rf, rt;
    if (m.castle === 'K') { rf = m.from + 3; rt = m.from + 1; }
    else { rf = m.from - 4; rt = m.from - 1; }
    st.b[rf] = st.b[rt]; st.b[rt] = EMPTY;
  }
  st.b[m.from] = undo.piece;
  st.b[m.to] = undo.captured;
  if (m.ep) st.b[m.to + (us === WHITE ? -16 : 16)] = undo.epCaptured;
  if (pieceType(undo.piece) === K) st.kings[us] = m.from;
}

function legalMoves(st) {
  var pseudo = genPseudo(st), res = [], i, u;
  var us = st.turn;
  for (i = 0; i < pseudo.length; i++) {
    u = make(st, pseudo[i]);
    if (!isAttacked(st.b, st.kings[us], st.turn)) res.push(pseudo[i]);
    unmake(st, u);
  }
  return res;
}

function isCheckmate(st) {
  return legalMoves(st).length === 0 && inCheck(st, st.turn);
}
function isStalemate(st) {
  return legalMoves(st).length === 0 && !inCheck(st, st.turn);
}

// ---- perft (move-gen validation) -------------------------------------------
function perft(st, depth) {
  if (depth === 0) return 1;
  var moves = legalMoves(st), n = 0, i, u;
  for (i = 0; i < moves.length; i++) {
    u = make(st, moves[i]);
    n += perft(st, depth - 1);
    unmake(st, u);
  }
  return n;
}

// ---- move parsing ----------------------------------------------------------
// UCI: e2e4, e7e8q
function parseUci(st, text) {
  var m = /^([a-h][1-8])([a-h][1-8])([qrbnQRBN])?$/.exec(text.trim());
  if (!m) return null;
  var from = sqFromAlg(m[1]), to = sqFromAlg(m[2]);
  var promo = m[3] ? { q: Q, r: R, b: B, n: N }[m[3].toLowerCase()] : 0;
  var moves = legalMoves(st), i;
  for (i = 0; i < moves.length; i++)
    if (moves[i].from === from && moves[i].to === to && moves[i].promo === promo) return moves[i];
  return null;
}

// SAN: Nf3, exd5, Qxf7#, O-O, e8=Q, R1e2 …
function parseSan(st, text) {
  var s = text.trim().replace(/[\s+#?!]+$/g, '');
  if (!s) return null;
  var moves = legalMoves(st), i;
  var ou = /^O-O(-O)?/.exec(s.toUpperCase().replace(/0/g, 'O'));
  if (ou) {
    var want = ou[1] ? 'Q' : 'K';
    for (i = 0; i < moves.length; i++)
      if (moves[i].castle === want) return moves[i];
    return null;
  }
  var piece = P, rest = s;
  // SAN piece letters are uppercase; a lowercase a-h starts a pawn move (e.g. b4, exd5)
  if (/^[KQRBN]/.test(s)) {
    piece = { K: K, Q: Q, R: R, B: B, N: N }[s[0]];
    rest = s.slice(1);
  }
  var promo = 0;
  var pm = /=([QRBNqrbn])/.exec(rest);
  if (pm) { promo = { q: Q, r: R, b: B, n: N }[pm[1].toLowerCase()]; rest = rest.replace(/=[QRBNqrbn]/, ''); }
  var isCapture = rest.indexOf('x') >= 0;
  rest = rest.replace(/x/g, '');
  var dm = /([a-h][1-8])$/.exec(rest);
  if (!dm) return null;
  var to = sqFromAlg(dm[1]);
  var disamb = rest.slice(0, rest.length - 2);
  var out = [];
  for (i = 0; i < moves.length; i++) {
    var mv = moves[i];
    if (pieceType(mv.piece) !== piece || mv.to !== to) continue;
    if (mv.promo !== promo) continue;
    if (isCapture && !(mv.captured || mv.ep)) continue;
    if (disamb.length === 1) {
      var c = disamb;
      if (c >= 'a' && c <= 'h') { if (fileOf(mv.from) !== c.charCodeAt(0) - 97) continue; }
      else if (c >= '1' && c <= '8') { if (rankOf(mv.from) !== c.charCodeAt(0) - 49) continue; }
      else continue;
    } else if (disamb.length === 2) {
      if (mv.from !== sqFromAlg(disamb)) continue;
    } else if (disamb.length > 2) continue;
    out.push(mv);
  }
  return out.length === 1 ? out[0] : null;
}

function moveToSan(st, m) {
  // minimal SAN for display: piece, capture, dest, promo, castle
  if (m.castle) return m.castle === 'K' ? 'O-O' : 'O-O-O';
  var s = '';
  var type = pieceType(m.piece);
  if (type !== P) {
    s += PIECE_LETTER[type];
    // disambiguation: other same-type pieces that can also reach m.to
    var others = legalMoves(st).filter(function (x) {
      return x !== m && pieceType(x.piece) === type && x.to === m.to;
    });
    if (others.length) {
      var sameFile = others.some(function (x) { return fileOf(x.from) === fileOf(m.from); });
      var sameRank = others.some(function (x) { return rankOf(x.from) === rankOf(m.from); });
      if (!sameFile) s += 'abcdefgh'[fileOf(m.from)];
      else if (!sameRank) s += (rankOf(m.from) + 1);
      else s += alg(m.from);
    }
  } else if (m.captured || m.ep) s += 'abcdefgh'[fileOf(m.from)];
  if (m.captured || m.ep) s += 'x';
  s += alg(m.to);
  if (m.promo) s += '=' + PIECE_LETTER[m.promo];
  var u = make(st, m);
  if (isCheckmate(st)) s += '#';
  else if (inCheck(st, st.turn)) s += '+';
  unmake(st, u);
  return s;
}

function asciiBoard(st, whiteAtBottom) {
  var lines = [], r, f, row;
  var ranks = whiteAtBottom ? [7, 6, 5, 4, 3, 2, 1, 0] : [0, 1, 2, 3, 4, 5, 6, 7];
  var files = whiteAtBottom ? [0, 1, 2, 3, 4, 5, 6, 7] : [7, 6, 5, 4, 3, 2, 1, 0];
  for (var ri = 0; ri < 8; ri++) {
    r = ranks[ri]; row = (r + 1) + ' ';
    for (var fi = 0; fi < 8; fi++) {
      f = files[fi];
      var p = st.b[sq(f, r)];
      var ch = ASCII_PIECE[pieceType(p)];
      if (p !== EMPTY && pieceColor(p) === BLACK) ch = ch.toLowerCase();
      row += ch + ' ';
    }
    lines.push(row.replace(/\s+$/, ''));
  }
  var fl = '  ' + files.map(function (f) { return 'abcdefgh'[f]; }).join(' ');
  lines.push(fl);
  return lines.join('\n');
}

return {
  EMPTY: EMPTY, P: P, N: N, B: B, R: R, Q: Q, K: K, WHITE: WHITE, BLACK: BLACK,
  sq: sq, onBoard: onBoard, fileOf: fileOf, rankOf: rankOf, alg: alg,
  sqFromAlg: sqFromAlg, opp: opp, pieceColor: pieceColor, pieceType: pieceType,
  newState: newState, setupStartpos: setupStartpos, loadFen: loadFen, clone: clone,
  isAttacked: isAttacked, inCheck: inCheck,
  genPseudo: genPseudo, make: make, unmake: unmake, legalMoves: legalMoves,
  isCheckmate: isCheckmate, isStalemate: isStalemate, perft: perft,
  parseUci: parseUci, parseSan: parseSan, moveToSan: moveToSan, asciiBoard: asciiBoard
};
});
