/* perft validation — run: node tests/perft.js */
var Chess = require('../chess.js');

var cases = [
  // [fen, depth, expected]
  ['rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', 1, 20],
  ['rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', 2, 400],
  ['rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', 3, 8902],
  ['rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', 4, 197281],
  // kiwipete
  ['r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1', 1, 48],
  ['r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1', 2, 2039],
  ['r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1', 3, 97862],
  // position 3: en passant pin
  ['8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1', 1, 14],
  ['8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1', 2, 191],
  ['8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1', 3, 2812],
  ['8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1', 4, 43238],
  // position 4: promotions
  ['r3k2r/Pppp1ppp/1b3nbN/nP6/BBP1P3/q4N2/Pp1P2PP/R2Q1RK1 w kq - 0 1', 1, 6],
  ['r3k2r/Pppp1ppp/1b3nbN/nP6/BBP1P3/q4N2/Pp1P2PP/R2Q1RK1 w kq - 0 1', 2, 264],
  ['r3k2r/Pppp1ppp/1b3nbN/nP6/BBP1P3/q4N2/Pp1P2PP/R2Q1RK1 w kq - 0 1', 3, 9467],
  // position 5
  ['rnbq1k1r/pp1Pbppp/2p5/8/2B5/8/PPP1NnPP/RNBQK2R w KQ - 0 1', 1, 44],
  ['rnbq1k1r/pp1Pbppp/2p5/8/2B5/8/PPP1NnPP/RNBQK2R w KQ - 0 1', 2, 1486],
  ['rnbq1k1r/pp1Pbppp/2p5/8/2B5/8/PPP1NnPP/RNBQK2R w KQ - 0 1', 3, 62379],
  // position 6
  ['r4rk1/1pp1qppp/p1np1n2/2b1p1B1/2B1P1b1/P1NP1N2/1PP1QPPP/R4RK1 w - - 0 1', 1, 46],
  ['r4rk1/1pp1qppp/p1np1n2/2b1p1B1/2B1P1b1/P1NP1N2/1PP1QPPP/R4RK1 w - - 0 1', 2, 2079],
  ['r4rk1/1pp1qppp/p1np1n2/2b1p1B1/2B1P1b1/P1NP1N2/1PP1QPPP/R4RK1 w - - 0 1', 3, 89890],
];

var fail = 0;
cases.forEach(function (c, i) {
  var st = Chess.loadFen(Chess.newState(), c[0]);
  var t0 = Date.now();
  var n = Chess.perft(st, c[1]);
  var ok = n === c[2];
  if (!ok) fail++;
  console.log((ok ? 'PASS' : 'FAIL') + ' case ' + i + ' depth ' + c[1] +
              ': got ' + n + ', want ' + c[2] + ' (' + (Date.now() - t0) + 'ms)');
});

// make/unmake integrity: random walk, then verify board restored
(function () {
  var st = Chess.setupStartpos(Chess.newState());
  var before = JSON.stringify(st.b);
  for (var i = 0; i < 300; i++) {
    var moves = Chess.legalMoves(st);
    if (!moves.length) break;
    var m = moves[(Math.random() * moves.length) | 0];
    var u = Chess.make(st, m);
    Chess.unmake(st, u);
    if (JSON.stringify(st.b) !== before) { console.log('FAIL make/unmake board'); fail++; break; }
    Chess.make(st, m); // keep walking; restore check only for immediate unmake
    before = JSON.stringify(st.b);
    // undo the walk step so the loop's invariant holds
  }
  console.log('make/unmake spot check done');
})();

// SAN round-trip on the first moves of a game
(function () {
  var st = Chess.setupStartpos(Chess.newState());
  ['e4', 'e5', 'Nf3', 'Nc6', 'Bb5', 'a6', 'Ba4', 'Nf6', 'O-O'].forEach(function (san) {
    var m = Chess.parseSan(st, san);
    if (!m) { console.log('FAIL parseSan: ' + san); fail++; return; }
    Chess.make(st, m);
  });
  console.log('parseSan opening line ok');
  var st2 = Chess.newState();
  Chess.loadFen(st2, 'r1bqk2r/pppp1ppp/2n2n2/2b1p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 0 1');
  var t = Chess.parseSan(st2, 'Bxf7+');
  console.log(t ? 'parseSan capture+check ok' : 'FAIL parseSan Bxf7+');
  if (!t) fail++;
})();

console.log(fail ? ('\n' + fail + ' FAILURES') : '\nALL PASS');
process.exit(fail ? 1 : 0);
