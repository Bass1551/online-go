const assert = require('assert');
const path = require('path');
const fs = require('fs');
const QuoteDatabase = require('../server/quoteDb.js');

console.log('=== RUNNING QUOTE GAME MIXED RATIO & LOCK TESTS ===\n');

// 1. Current state verification
const playable = QuoteDatabase.getPlayableQuestions();
const easyCount = playable.filter(q => q.difficulty === 'easy').length;
const medCount  = playable.filter(q => q.difficulty === 'medium').length;
const hardCount = playable.filter(q => q.difficulty === 'hard').length;

console.log(`Current published questions: Total = ${playable.length}`);
console.log(`- Easy: ${easyCount}, Medium: ${medCount}, Hard: ${hardCount}`);

assert.strictEqual(playable.length, 16, 'Playable count must be exactly 16 in current state');
assert.strictEqual(hardCount, 1, 'Hard count must be exactly 1 in current state');

// 2. Ratio & UI Text Verification for current state
const currentRatio = QuoteDatabase.getMixedRatio(playable);
console.log('\nCurrent Mixed Ratio calculation:');
console.log(`- Ratio target: Easy=${currentRatio.easy}, Medium=${currentRatio.medium}, Hard=${currentRatio.hard}`);
console.log(`- UI Label: "${currentRatio.label}"`);

assert.strictEqual(currentRatio.easy, 5, 'Current Easy target must be 5');
assert.strictEqual(currentRatio.medium, 4, 'Current Medium target must be 4');
assert.strictEqual(currentRatio.hard, 1, 'Current Hard target must be 1');
assert.strictEqual(currentRatio.label, 'รวมระดับ (5 ง่าย : 4 กลาง : 1 ยาก)', 'UI Label must reflect 5 Easy : 4 Medium : 1 Hard');

// Check difficulty list API
const diffList = QuoteDatabase.getDifficultyList();
const mixedDiff = diffList.find(d => d.id === 'mixed');
assert(mixedDiff, 'Mixed difficulty option must exist');
assert.strictEqual(mixedDiff.name, 'รวมระดับ (5 ง่าย : 4 กลาง : 1 ยาก)', 'diffList mixed name must match');
assert.strictEqual(mixedDiff.isUnlocked, true, 'Mixed difficulty must be unlocked');

// 3. Test 100 random rounds: every round must strictly produce 5 Easy, 4 Medium, 1 Hard
console.log('\nTesting 100 random rounds with current pool...');
for (let i = 1; i <= 100; i++) {
  const round = QuoteDatabase.selectRoundQuestions('all', 'mixed');
  assert.strictEqual(round.length, 10, `Round ${i} must have exactly 10 questions`);

  // Count difficulties
  const roundEasy = round.filter(q => q.difficulty === 'easy').length;
  const roundMed  = round.filter(q => q.difficulty === 'medium').length;
  const roundHard = round.filter(q => q.difficulty === 'hard').length;

  assert.strictEqual(roundEasy, 5, `Round ${i}: Easy count must be exactly 5 (got ${roundEasy})`);
  assert.strictEqual(roundMed,  4, `Round ${i}: Medium count must be exactly 4 (got ${roundMed})`);
  assert.strictEqual(roundHard, 1, `Round ${i}: Hard count must be exactly 1 (got ${roundHard})`);

  // Check no duplicates (ID and Title)
  const ids = new Set(round.map(q => q.id));
  const titles = new Set(round.map(q => q.title));
  assert.strictEqual(ids.size, 10, `Round ${i}: Question IDs must be unique`);
  assert.strictEqual(titles.size, 10, `Round ${i}: Titles must be unique (no duplicate movie/series)`);

  // Check all are published and have valid media
  for (const q of round) {
    assert.strictEqual(q.status, 'published', `Round ${i}: Question ${q.id} must be published`);
    assert(q.introVideoUrl && q.quoteVideoUrl, `Round ${i}: Question ${q.id} must have video clips`);
  }
}
console.log('✓ 100/100 rounds passed: exactly 5 Easy + 4 Medium + 1 Hard, 0 duplicates, 0 drafts');

// 4. Test automatic transition when Hard >= 2
console.log('\nTesting automatic transition when Hard >= 2...');
const mockHardQuestion = {
  ...playable[0],
  id: 'q_mock_hard',
  title: 'หนังจำลองระดับยากเรื่องใหม่',
  difficulty: 'hard',
  status: 'published'
};
const mockPoolWith2Hard = [...playable, mockHardQuestion];
const ratioWhen2Hard = QuoteDatabase.getMixedRatio(mockPoolWith2Hard);

console.log(`- Simulated Hard count: ${mockPoolWith2Hard.filter(q => q.difficulty === 'hard').length}`);
console.log(`- Ratio target: Easy=${ratioWhen2Hard.easy}, Medium=${ratioWhen2Hard.medium}, Hard=${ratioWhen2Hard.hard}`);
console.log(`- UI Label: "${ratioWhen2Hard.label}"`);

assert.strictEqual(ratioWhen2Hard.easy, 4, 'When Hard >= 2, Easy target must be 4');
assert.strictEqual(ratioWhen2Hard.medium, 4, 'When Hard >= 2, Medium target must be 4');
assert.strictEqual(ratioWhen2Hard.hard, 2, 'When Hard >= 2, Hard target must be 2');
assert.strictEqual(ratioWhen2Hard.label, 'รวมระดับ (4 ง่าย : 4 กลาง : 2 ยาก)', 'When Hard >= 2, label must be 4:4:2');
console.log('✓ Automatic transition to 4:4:2 verified!');

// 5. Test locked categories enforcement
console.log('\nTesting locked categories enforcement...');
const categories = QuoteDatabase.getCategoryList();
const unlockedCats = categories.filter(c => c.isUnlocked);
const lockedCats = categories.filter(c => !c.isUnlocked);

console.log(`Unlocked categories (${unlockedCats.length}):`, unlockedCats.map(c => c.name));
console.log(`Locked categories (${lockedCats.length}):`, lockedCats.map(c => `${c.name} (${c.count}/10)`));

assert.strictEqual(unlockedCats.length, 1, 'Only "รวมทุกประเภท" must be unlocked');
assert.strictEqual(unlockedCats[0].id, 'all', 'Unlocked category must be "all"');
assert(lockedCats.length >= 10, 'All subcategories must be locked');

for (const cat of lockedCats) {
  const res = QuoteDatabase.selectRoundQuestions(cat.id, 'mixed');
  assert.strictEqual(res.length, 0, `Locked category "${cat.name}" must return 0 questions from selectRoundQuestions`);
}
console.log('✓ All locked categories return 0 questions from backend selection');

// 6. Test locked difficulties enforcement
console.log('\nTesting locked difficulties enforcement...');
const lockedDiffs = diffList.filter(d => !d.isUnlocked);
console.log('Locked difficulties:', lockedDiffs.map(d => `${d.name} (${d.count}/10)`));
assert.strictEqual(lockedDiffs.length, 3, 'easy, medium, hard must all be locked individually');

for (const diff of lockedDiffs) {
  const res = QuoteDatabase.selectRoundQuestions('all', diff.id);
  assert.strictEqual(res.length, 0, `Locked difficulty "${diff.name}" must return 0 questions from selectRoundQuestions`);
}
console.log('✓ All locked difficulties return 0 questions from backend selection');

// 7. Verify index.html contains updated label
const indexHtml = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');
assert(indexHtml.includes('รวมระดับ (5 ง่าย : 4 กลาง : 1 ยาก)'), 'index.html must display (5 ง่าย : 4 กลาง : 1 ยาก)');
console.log('✓ public/index.html contains the correct 5:4:1 label');

console.log('\n=== ALL 7 REQUIREMENTS VERIFIED & PASSED SUCCESSFULLY! ===');
