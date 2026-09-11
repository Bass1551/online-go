const GoGame = require('../server/goEngine');
const assert = require('assert');

console.log('--- Testing GoGame Engine ---');

// Test 1: Basic move and turn alternating
{
  const game = new GoGame({ size: 9 });
  assert.strictEqual(game.turn, 1, 'Black starts first');
  const res1 = game.playMove(1, 4, 4);
  assert.strictEqual(res1.success, true);
  assert.strictEqual(game.board[4][4], 1);
  assert.strictEqual(game.turn, 2, 'White turn next');

  // Same spot move rejected
  const res2 = game.playMove(2, 4, 4);
  assert.strictEqual(res2.success, false);

  // Wrong turn rejected
  const res3 = game.playMove(1, 3, 3);
  assert.strictEqual(res3.success, false);
  console.log('✓ Test 1: Basic moves and turns passed');
}

// Test 2: Capture a single stone
{
  const game = new GoGame({ size: 9 });
  // White at (1,1)
  // Black surrounds: (0,1), (2,1), (1,0), (1,2)
  game.playMove(1, 0, 1); // B
  game.playMove(2, 1, 1); // W
  game.playMove(1, 2, 1); // B
  game.playMove(2, 8, 8); // W (elsewhere)
  game.playMove(1, 1, 0); // B
  game.playMove(2, 8, 7); // W (elsewhere)
  const captureMove = game.playMove(1, 1, 2); // B captures (1,1)
  
  assert.strictEqual(captureMove.success, true);
  assert.strictEqual(captureMove.capturedStones.length, 1);
  assert.strictEqual(captureMove.capturedStones[0].r, 1);
  assert.strictEqual(captureMove.capturedStones[0].c, 1);
  assert.strictEqual(game.board[1][1], 0, 'Stone (1,1) should be removed');
  assert.strictEqual(game.captures[1], 1, 'Black has 1 capture');
  console.log('✓ Test 2: Single stone capture passed');
}

// Test 3: Suicide rule check
{
  const game = new GoGame({ size: 9 });
  // Black surrounds (0,0): Black at (0,1) and (1,0)
  game.playMove(1, 0, 1); // B
  game.playMove(2, 8, 8); // W
  game.playMove(1, 1, 0); // B
  // Now White tries to play in corner (0,0) with no liberties and no captures
  const suicideMove = game.playMove(2, 0, 0); // W
  assert.strictEqual(suicideMove.success, false, 'Suicide move must be prevented');
  assert.strictEqual(game.board[0][0], 0, 'Board (0,0) must remain empty');
  console.log('✓ Test 3: Suicide rule prevention passed');
}

// Test 4: Ko rule
{
  const game = new GoGame({ size: 9 });
  // Set up standard Ko situation:
  // Black: (1,2), (2,1), (3,2), (2,3)
  // White: (2,2) captures Black, then Black tries to capture right back
  game.playMove(1, 1, 2); // B
  game.playMove(2, 1, 3); // W
  game.playMove(1, 2, 1); // B
  game.playMove(2, 2, 4); // W
  game.playMove(1, 3, 2); // B
  game.playMove(2, 3, 3); // W
  game.playMove(1, 2, 3); // B (puts W into atari)
  
  // W plays (2,2) capturing B at (2,3)
  const wCapture = game.playMove(2, 2, 2);
  assert.strictEqual(wCapture.success, true);
  assert.strictEqual(wCapture.capturedStones.length, 1);

  // B tries to immediately capture back at (2,3) - KO!
  const koMove = game.playMove(1, 2, 3);
  assert.strictEqual(koMove.success, false, 'Immediate Ko capture must be prevented');
  console.log('✓ Test 4: Ko rule passed');
}

// Test 5: Pass and Game End
{
  const game = new GoGame({ size: 9 });
  game.pass(1); // B pass
  assert.strictEqual(game.isGameOver, false);
  assert.strictEqual(game.turn, 2);

  game.pass(2); // W pass -> Game Over!
  assert.strictEqual(game.isGameOver, true);
  assert(game.winner !== null, 'Winner is determined');
  console.log('✓ Test 5: Pass & End-game passed');
}

console.log('ALL GO ENGINE TESTS PASSED SUCCESSFULLY! 🎉');
