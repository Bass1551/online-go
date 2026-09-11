const GoGame = require('../server/goEngine');
const { GoBot, analyzeCapture, evaluateQuizExplanation } = require('../server/botEngine');
const assert = require('assert');

console.log('--- Testing GoBot & Tactical Coach Engine ---');

// Test 1: Verify all 6 difficulty levels can generate valid moves
{
  const game = new GoGame({ size: 9 });
  game.playMove(1, 4, 4); // User plays center

  for (let level = 1; level <= 6; level++) {
    const bot = new GoBot(level);
    const move = bot.computeMove(game, 2); // Bot is White
    assert(move !== null, `Bot level ${level} should return a move`);
    assert(move.r >= 0 && move.r < 9 && move.c >= 0 && move.c < 9, `Bot level ${level} move is within bounds`);
    assert.notStrictEqual(`${move.r},${move.c}`, '4,4', `Bot level ${level} cannot play on occupied spot`);
    console.log(`✓ Bot Level ${level} (${GoBot.LEVEL_NAMES[level]}): chose move (${move.r}, ${move.c})`);
  }
}

// Test 2: Level 2+ Bot must immediately capture opponent stone in atari
{
  const game = new GoGame({ size: 9 });
  // Set Black at (1,1) with only 1 liberty at (1,2)
  game.playMove(1, 1, 1); // B
  game.playMove(2, 0, 1); // W
  game.playMove(1, 8, 8); // B elsewhere
  game.playMove(2, 2, 1); // W
  game.playMove(1, 8, 7); // B elsewhere
  game.playMove(2, 1, 0); // W (now (1,1) has only (1,2) left!)
  game.playMove(1, 8, 6); // B elsewhere

  const bot = new GoBot(2);
  const move = bot.computeMove(game, 2);
  assert.strictEqual(move.r, 1, 'Bot level 2 must capture at (1,2)');
  assert.strictEqual(move.c, 2, 'Bot level 2 must capture at (1,2)');
  console.log('✓ Bot Level 2 captured stone under atari successfully');
}

// Test 3: Analyze Capture & Quiz
{
  const game = new GoGame({ size: 9 });
  // Corner capture simulation
  const captured = [{ r: 0, c: 0 }];
  const lastMove = { player: 1, r: 0, c: 1 };
  const analysis = analyzeCapture(null, null, game, lastMove, captured);
  assert.strictEqual(analysis.tacticKey, 'corner_trap');
  assert(analysis.title.includes('มุม'), 'Analysis identifies corner death');

  const quiz = evaluateQuizExplanation('ดักกินตรงมุมกระดาน', 'corner_trap', analysis);
  assert.strictEqual(quiz.stars, 3, 'Correct explanation gets 3 stars');
  console.log('✓ Capture analysis and quiz evaluator passed');
}

console.log('🎉 ALL BOT & COACH TESTS PASSED! 🎉');
