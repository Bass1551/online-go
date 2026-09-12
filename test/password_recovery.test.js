const assert = require('assert');
const Database = require('../server/db');

console.log('--- STARTING PASSWORD RECOVERY & RESET TESTS ---');

// Clean any previous test data
Database.cleanTestData();

// 1. Test registration with Recovery PIN
console.log('1. Testing registration with Recovery PIN...');
const regRes = Database.register('test_recover_user', 'oldPassword123', '9988');
assert.strictEqual(regRes.success, true, 'Registration with PIN should succeed');
assert.ok(regRes.token, 'Should return token');
console.log('✔ Registered test_recover_user with PIN 9988');

// 2. Test self-service reset with WRONG PIN
console.log('2. Testing reset with WRONG PIN...');
const wrongPinRes = Database.resetPasswordWithPin('test_recover_user', '0000', 'newPassword456');
assert.strictEqual(wrongPinRes.success, false, 'Should fail with wrong PIN');
assert.ok(wrongPinRes.message.includes('PIN กู้คืนไม่ถูกต้อง'), 'Should show correct error message');
console.log('✔ Wrong PIN correctly rejected');

// 3. Test self-service reset with CORRECT PIN
console.log('3. Testing reset with CORRECT PIN...');
const correctPinRes = Database.resetPasswordWithPin('test_recover_user', '9988', 'newPassword456');
assert.strictEqual(correctPinRes.success, true, 'Should succeed with correct PIN');
console.log('✔ Password reset successful with PIN');

// 4. Verify old password no longer works
console.log('4. Verifying old password is invalidated...');
const oldLoginRes = Database.login('test_recover_user', 'oldPassword123');
assert.strictEqual(oldLoginRes.success, false, 'Old password must fail');

// 5. Verify new password works
console.log('5. Verifying new password works...');
const newLoginRes = Database.login('test_recover_user', 'newPassword456');
assert.strictEqual(newLoginRes.success, true, 'New password must succeed');
assert.strictEqual(newLoginRes.user.username, 'test_recover_user');
console.log('✔ New password logged in successfully');

// 6. Test updating recovery PIN for user
console.log('6. Testing updating recovery PIN...');
const updatePinRes = Database.setRecoveryPin(newLoginRes.user.id, '1234');
assert.strictEqual(updatePinRes.success, true, 'Should update PIN');
const resetWithNewPinRes = Database.resetPasswordWithPin('test_recover_user', '1234', 'superSecret789');
assert.strictEqual(resetWithNewPinRes.success, true, 'Reset with updated PIN should succeed');
console.log('✔ Updated PIN verified');

// 7. Test Admin Reset Request Workflow
console.log('7. Testing Admin Reset Request Workflow...');
const reqRes = Database.createResetRequest('test_recover_user', 'ลืมรหัสครับ ติดต่อ line: test');
assert.strictEqual(reqRes.success, true, 'Reset request creation should succeed');
assert.ok(reqRes.requestId, 'Should return requestId');

const allRequests = Database.getResetRequests();
const foundReq = allRequests.find(r => r.id === reqRes.requestId);
assert.ok(foundReq, 'Request must be present in reset requests list');
assert.strictEqual(foundReq.status, 'pending');
assert.strictEqual(foundReq.username, 'test_recover_user');
console.log('✔ Reset request saved and retrieved');

// 8. Admin resolves reset request
console.log('8. Testing Admin resolving reset request...');
const resolveRes = Database.adminResolveResetRequest(reqRes.requestId, 'adminGivenPass999');
assert.strictEqual(resolveRes.success, true, 'Admin resolve should succeed');

const adminLoginRes = Database.login('test_recover_user', 'adminGivenPass999');
assert.strictEqual(adminLoginRes.success, true, 'User must be able to log in with admin-given password');
console.log('✔ User logged in with Admin-assigned password');

// 9. Admin delete request
const delRes = Database.adminDeleteResetRequest(reqRes.requestId);
assert.strictEqual(delRes.success, true);
assert.strictEqual(Database.getResetRequests().some(r => r.id === reqRes.requestId), false);
console.log('✔ Reset request deleted successfully');

// Clean up test data
Database.cleanTestData();
console.log('--- ALL PASSWORD RECOVERY TESTS PASSED (100%) ---');
