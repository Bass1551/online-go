const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { getBotTauntAndComfort, GoBot } = require('../server/botEngine');

console.log('--- STARTING BOT TAUNT & COMFORT TESTS ---');

// 1. Test every bot level (1 to 6)
for (let lvl = 1; lvl <= 6; lvl++) {
  const result = getBotTauntAndComfort({ botLevel: lvl });
  assert(result, `Result should exist for level ${lvl}`);
  assert.strictEqual(result.botLevel, lvl);
  assert(result.headline.includes('อ่อนว่ะ'), `Headline should include "อ่อนว่ะ" for level ${lvl}`);
  assert(result.taunt && result.taunt.length > 0, `Taunt should not be empty for level ${lvl}`);
  assert(result.comfort && result.comfort.length > 0, `Comfort should not be empty for level ${lvl}`);
  assert(result.meme && result.meme.url, `Meme object should be defined with url for level ${lvl}`);
  
  // Verify meme file physically exists
  const memeRelPath = result.meme.url.replace(/^\//, '');
  const memeFullPath = path.join(__dirname, '..', 'public', memeRelPath);
  assert(fs.existsSync(memeFullPath), `Meme file must exist at ${memeFullPath}`);
  const stat = fs.statSync(memeFullPath);
  assert(stat.size > 50000, `Meme file ${memeFullPath} must be valid size (>50KB)`);

  console.log(`✅ Level ${lvl} (${result.botLevelName}):`);
  console.log(`   Taunt: "${result.taunt}"`);
  console.log(`   Comfort: "${result.comfort.slice(0, 45)}..."`);
  console.log(`   Meme: ${result.meme.caption} (${result.meme.url})`);
}

// 2. Test Resign context
const resignResult = getBotTauntAndComfort({ botLevel: 3, isResign: true, winReason: 'หมากดำขอยอมแพ้ (หมากขาวชนะ)' });
assert(resignResult.taunt.includes('ยอมแพ้'), 'Taunt should mention surrender when isResign is true');
console.log('✅ Resign context test passed:', resignResult.taunt);

// 3. Test Timeout context
const timeoutResult = getBotTauntAndComfort({ botLevel: 4, isTimeout: true, winReason: 'หมากดำเวลาหมด (หมากขาวชนะ)' });
assert(timeoutResult.taunt.includes('เวลาหมด') || timeoutResult.taunt.includes('คิดนาน'), 'Taunt should mention timeout when isTimeout is true');
console.log('✅ Timeout context test passed:', timeoutResult.taunt);

// 4. Test Large Margin
const marginResult = getBotTauntAndComfort({ botLevel: 6, scoreResult: { margin: 42.5 } });
assert(marginResult.taunt.includes('ขาดลอย') || marginResult.taunt.includes('อ่อนว่ะ'), 'Large margin taunt generated');
console.log('✅ Large margin context test passed:', marginResult.taunt);

// 5. Test Close Margin
const closeResult = getBotTauntAndComfort({ botLevel: 2, scoreResult: { margin: 1.5 } });
assert(closeResult.taunt.includes('เกือบจะได้แล้ว') || closeResult.taunt.includes('อ่อนว่ะ'), 'Close margin taunt generated');
console.log('✅ Close margin context test passed:', closeResult.taunt);

console.log('\n🎉 ALL BOT TAUNT & MEME TESTS PASSED SUCCESSFULLY! 🎉');
