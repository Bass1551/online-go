const assert = require('assert');
const GoGame = require('../server/goEngine');
const { GoBot, JosekiEngine } = require('../server/botEngine');

console.log('--- STARTING JOSEKI & PRO OPENING ENGINE TESTS ---');

// 1. Test Symmetry Transformations
console.log('1. Testing 8-way symmetries...');
for (const size of [9, 13, 19]) {
  for (let k = 0; k < 8; k++) {
    const origR = 2, origC = 3;
    const trans = JosekiEngine.transform(origR, origC, size, k);
    assert(trans.r >= 0 && trans.r < size, `r must be in bounds for size ${size}, k ${k}`);
    assert(trans.c >= 0 && trans.c < size, `c must be in bounds for size ${size}, k ${k}`);
  }
}
console.log('✅ 8-way symmetries verified on 9x9, 13x13, and 19x19!');

// 2. Test 9x9 Board Opening Patterns
console.log('2. Testing 9x9 Opening Patterns...');
const game9 = new GoGame({ size: 9 });
const botBlack = new GoBot(6);

// Move 1: Empty board -> Tengen (4, 4)
const move1 = botBlack.computeMove(game9, 1);
assert.strictEqual(move1.r, 4, 'Move 1 on 9x9 must be Tengen r=4');
assert.strictEqual(move1.c, 4, 'Move 1 on 9x9 must be Tengen c=4');
assert(move1.tacticalComment && move1.tacticalComment.includes('เท็นเก็น'), 'Should include Tengen commentary');
console.log(`✅ 9x9 Move 1 Tengen passed: (${move1.r}, ${move1.c}) - ${move1.tacticalComment}`);

// Play Move 1 (Black Tengen)
game9.playMove(1, 4, 4);

// Move 2: Bot as White replies with corner base (2, 6)
const botWhite = new GoBot(6);
const move2 = botWhite.computeMove(game9, 2);
assert(move2.r === 2 && (move2.c === 6 || move2.c === 2), 'Move 2 on 9x9 should take corner against Tengen');
console.log(`✅ 9x9 Move 2 corner response passed: (${move2.r}, ${move2.c}) - ${move2.tacticalComment}`);

// 3. Test 19x19 AI 3-3 Invasion (San-San Joseki)
console.log('3. Testing 19x19 AI 3-3 Invasion Joseki across corners...');
const game19 = new GoGame({ size: 19 });

// Top-Left corner: Black plays Star point (3, 3)
game19.playMove(1, 3, 3);
// White invades 3-3 at (2, 2)
game19.playMove(2, 2, 2);

// Now Bot as Black should block at (2, 3) or (3, 2)
const blackBlock = botBlack.computeMove(game19, 1);
assert((blackBlock.r === 2 && blackBlock.c === 3) || (blackBlock.r === 3 && blackBlock.c === 2),
  `Black must block 3-3 invasion! Got (${blackBlock.r}, ${blackBlock.c})`);
assert(blackBlock.tacticalComment.includes('3-3'), 'Must contain 3-3 tactical comment');
console.log(`✅ Top-Left 3-3 Invasion block passed: (${blackBlock.r}, ${blackBlock.c}) - ${blackBlock.tacticalComment}`);

// Test Bottom-Right Corner 3-3 Invasion Symmetry
const gameBR = new GoGame({ size: 19 });
// Black plays Star point at Bottom-Right (15, 15)
gameBR.playMove(1, 15, 15);
// White invades 3-3 at (16, 16)
gameBR.playMove(2, 16, 16);

// Bot Black should block symmetrically at (16, 15) or (15, 16)
const brBlock = botBlack.computeMove(gameBR, 1);
assert((brBlock.r === 16 && brBlock.c === 15) || (brBlock.r === 15 && brBlock.c === 16),
  `Bottom-Right must block symmetrically! Got (${brBlock.r}, ${brBlock.c})`);
console.log(`✅ Bottom-Right 3-3 Invasion symmetric block passed: (${brBlock.r}, ${brBlock.c})`);

// 4. Test Small Knight Approach (Keima Kakari)
console.log('4. Testing Small Knight Approach...');
const gameKnight = new GoGame({ size: 19 });
gameKnight.playMove(1, 3, 3); // Black Star
gameKnight.playMove(2, 2, 5); // White Small Knight approach

const knightReply = botBlack.computeMove(gameKnight, 1);
assert((knightReply.r === 2 && knightReply.c === 4) || (knightReply.r === 1 && knightReply.c === 3),
  `Black must respond to knight approach with Top Attachment or Keima! Got (${knightReply.r}, ${knightReply.c})`);
console.log(`✅ Small Knight response passed: (${knightReply.r}, ${knightReply.c}) - ${knightReply.tacticalComment}`);

// 5. Test Shape Recognition (Hane at head of two stones)
console.log('5. Testing Hane at head of two stones...');
const gameShape = new GoGame({ size: 19 });
// Place two opponent stones in a line: (9, 9) and (9, 10)
gameShape.board[9][9] = 2;
gameShape.board[9][10] = 2;
// Check shape score for (9, 11) - head of two stones!
const haneScore = botBlack.evaluateShapeIntegrity(gameShape, { r: 9, c: 11 }, 1, 2);
const neutralScore = botBlack.evaluateShapeIntegrity(gameShape, { r: 18, c: 18 }, 1, 2);
assert(haneScore > neutralScore + 700, `Hane at head of two must have strong bonus! hane: ${haneScore}, neutral: ${neutralScore}`);
console.log(`✅ Hane at head of two bonus verified (+${haneScore - neutralScore} pts)!`);

console.log('🎉 ALL JOSEKI & PRO OPENING TESTS PASSED 100%! 🎉');
