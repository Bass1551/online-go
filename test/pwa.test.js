const fs = require('fs');
const path = require('path');
const assert = require('assert');

console.log('--- STARTING PWA ASSETS & MANIFEST TEST ---');
const publicDir = path.join(__dirname, '..', 'public');

const manifestPath = path.join(publicDir, 'manifest.json');
assert(fs.existsSync(manifestPath), 'manifest.json must exist');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
assert.strictEqual(manifest.display, 'standalone');
assert(manifest.icons && manifest.icons.length >= 2);

for (const icon of manifest.icons) {
  const iconPath = path.join(publicDir, icon.src.replace(/^\//, ''));
  assert(fs.existsSync(iconPath), 'Icon file must exist');
}
console.log('PASS: manifest.json and icons exist');

const swPath = path.join(publicDir, 'sw.js');
assert(fs.existsSync(swPath));
console.log('PASS: sw.js exists');

const indexPath = path.join(publicDir, 'index.html');
const indexHtml = fs.readFileSync(indexPath, 'utf8');
assert(indexHtml.includes('manifest.json'));
assert(indexHtml.includes('btnInstallPwa'));
assert(indexHtml.includes('pwaGuideModal'));
console.log('PASS: index.html PWA tags exist');

console.log('ALL PWA TESTS PASSED!');
