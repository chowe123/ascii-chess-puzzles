/* generator validation — run: node tests/puzzles.js */
var Chess = require('../chess.js');
var Puzzles = require('../puzzles.js');

var fail = 0;
function assert(c, msg) {
  if (!c) { fail++; console.log('FAIL ' + msg); }
}

// independent brute-force check: exactly one mating move
function bruteMateIn1(st) {
  var moves = Chess.legalMoves(st), mates = [], u, i;
  for (i = 0; i < moves.length; i++) {
    u = Chess.make(st, moves[i]);
    var om = Chess.legalMoves(st);
    if (om.length === 0 && Chess.inCheck(st, st.turn)) mates.push(moves[i]);
    Chess.unmake(st, u);
  }
  return mates;
}

var gen = Puzzles.create(123456789);

// --- mate in 1: verify 5 puzzles independently ---
for (var p = 0; p < 5; p++) {
  var t0 = Date.now();
  var puz = gen.nextMate1();
  assert(puz, 'mate1: no puzzle found');
  if (!puz) break;
  var st = Chess.clone(puz.state);
  var brute = bruteMateIn1(st);
  assert(brute.length === 1, 'mate1: uniqueness (brute found ' + brute.length + ')');
  assert(brute.length === 1 && brute[0].from === puz.solutions[0].from &&
         brute[0].to === puz.solutions[0].to, 'mate1: solution matches brute force');
  // solution really mates
  var u = Chess.make(st, puz.solutions[0]);
  assert(Chess.isCheckmate(st), 'mate1: solution is checkmate');
  Chess.unmake(st, u);
  console.log('mate1 puzzle ' + p + ' ok (' + (Date.now() - t0) + 'ms) ' +
              Chess.moveToSan(st, puz.solutions[0]));
}

// --- mate in 2: verify independently (slower) ---
(function () {
  var t0 = Date.now();
  var puz = gen.nextMate2();
  assert(puz, 'mate2: none found in budget');
  if (!puz) return;
  var st = Chess.clone(puz.state);
  // key is not mate in 1
  var u = Chess.make(st, puz.solutions[0]);
  assert(!(Chess.legalMoves(st).length === 0), 'mate2: key must not be mate in 1');
  var replies = Chess.legalMoves(st);
  assert(replies.length > 0, 'mate2: key must leave replies');
  // every reply allows mate in 1
  var allMated = true, r, u2;
  for (r = 0; r < replies.length; r++) {
    u2 = Chess.make(st, replies[r]);
    if (!Puzzles.existsMateIn1(st)) allMated = false;
    Chess.unmake(st, u2);
    if (!allMated) break;
  }
  Chess.unmake(st, u);
  assert(allMated, 'mate2: all replies mated in 1');
  // uniqueness via independent key scan
  var keys = Puzzles.mateIn2Keys(st);
  assert(keys.length === 1, 'mate2: uniqueness (found ' + keys.length + ')');
  console.log('mate2 puzzle ok (' + (Date.now() - t0) + 'ms), ' + replies.length +
              ' replies, key ' + Chess.moveToSan(st, puz.solutions[0]));
})();

// --- stream sanity: 20 puzzles, no repeated positions ---
(function () {
  var seen = {}, dup = 0, i;
  for (i = 0; i < 20; i++) {
    var puz = gen.next('mix', i);
    assert(puz, 'mix: no puzzle at i=' + i);
    if (!puz) break;
    var k = puz.state.b.join(',') + puz.state.turn;
    if (seen[k]) dup++;
    seen[k] = true;
  }
  assert(dup === 0, 'mix: duplicate positions (' + dup + ')');
  console.log('mix stream: 20 puzzles, 0 duplicates');
})();

console.log(fail ? ('\n' + fail + ' FAILURES') : '\nALL PASS');
process.exit(fail ? 1 : 0);
