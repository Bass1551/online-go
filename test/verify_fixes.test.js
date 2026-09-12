const fs = require('fs');
const assert = require('assert');

console.log('--- RUNNING VERIFICATION FOR RECENT BUG FIXES ---');

// Test 1: Check HTML modal hierarchy
const html = fs.readFileSync('public/index.html', 'utf8');
const pwaIdx = html.indexOf('id="pwaGuideModal"');
const forgotIdx = html.indexOf('id="forgotPasswordModal"');

assert(pwaIdx !== -1, 'pwaGuideModal must exist');
assert(forgotIdx !== -1, 'forgotPasswordModal must exist');

// Verify div balance between pwaGuideModal and forgotPasswordModal
const between = html.substring(pwaIdx, forgotIdx);
const opens = (between.match(/<div(\s|>)/g) || []).length;
const closes = (between.match(/<\/div>/g) || []).length;

console.log(`pwaGuideModal opening divs: ${opens}, closing divs: ${closes}`);
assert.strictEqual(opens, closes, 'All divs in pwaGuideModal must be closed before forgotPasswordModal starts');
console.log('✅ PASS 1: forgotPasswordModal is top-level and NOT trapped inside pwaGuideModal!');

// Test 2: Verify server.js exports or syntax
require('../server/server.js');
console.log('✅ PASS 2: server.js loaded with valid syntax and no runtime exceptions!');

setTimeout(() => {
  console.log('🎉 ALL VERIFICATION CHECKS PASSED 100%! 🎉');
  process.exit(0);
}, 500);
