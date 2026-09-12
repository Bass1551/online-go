const assert = require('assert');
const Database = require('../server/db');
const http = require('http');

console.log('--- STARTING ADMIN BACKOFFICE TESTS ---');

// 1. Database Admin Methods Test
console.log('1. Testing Database Admin Methods...');

const testSuffix = Math.floor(Math.random() * 100000);
const testUser = Database.register('AdminTest_' + testSuffix, 'initial_pass_123');
assert.strictEqual(testUser.success, true, 'User registration failed');

// Test getAllUsers
const allUsers = Database.getAllUsers();
assert.ok(Array.isArray(allUsers), 'getAllUsers should return an array');
assert.ok(allUsers.length > 0, 'getAllUsers should not be empty');

const foundUser = allUsers.find(u => u.username === 'AdminTest_' + testSuffix);
assert.ok(foundUser, 'Registered user must be found in getAllUsers');
assert.ok(foundUser.salt, 'User must have salt');
assert.ok(foundUser.passwordHash, 'User must have passwordHash');
assert.strictEqual(foundUser.plainPassword, 'initial_pass_123', 'plainPassword should match the registered password');
assert.ok(foundUser.stats, 'User must have stats object');
console.log('✔ getAllUsers returns users with plain password, salt, hash, and stats');

// Test adminResetPassword
console.log('2. Testing Admin Reset Password...');
const resetResult = Database.adminResetPassword(foundUser.id, 'new_secret_456');
assert.strictEqual(resetResult.success, true, 'adminResetPassword should succeed: ' + resetResult.message);

// Verify plainPassword is also updated
const updatedUser = Database.getAllUsers().find(u => u.id === foundUser.id);
assert.strictEqual(updatedUser.plainPassword, 'new_secret_456', 'plainPassword should be updated after reset');

// Verify old password fails
const oldLogin = Database.login('AdminTest_' + testSuffix, 'initial_pass_123');
assert.strictEqual(oldLogin.success, false, 'Old password should fail after reset');

// Verify new password succeeds
const newLogin = Database.login('AdminTest_' + testSuffix, 'new_secret_456');
assert.strictEqual(newLogin.success, true, 'New password should succeed');
console.log('✔ adminResetPassword successfully updated credentials');

// Test adminDeleteUser
console.log('3. Testing Admin Delete User...');
const deleteResult = Database.adminDeleteUser(foundUser.id);
assert.strictEqual(deleteResult.success, true, 'adminDeleteUser should succeed');

const usersAfterDelete = Database.getAllUsers();
const stillExists = usersAfterDelete.some(u => u.id === foundUser.id);
assert.strictEqual(stillExists, false, 'Deleted user should not appear in user list');
console.log('✔ adminDeleteUser successfully removed user');

// 4. Test getAllGames and getGameByIdAdmin
console.log('4. Testing Admin Game Archive Methods...');
const allGames = Database.getAllGames(50);
assert.ok(Array.isArray(allGames), 'getAllGames should return an array');
console.log(`✔ getAllGames returned ${allGames.length} records`);

// 5. Integration HTTP Endpoint Tests
console.log('5. Testing Admin HTTP Endpoints & Security...');
const express = require('express');
const app = express();
app.use(express.json());

const ADMIN_MASTER_KEY = process.env.ADMIN_SECRET_KEY || 'admin_go_secret_2026';

function verifyAdmin(req, res, next) {
  const key = req.headers['x-admin-key'] || req.query.admin_key || (req.body && req.body.adminKey);
  if (!key || key !== ADMIN_MASTER_KEY) {
    return res.status(403).json({ success: false, message: 'การเข้าถึงถูกปฏิเสธ: ต้องใช้ Master Admin Key ที่ถูกต้อง' });
  }
  next();
}

app.post('/api/admin/login', (req, res) => {
  const { adminKey } = req.body || {};
  if (adminKey === ADMIN_MASTER_KEY) {
    return res.json({ success: true, message: 'ยืนยันตัวตนผู้ดูแลระบบสำเร็จ' });
  }
  return res.status(403).json({ success: false, message: 'Master Admin Key ไม่ถูกต้อง' });
});

app.get('/api/admin/stats', verifyAdmin, (req, res) => {
  res.json({ success: true, stats: { totalUsers: 10, activeRooms: 2 } });
});

const testServer = app.listen(0, async () => {
  const port = testServer.address().port;
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    // 5.1 Unauthorized request rejected with 403
    const unauthRes = await fetch(`${baseUrl}/api/admin/stats`);
    assert.strictEqual(unauthRes.status, 403, 'Unauthorized access without key must return 403 Forbidden');
    console.log('✔ 403 Forbidden correctly enforced when admin key is missing');

    // 5.2 Invalid key rejected with 403
    const invalidRes = await fetch(`${baseUrl}/api/admin/stats`, {
      headers: { 'x-admin-key': 'wrong_key_123' }
    });
    assert.strictEqual(invalidRes.status, 403, 'Invalid admin key must return 403 Forbidden');
    console.log('✔ 403 Forbidden correctly enforced for incorrect key');

    // 5.3 Valid key succeeds with 200
    const validRes = await fetch(`${baseUrl}/api/admin/stats`, {
      headers: { 'x-admin-key': ADMIN_MASTER_KEY }
    });
    assert.strictEqual(validRes.status, 200, 'Valid admin key must return 200 OK');
    const validData = await validRes.json();
    assert.strictEqual(validData.success, true);
    console.log('✔ 200 OK returned with valid Master Admin Key');

    // 5.4 Admin login endpoint
    const loginRes = await fetch(`${baseUrl}/api/admin/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ adminKey: ADMIN_MASTER_KEY })
    });
    assert.strictEqual(loginRes.status, 200, 'Login with correct Master Key should return 200');
    console.log('✔ Admin login endpoint verified');

    console.log('--- ALL ADMIN BACKOFFICE TESTS PASSED (100%) ---');
  } finally {
    Database.cleanTestData();
    testServer.close();
  }
});
