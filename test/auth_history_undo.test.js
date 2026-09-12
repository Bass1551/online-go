const assert = require('assert');
const Database = require('../server/db');
const GoGame = require('../server/goEngine');
const { GoBot, analyzeCapture } = require('../server/botEngine');

console.log('--- STARTING AUTH, ISOLATION & REPLAY TESTS ---');

// 1. User Registration & Login
console.log('1. Testing User Registration & Login...');
const randSuffix = Math.floor(Math.random() * 10000);
const user1 = Database.register('Pro_' + randSuffix, 'pass1234');
assert.strictEqual(user1.success, true, 'User 1 registration failed: ' + (user1.message || ''));
assert.ok(user1.token, 'Token not returned for User 1');

const user2 = Database.register('Chal_' + randSuffix, 'pass5678');
assert.strictEqual(user2.success, true, 'User 2 registration failed: ' + (user2.message || ''));

// Test duplicate registration rejection
const dup = Database.register(user1.user.username, 'anotherPass');
assert.strictEqual(dup.success, false, 'Duplicate username should be rejected');

// Test Login
const loginRes = Database.login(user1.user.username, 'pass1234');
assert.strictEqual(loginRes.success, true, 'Login failed');
assert.strictEqual(loginRes.user.id, user1.user.id);

// 2. Strict Match History Isolation
console.log('2. Testing Strict History Isolation...');
const gameRecord1 = Database.saveGame({
  roomId: 'BOT-TEST1',
  size: 9,
  isBotGame: true,
  botLevel: 3,
  blackPlayer: { name: user1.user.username, userId: user1.user.id },
  whitePlayer: { name: 'AI มือโปร', userId: null },
  winner: 1,
  winReason: 'หมากขาวขอยอมแพ้',
  moves: [
    { step: 1, player: 1, r: 2, c: 2, captured: 0, boardState: Array(9).fill(Array(9).fill(0)) }
  ],
  captures: { 1: 0, 2: 0 },
  userIds: [user1.user.id]
});

const gameRecord2 = Database.saveGame({
  roomId: 'BOT-TEST2',
  size: 9,
  isBotGame: true,
  botLevel: 5,
  blackPlayer: { name: user2.user.username, userId: user2.user.id },
  whitePlayer: { name: 'AI ปรมาจารย์', userId: null },
  winner: 2,
  winReason: 'หมากดำขอยอมแพ้',
  moves: [
    { step: 1, player: 1, r: 4, c: 4, captured: 0, boardState: Array(9).fill(Array(9).fill(0)) }
  ],
  captures: { 1: 0, 2: 0 },
  userIds: [user2.user.id]
});

const user1Games = Database.getUserGames(user1.user.id);
const user2Games = Database.getUserGames(user2.user.id);

assert.ok(user1Games.some(g => g.id === gameRecord1.id), 'User 1 should see gameRecord1');
assert.ok(!user1Games.some(g => g.id === gameRecord2.id), 'User 1 MUST NOT see User 2 gameRecord2');

assert.ok(user2Games.some(g => g.id === gameRecord2.id), 'User 2 should see gameRecord2');
assert.ok(!user2Games.some(g => g.id === gameRecord1.id), 'User 2 MUST NOT see User 1 gameRecord1');

// Test strict detail inspection isolation
const inspectAllowed = Database.getGameById(gameRecord1.id, user1.user.id);
assert.ok(inspectAllowed, 'User 1 should be allowed to inspect their own game');

const inspectForbidden = Database.getGameById(gameRecord1.id, user2.user.id);
assert.strictEqual(inspectForbidden, null, 'User 2 MUST NOT be allowed to inspect User 1 game');

console.log('✅ Match History isolation strictly verified!');

// 3. Instant Bot Undo Simulation
console.log('3. Testing Instant Bot Undo & Capture Restoration...');
const game = new GoGame({ size: 9 });
// Move 1: Black plays (0, 1)
game.playMove(1, 0, 1);
// Move 2: White plays (0, 0)
game.playMove(2, 0, 0);
// Move 3: Black plays (1, 0) -> Captures White stone at (0, 0)
const captureRes = game.playMove(1, 1, 0);
assert.strictEqual(captureRes.capturedStones.length, 1, 'Should capture 1 stone');
assert.strictEqual(game.captures[1], 1, 'Black should have 1 capture');

// Undo last move (Move 3)
const undoRes = game.undoMove();
assert.strictEqual(undoRes.success, true);
assert.strictEqual(game.captures[1], 0, 'Black captures should be reverted to 0');
assert.strictEqual(game.board[0][0], 2, 'Captured stone should be restored on board');
assert.strictEqual(game.turn, 1, 'Turn should be back to Black (player 1)');

console.log('✅ Undo and capture restoration verified!');

// 4. Tactical Analysis on Capture
console.log('4. Testing Tactical Analysis on Capture...');
const testGame = new GoGame({ size: 9 });
testGame.playMove(1, 0, 1);
testGame.playMove(2, 0, 0);
const capMove = testGame.playMove(1, 1, 0);
const analysis = analyzeCapture(null, null, testGame, capMove.lastMove, capMove.capturedStones);
assert.ok(analysis.title, 'Analysis must have a title');
assert.ok(analysis.explanation, 'Analysis must have an explanation');
assert.ok(analysis.competitionTip, 'Analysis must have a competition tip');

console.log('   Tactic Title:', analysis.title);
console.log('   Explanation:', analysis.explanation);
console.log('   Coach Tip:', analysis.competitionTip);
console.log('✅ Tactical Analysis successfully verified!');

Database.cleanTestData();
console.log('\n🎉 ALL TESTS PASSED SUCCESSFULLY! 🎉');
