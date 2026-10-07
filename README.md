# puzzles.log

Infinite chess puzzles in plain ASCII. From a meter away it's a terminal
window; up close it's mate-in-1 and mate-in-2 puzzles, generated forever.

No images, no piece glyphs, no color — just letters on a grid.

## play

Open `index.html`, or use the GitHub Pages link once enabled.

- enter moves as SAN (`Nf3`, `Qxf7#`, `O-O`) or coordinates (`e2e4`, `e7e8q`)
- click / tap squares, or use arrow keys + enter when the prompt is empty
- commands: `new` (skip) · `hint` · `restart` · `level 1|2|mix` · `help`

Mate-in-2 puzzles are interactive: play the key move, the engine replies,
then you deliver mate. Streaks are tracked in `localStorage`.

In the browser console, `PuzzleGame.play('Qxf7#')` works too.

## how puzzles are generated

`puzzles.js` plays biased-random games (captures and checks preferred) from
the start position, then scans the positions with exhaustive search:

- mate in 1: exactly one move checkmates
- mate in 2: exactly one key move leaves the opponent with only replies
  that each allow mate in 1

Uniqueness is verified over *all* legal moves, so a puzzle never has a
second solution the game would mark wrong. The next puzzle is generated in
the background while you solve the current one.

## engine

`chess.js` is a dependency-free 0x88 engine: legal move generation
(castling, en passant, promotion), check/mate/stalemate detection, SAN and
UCI parsing. Validated against standard perft node counts
(`node tests/perft.js`), generator soundness (`node tests/puzzles.js`),
and a headless UI run (`node tests/smoke.js`).

## license

MIT.
