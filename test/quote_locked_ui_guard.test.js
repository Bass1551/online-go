const assert = require('assert');

console.log('=== RUNNING LOCKED UI SAFEGUARD TEST ===\n');

// Mock cachedCategories and cachedDifficulties as in quoteGame.js
const cachedCategories = [
  { id: 'all', name: 'รวมทุกประเภท', count: 16, isUnlocked: true },
  { id: 'trending', name: 'เรื่องกระแสฮิต', count: 8, isUnlocked: false },
  { id: 'movie', name: 'ภาพยนตร์ไทย', count: 5, isUnlocked: false }
];

const cachedDifficulties = [
  { id: 'mixed', name: 'รวมระดับ (5 ง่าย : 4 กลาง : 1 ยาก)', isUnlocked: true },
  { id: 'hard', name: 'ยาก (เซียนหนังตัวจริง)', count: 1, isUnlocked: false }
];

let quoteCategory = 'all';
let quoteDifficulty = 'mixed';
let alertMessages = [];
let networkRequests = [];

// Mock alert
function mockAlert(msg) {
  alertMessages.push(msg);
}

// Mock fetch
function mockFetch(url, options) {
  networkRequests.push({ url, body: JSON.parse(options.body) });
  return Promise.resolve({
    json: () => Promise.resolve({ success: true })
  });
}

// Simulated click on category card (same logic as in quoteGame.js)
function onCategoryCardClick(catId) {
  const catObj = cachedCategories.find(c => c.id === catId);
  const isUnlocked = catObj?.isUnlocked || false;

  if (!isUnlocked) {
    mockAlert(`หมวด "${catObj?.name || catId}" มีคำถามที่พร้อมเล่นจริงเพียง ${catObj?.count || 0} ข้อ (ต้องการอย่างน้อย 10 ข้อตามกติกา)\n\nระบบเปิดให้เล่นเฉพาะหมวดที่มีคำถามสมบูรณ์ครบ 10 ข้อเท่านั้น กรุณาเลือกหมวด "รวมทุกประเภท" เพื่อเริ่มเล่นครับ`);
    return;
  }
  quoteCategory = catId;
}

// Simulated click on difficulty pill (same logic as in quoteGame.js)
function onDifficultyPillClick(diffId) {
  const diffObj = cachedDifficulties.find(d => d.id === diffId);
  const isUnlocked = diffObj?.isUnlocked || false;

  if (!isUnlocked) {
    mockAlert(`ระดับความยาก "${diffObj?.name || diffId}" มีคำถามที่พร้อมเล่นจริงเพียง ${diffObj?.count || 0} ข้อ (ต้องการอย่างน้อย 10 ข้อตามกติกา)\n\nกรุณาเลือกระดับ "รวมระดับ" เพื่อเริ่มเล่นรอบ 10 ข้อครับ`);
    return;
  }
  quoteDifficulty = diffId;
}

// Simulated startSingleQuoteGame (same logic as in quoteGame.js)
async function simulatedStartGame() {
  const curCat = cachedCategories.find(c => c.id === quoteCategory);
  if (quoteCategory !== 'all' && curCat && !curCat.isUnlocked) {
    mockAlert(`หมวด "${curCat.name}" มีคำถามที่พร้อมเล่นจริงเพียง ${curCat.count} ข้อ (ต้องการอย่างน้อย 10 ข้อตามกติกา)`);
    quoteCategory = 'all';
    return;
  }

  const curDiff = cachedDifficulties.find(d => d.id === quoteDifficulty);
  if (quoteDifficulty !== 'mixed' && curDiff && !curDiff.isUnlocked) {
    mockAlert(`ระดับความยากนี้มีคำถามที่พร้อมเล่นจริงเพียง ${curDiff?.count || 0} ข้อ`);
    quoteDifficulty = 'mixed';
    return;
  }

  await mockFetch('/api/quote/single/start', {
    method: 'POST',
    body: JSON.stringify({ category: quoteCategory, difficulty: quoteDifficulty })
  });
}

// Test 1: Click on locked category "trending"
console.log('Test 1: User clicks on locked card "เรื่องกระแสฮิต"...');
onCategoryCardClick('trending');

assert.strictEqual(alertMessages.length, 1, 'Alert must be triggered immediately');
assert(alertMessages[0].includes('เรื่องกระแสฮิต'), 'Alert message must name the clicked category');
assert(alertMessages[0].includes('8 ข้อ'), 'Alert message must state the current published count');
assert.strictEqual(quoteCategory, 'all', 'quoteCategory must NOT change to locked category');
console.log('✓ Alert shown immediately, quoteCategory remained "all"');

// Test 2: Click on locked difficulty "hard"
console.log('Test 2: User clicks on locked difficulty pill "ยาก"...');
onDifficultyPillClick('hard');

assert.strictEqual(alertMessages.length, 2, 'Alert must be triggered for locked difficulty');
assert(alertMessages[1].includes('ยาก'), 'Alert must name the difficulty');
assert.strictEqual(quoteDifficulty, 'mixed', 'quoteDifficulty must NOT change to locked difficulty');
console.log('✓ Alert shown immediately, quoteDifficulty remained "mixed"');

// Test 3: Verify no network request was sent while clicking locked cards
assert.strictEqual(networkRequests.length, 0, 'No network requests must be sent by clicking locked options');
console.log('✓ Zero network requests were made during locked card clicks');

// Test 4: Starting game with valid unlocked choice
console.log('Test 4: Starting game with valid choice (all + mixed)...');
simulatedStartGame().then(() => {
  assert.strictEqual(networkRequests.length, 1, 'Exactly one start request sent');
  assert.strictEqual(networkRequests[0].body.category, 'all');
  assert.strictEqual(networkRequests[0].body.difficulty, 'mixed');
  console.log('✓ Start game request sent strictly for "all" + "mixed"');

  console.log('\n=== ALL UI LOCK SAFEGUARD TESTS PASSED! ===');
});
