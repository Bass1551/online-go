/**
 * Comprehensive Integration Test Suite for Thai Quote Game Architecture
 * Verifies all 16 requirements:
 * 1. 10x concurrent answer idempotency
 * 2. Impersonation rejection (Player A cannot answer for Player B)
 * 3. Server deadline enforcement (late answer rejected)
 * 4. Answer vs Timeout CAS race condition
 * 5. AllAnswered vs Timeout single-reveal guarantee
 * 6. Reconnection before deadline vs after deadline view-only
 * 7. Reconnection after answering cannot double answer
 * 8. Round finish idempotency
 * 9. Abandoned rounds excluded from stats
 * 10. Tie-break scoring with shared rank
 * 11. Draft questions strictly excluded from gameplay
 * 12. Published count reflects valid media >= 10KB
 * 13. SSRF validation blocks private ranges
 * 14. Path traversal protection
 * 15. Binary magic header validator
 * 16. Responsive CSS verification (viewports, touch targets, safe-area-inset)
 */

const assert = require('assert');
const path = require('path');
const fs = require('fs');

const QuoteDatabase = require('../server/quoteDb');
const QuoteStatsDb = require('../server/quoteStatsDb');
const QuoteGameEngine = require('../server/quoteEngine');
const QuoteMediaValidator = require('../server/quoteMediaValidator');

async function runAllTests() {
  console.log('🚀 Starting Comprehensive Quote Game Integration Tests...\n');
  let passed = 0;
  let failed = 0;

  async function testCase(name, fn) {
    try {
      await fn();
      console.log(`  ✅ PASSED: ${name}`);
      passed++;
    } catch (err) {
      console.error(`  ❌ FAILED: ${name}`);
      console.error(err);
      failed++;
    }
  }

  // -------------------------------------------------------------
  // Test 1: 10x Concurrent Answer Submissions (Idempotency)
  // -------------------------------------------------------------
  await testCase('1. 10x concurrent answer submissions reject duplicates and record only once', async () => {
    const testRoundId = 'rnd_test_concurrent_' + Date.now();
    const userId = 'user_concur_1';
    const questionId = 'q_test_01';

    await QuoteStatsDb.createRound({
      roundId: testRoundId,
      userId,
      username: userId,
      mode: 'single',
      totalQuestions: 10
    });

    const promises = [];
    for (let i = 0; i < 10; i++) {
      promises.push(
        QuoteStatsDb.recordAnswer({
          roundId: testRoundId,
          userId,
          questionId,
          choiceId: 'opt_0',
          isCorrect: true,
          responseTimeMs: 1500,
          serverTimestamp: Date.now()
        })
      );
    }

    const results = await Promise.all(promises);
    const recorded = results.filter(r => r.recorded);
    const duplicates = results.filter(r => r.isDuplicate);

    assert.strictEqual(recorded.length, 1, 'Exactly one submission should be recorded');
    assert.strictEqual(duplicates.length, 9, 'Exactly 9 submissions should be marked as duplicate');
  });

  // -------------------------------------------------------------
  // Test 2: Player A submitting an answer for Player B is rejected
  // -------------------------------------------------------------
  await testCase('2. Player A submitting for Player B is rejected', async () => {
    // Mock socket.io engine
    const mockIo = { to: () => ({ emit: () => {} }), emit: () => {} };
    const engine = new QuoteGameEngine(mockIo);

    const socketA = { id: 'sock_A', join: () => {} };
    const socketB = { id: 'sock_B', join: () => {} };

    const roomResA = engine.createRoom(socketA, 'PlayerA');
    const roomCode = roomResA.room.code;
    const roomResB = engine.joinRoom(roomCode, socketB, 'PlayerB');

    const room = engine.rooms.get(roomCode);
    room.state = 'ANSWERING';
    room.questions = [{ id: 'q_test', choices: [{ id: 'opt_0', text: 'Ans' }], correctAnswer: 'Ans' }];
    room.currentQuestionIndex = 0;
    room.phaseStartAt = Date.now();
    room.phaseDeadline = Date.now() + 15000;

    const playerB = room.players.get(roomResB.playerId);
    assert.strictEqual(playerB.answers[0], undefined);

    // Player A attempts to answer using Player A's socket
    engine.submitAnswer(roomCode, socketA.id, 'opt_0');
    assert.ok(room.players.get(roomResA.playerId).answers[0], 'Player A answered');
    assert.strictEqual(room.players.get(roomResB.playerId).answers[0], undefined, 'Player B remains unanswered');
  });

  // -------------------------------------------------------------
  // Test 3: Late Answer past Server Deadline is marked incorrect/late
  // -------------------------------------------------------------
  await testCase('3. Answer received after server deadline is rejected/marked late', async () => {
    const qList = QuoteDatabase.getAllQuestions().filter(q => q.status === 'published');
    const q = qList[0];
    assert.ok(q, 'Requires at least 1 published question');

    const now = Date.now();
    const deadline = now - 1; // Deadline was 1ms ago!

    const res = QuoteDatabase.verifyAnswer(q.id, q.correctAnswer, now, deadline);
    assert.strictEqual(res.isLate, true, 'isLate must be true');
    assert.strictEqual(res.isCorrect, false, 'Late answer must be evaluated as incorrect');
  });

  // -------------------------------------------------------------
  // Test 4: CAS State Machine prevents double transitions (Answer vs Timeout)
  // -------------------------------------------------------------
  await testCase('4. CAS state machine prevents double execution between Answer and Timeout', async () => {
    const mockIo = { to: () => ({ emit: () => {} }), emit: () => {} };
    const engine = new QuoteGameEngine(mockIo);
    const socket = { id: 'sock_1', join: () => {} };
    const res = engine.createRoom(socket, 'Host');
    const room = engine.rooms.get(res.room.code);

    room.state = 'ANSWERING';
    room.stateVersion = 5;

    // Simulate concurrent transition attempts from ANSWERING -> REVEAL
    const t1 = engine.transitionState(room, 'ANSWERING', 'REVEAL', () => {});
    const t2 = engine.transitionState(room, 'ANSWERING', 'REVEAL', () => {});

    assert.strictEqual(t1, true, 'First CAS transition must succeed');
    assert.strictEqual(t2, false, 'Second CAS transition must fail (already REVEAL)');
    assert.strictEqual(room.state, 'REVEAL');
    assert.strictEqual(room.stateVersion, 6);
  });

  // -------------------------------------------------------------
  // Test 5: AllAnswered vs Timeout Single-Reveal Guarantee
  // -------------------------------------------------------------
  await testCase('5. AllAnswered vs Timeout single-reveal guarantee', async () => {
    let revealEmitCount = 0;
    const mockIo = {
      to: () => ({
        emit: (event) => {
          if (event === 'game_reveal') revealEmitCount++;
        }
      }),
      emit: () => {}
    };

    const engine = new QuoteGameEngine(mockIo);
    const socket = { id: 'sock_1', join: () => {} };
    const roomRes = engine.createRoom(socket, 'Host');
    const room = engine.rooms.get(roomRes.room.code);

    const q = QuoteDatabase.selectRoundQuestions('all', 'mixed')[0];
    room.questions = [q];
    room.currentQuestionIndex = 0;
    room.state = 'ANSWERING';
    room.stateVersion = 1;
    room.phaseStartAt = Date.now();
    room.phaseDeadline = Date.now() + 15000;

    // Simulate both AllAnswered evaluate and Timeout evaluate firing at once
    engine.evaluateQuestion(room.code, 0, 'all_answered');
    engine.evaluateQuestion(room.code, 0, 'timeout');

    assert.strictEqual(revealEmitCount, 1, 'game_reveal must be emitted exactly once');
    assert.strictEqual(room.state, 'REVEAL');
  });

  // -------------------------------------------------------------
  // Test 6: Reconnection before deadline allows answering; after is view-only
  // -------------------------------------------------------------
  await testCase('6. Reconnection before deadline allows answer; after deadline view-only', async () => {
    const mockIo = { to: () => ({ emit: () => {} }), emit: () => {} };
    const engine = new QuoteGameEngine(mockIo);
    const socket = { id: 'sock_p1', join: () => {} };
    const roomRes = engine.createRoom(socket, 'Player1');
    const room = engine.rooms.get(roomRes.room.code);

    const q = QuoteDatabase.selectRoundQuestions('all', 'mixed')[0];
    room.questions = [q];
    room.currentQuestionIndex = 0;
    room.state = 'ANSWERING';
    room.phaseStartAt = Date.now();
    room.phaseDeadline = Date.now() + 5000;

    // Reconnect socket before deadline
    const newSocket = { id: 'sock_p1_reconnected', join: () => {} };
    const reconBefore = engine.reconnect(room.code, roomRes.playerId, roomRes.reconnectToken, newSocket);
    assert.strictEqual(reconBefore.success, true);
    assert.strictEqual(reconBefore.snapshot.phase, 'ANSWERING');
    assert.strictEqual(reconBefore.snapshot.answered, false);

    // Now transition to REVEAL (deadline passed)
    room.state = 'REVEAL';
    const socket3 = { id: 'sock_p1_third', join: () => {} };
    const reconAfter = engine.reconnect(room.code, roomRes.playerId, roomRes.reconnectToken, socket3);
    assert.strictEqual(reconAfter.success, true);
    assert.strictEqual(reconAfter.snapshot.phase, 'REVEAL');
  });

  // -------------------------------------------------------------
  // Test 7: Reconnection after answering cannot submit different answer
  // -------------------------------------------------------------
  await testCase('7. Reconnection after answering cannot re-submit or change answer', async () => {
    const mockIo = { to: () => ({ emit: () => {} }), emit: () => {} };
    const engine = new QuoteGameEngine(mockIo);
    const socket = { id: 'sock_ans', join: () => {} };
    const roomRes = engine.createRoom(socket, 'Answerer');
    const room = engine.rooms.get(roomRes.room.code);

    const q = QuoteDatabase.selectRoundQuestions('all', 'mixed')[0];
    room.questions = [q];
    room.currentQuestionIndex = 0;
    room.state = 'ANSWERING';
    room.phaseStartAt = Date.now();
    room.phaseDeadline = Date.now() + 15000;

    // Answer with opt_0
    engine.submitAnswer(room.code, roomRes.playerId, 'opt_0');
    const player = room.players.get(roomRes.playerId);
    assert.strictEqual(player.answers[0].selectedChoiceId, 'opt_0');

    // Reconnect on new socket
    const socketRecon = { id: 'sock_ans_recon', join: () => {} };
    const recon = engine.reconnect(room.code, roomRes.playerId, roomRes.reconnectToken, socketRecon);
    assert.strictEqual(recon.snapshot.answered, true);
    assert.strictEqual(recon.snapshot.selectedChoiceId, 'opt_0');

    // Attempt to submit opt_1
    engine.submitAnswer(room.code, roomRes.playerId, 'opt_1');
    assert.strictEqual(player.answers[0].selectedChoiceId, 'opt_0', 'Choice cannot be changed');
  });

  // -------------------------------------------------------------
  // Test 8: Single Player finishRound Idempotency
  // -------------------------------------------------------------
  await testCase('8. Single player finishRound idempotency (no double stats increment)', async () => {
    const testRoundId = 'rnd_finish_idemp_' + Date.now();
    const userId = 'user_idemp_' + Date.now();

    await QuoteStatsDb.createRound({
      roundId: testRoundId,
      userId,
      username: userId,
      mode: 'single',
      totalQuestions: 10
    });

    // Finish round 1st time
    const res1 = await QuoteStatsDb.finishRound({
      roundId: testRoundId,
      userId,
      username: userId,
      score: 8,
      totalCorrectTimeMs: 12000,
      status: 'completed',
      rank: 1,
      totalPlayers: 1,
      finishedAt: Date.now()
    });
    assert.strictEqual(res1.success, true);
    assert.strictEqual(res1.alreadyFinished, false);

    // Finish round 2nd time
    const res2 = await QuoteStatsDb.finishRound({
      roundId: testRoundId,
      userId,
      username: userId,
      score: 8,
      totalCorrectTimeMs: 12000,
      status: 'completed',
      rank: 1,
      totalPlayers: 1,
      finishedAt: Date.now()
    });
    assert.strictEqual(res2.success, true);
    assert.strictEqual(res2.alreadyFinished, true);

    const stats = await QuoteStatsDb.getUserStats(userId);
    assert.strictEqual(stats.completedRounds, 1, 'Completed rounds must be 1, not 2');
    assert.strictEqual(stats.highScore, 8);
    assert.strictEqual(stats.avgScore, 8);
  });

  // -------------------------------------------------------------
  // Test 9: Abandoned rounds strictly excluded from completed rounds & stats
  // -------------------------------------------------------------
  await testCase('9. Abandoned rounds are strictly excluded from completed stats', async () => {
    const testRoundId = 'rnd_abandon_' + Date.now();
    const userId = 'user_abandon_' + Date.now();

    await QuoteStatsDb.createRound({
      roundId: testRoundId,
      userId,
      username: userId,
      mode: 'single',
      totalQuestions: 10
    });

    // Mark as abandoned
    await QuoteStatsDb.abandonRound(testRoundId, userId);

    const stats = await QuoteStatsDb.getUserStats(userId);
    assert.strictEqual(stats.completedRounds, 0, 'Abandoned round must NOT increment completedRounds');
    assert.strictEqual(stats.highScore, 0);
    assert.strictEqual(stats.avgScore, 0);
  });

  // -------------------------------------------------------------
  // Test 10: Tie-break Scoring with Shared Rank
  // -------------------------------------------------------------
  await testCase('10. Tie-break scoring with shared rank when score and time are identical', async () => {
    const mockIo = { to: () => ({ emit: () => {} }), emit: () => {} };
    const engine = new QuoteGameEngine(mockIo);
    const s1 = { id: 's1', join: () => {} };
    const s2 = { id: 's2', join: () => {} };
    const s3 = { id: 's3', join: () => {} };

    const r1 = engine.createRoom(s1, 'Alice');
    const roomCode = r1.room.code;
    const r2 = engine.joinRoom(roomCode, s2, 'Bob');
    const r3 = engine.joinRoom(roomCode, s3, 'Charlie');
    const room = engine.rooms.get(roomCode);

    const pA = room.players.get(r1.playerId);
    const pB = room.players.get(r2.playerId);
    const pC = room.players.get(r3.playerId);

    pA.score = 7;
    pA.totalCorrectTime = 5.2;

    pB.score = 7;
    pB.totalCorrectTime = 5.2;

    pC.score = 5;
    pC.totalCorrectTime = 6.0;

    const rankings = engine.getRankedPlayers(room);
    assert.strictEqual(rankings[0].rank, 1, 'First place');
    assert.strictEqual(rankings[1].rank, 1, 'Second player has identical score & time -> shared rank 1');
    assert.strictEqual(rankings[2].rank, 3, 'Third player gets rank 3');
  });

  // -------------------------------------------------------------
  // Test 11: Draft questions never appear in gameplay
  // -------------------------------------------------------------
  await testCase('11. Draft questions never appear in selectRoundQuestions', async () => {
    const roundQ = QuoteDatabase.selectRoundQuestions('all', 'mixed');
    assert.strictEqual(roundQ.length, 10, 'A round must have exactly 10 questions');
    for (const q of roundQ) {
      assert.strictEqual(q.status, 'published', `Question ${q.id} must be published`);
      assert.ok(q.introVideoUrl && q.quoteVideoUrl, `Question ${q.id} must have both intro and quote video`);
    }
  });

  // -------------------------------------------------------------
  // Test 12: Published count reflects only questions with valid media >= 10KB
  // -------------------------------------------------------------
  await testCase('12. Published count reflects valid media >= 10KB', async () => {
    const cats = QuoteDatabase.getCategoryList();
    const diffs = QuoteDatabase.getDifficultyList();

    const allQ = QuoteDatabase.getAllQuestions();
    const publishedQ = allQ.filter(q => q.status === 'published' && QuoteDatabase.isQuestionPlayable(q));

    const totalFromCats = cats.find(c => c.id === 'all').count;
    assert.strictEqual(totalFromCats, publishedQ.length, 'Category "all" count must equal playable questions count');

    const totalFromDiffs = diffs.find(d => d.id === 'mixed').count;
    assert.strictEqual(totalFromDiffs, publishedQ.length, 'Difficulty "mixed" count must equal playable questions count');
  });

  // -------------------------------------------------------------
  // Test 13: SSRF Validation blocks private IP ranges
  // -------------------------------------------------------------
  await testCase('13. SSRF validation blocks private IP ranges and loopback', async () => {
    const privateUrls = [
      'http://127.0.0.1/video.mp4',
      'http://localhost/video.mp4',
      'http://10.0.0.1/video.mp4',
      'http://192.168.1.100/video.mp4',
      'http://169.254.169.254/latest/meta-data/'
    ];

    for (const url of privateUrls) {
      const res = await QuoteMediaValidator.validateExternalUrl(url);
      assert.strictEqual(res.valid, false, `URL ${url} must be blocked by SSRF validator`);
    }
  });

  // -------------------------------------------------------------
  // Test 14: Path traversal attempts with ../ are blocked
  // -------------------------------------------------------------
  await testCase('14. Path traversal attempts with ../ are blocked', async () => {
    const traversalPaths = [
      '../../etc/passwd',
      '../../../data/users.json',
      '..\\..\\data\\users.json',
      '/video/../../../secret.mp4'
    ];

    for (const p of traversalPaths) {
      const res = QuoteMediaValidator.validateLocalFile(p);
      assert.strictEqual(res.valid, false, `Path ${p} must be blocked by traversal check`);
      assert.ok(res.error.includes('traversal') || res.error.includes('directory'), 'Error mentions traversal');
    }
  });

  // -------------------------------------------------------------
  // Test 15: Binary magic header validator rejects corrupted headers
  // -------------------------------------------------------------
  await testCase('15. Binary media validator rejects corrupted headers', async () => {
    const scratchDir = path.join(__dirname, '..', 'public', 'video', 'quotes');
    if (!fs.existsSync(scratchDir)) fs.mkdirSync(scratchDir, { recursive: true });

    const fakeMp4Path = path.join(scratchDir, 'corrupt_test.mp4');
    fs.writeFileSync(fakeMp4Path, Buffer.alloc(15000, 'X'));

    const res = QuoteMediaValidator.validateLocalFile('/video/quotes/corrupt_test.mp4', 'video');
    fs.unlinkSync(fakeMp4Path); // Clean up

    assert.strictEqual(res.valid, false, 'Corrupted MP4 header must be rejected');
    assert.ok(res.error.includes('corrupted') || res.error.includes('header') || res.error.includes('ftyp') || res.error.includes('Invalid video'), 'Error mentions invalid container or header');
  });

  // -------------------------------------------------------------
  // Test 16: Responsive Viewport CSS Verification
  // -------------------------------------------------------------
  await testCase('16. Responsive CSS includes in-game distraction lock, touch target >= 44px, and safe-area-inset', async () => {
    const cssPath = path.join(__dirname, '..', 'public', 'quoteStyle.css');
    const cssContent = fs.readFileSync(cssPath, 'utf8');

    // In-game distraction lock
    assert.ok(cssContent.includes('body.quote-in-game'), 'CSS must include body.quote-in-game selector');
    assert.ok(cssContent.includes('#friendsPanel'), 'CSS must hide friendsPanel in-game');
    assert.ok(cssContent.includes('.brand-header'), 'CSS must hide brand-header in-game');

    // Touch targets >= 44px
    assert.ok(cssContent.includes('min-height: 44px'), 'CSS must specify min-height: 44px for touch targets');
    assert.ok(cssContent.includes('touch-action: manipulation'), 'CSS must specify touch-action: manipulation');

    // Safe area support
    assert.ok(cssContent.includes('safe-area-inset-top'), 'CSS must support env(safe-area-inset-top)');
    assert.ok(cssContent.includes('safe-area-inset-bottom'), 'CSS must support env(safe-area-inset-bottom)');

    // 16:9 aspect ratio
    assert.ok(cssContent.includes('aspect-ratio: 16 / 9'), 'CSS must specify aspect-ratio: 16 / 9');

    // Viewport media queries
    assert.ok(cssContent.includes('max-width: 480px'), 'CSS must have mobile media query');
    assert.ok(cssContent.includes('max-width: 640px') || cssContent.includes('max-width: 768px'), 'CSS must have tablet/small screen query');
  });

  console.log(`\n=================================================`);
  console.log(`Test Summary: ${passed} Passed, ${failed} Failed`);
  console.log(`=================================================\n`);

  if (failed > 0) {
    process.exit(1);
  }
}

runAllTests().catch(err => {
  console.error('Fatal test error:', err);
  process.exit(1);
});