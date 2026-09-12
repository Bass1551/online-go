const assert = require('assert');
const Database = require('../server/db');
const EmailService = require('../server/emailService');

console.log('--- STARTING GMAIL REGISTRATION & EMAIL OTP TEST SUITE ---');

async function runTest() {
  const testUser = 'u_' + Date.now().toString().slice(-8);
  const testEmail = `player_${Date.now().toString().slice(-6)}@gmail.com`;
  const initialPass = 'mysecretpassword123';
  const newPass = 'newsupersecret2026';

  // 1. Register user with Email (Gmail)
  console.log('1. Testing registration with Gmail...');
  const regRes = Database.register(testUser, initialPass, '1234', testEmail);
  assert(regRes.success, 'Registration with Gmail should succeed: ' + regRes.message);
  assert.strictEqual(regRes.user.email, testEmail, 'User email should match');
  console.log('✓ Registered user with Gmail successfully');

  // 2. Reject duplicate email
  console.log('2. Testing duplicate email prevention...');
  const dupRes = Database.register('other_user_' + Date.now(), 'pass1234', '', testEmail);
  assert(!dupRes.success, 'Duplicate email must be rejected');
  console.log('✓ Duplicate email prevented successfully');

  // 3. Find user by username or email
  console.log('3. Testing lookup by username and by email...');
  const foundByUsername = Database.findUserByUsernameOrEmail(testUser);
  assert(foundByUsername && foundByUsername.email === testEmail, 'Find by username failed');
  const foundByEmail = Database.findUserByUsernameOrEmail(testEmail);
  assert(foundByEmail && foundByEmail.username === testUser, 'Find by email failed');
  console.log('✓ Found user by both Username and Gmail successfully');

  // 4. Request 6-digit OTP
  console.log('4. Testing OTP creation and email service...');
  const otpRes = Database.createEmailOtp(testEmail);
  assert(otpRes.success, 'Create OTP must succeed: ' + otpRes.message);
  assert.strictEqual(otpRes.code.length, 6, 'OTP must be 6 digits');
  console.log(`✓ Generated 6-digit OTP: ${otpRes.code}`);

  // Test EmailService (Simulation mode when no SMTP credentials configured)
  const sendRes = await EmailService.sendPasswordResetOtp(testEmail, testUser, otpRes.code);
  assert(sendRes.success, 'EmailService must return success');
  console.log('✓ EmailService handled dispatch: ' + sendRes.message);

  // 5. Test wrong OTP rejection
  console.log('5. Testing wrong OTP rejection...');
  const wrongOtpRes = Database.verifyOtpAndResetPassword(testUser, '000000', newPass);
  assert(!wrongOtpRes.success, 'Wrong OTP must be rejected');
  console.log('✓ Wrong OTP rejected correctly');

  // 6. Test valid OTP reset
  console.log('6. Testing password reset with valid OTP...');
  const resetRes = Database.verifyOtpAndResetPassword(testUser, otpRes.code, newPass);
  assert(resetRes.success, 'Valid OTP password reset must succeed: ' + resetRes.message);
  console.log('✓ Password reset with OTP succeeded');

  // 7. Verify login with new password
  console.log('7. Testing login with new password...');
  const oldLoginRes = Database.login(testUser, initialPass);
  assert(!oldLoginRes.success, 'Old password must no longer work');
  const newLoginRes = Database.login(testUser, newPass);
  assert(newLoginRes.success, 'New password must log in successfully');
  console.log('✓ Login verified: old password rejected, new password authenticated');

  // 8. Test Admin One-time Reset Code generation
  console.log('8. Testing Admin 6-digit reset code issuance...');
  const reqRes = Database.createResetRequest(testUser, 'ลืมทั้งรหัสทั้งเมล ช่วยด้วยครับ');
  assert(reqRes.success, 'Create reset request must succeed');
  const adminCodeRes = Database.adminGenerateResetCode(reqRes.requestId);
  assert(adminCodeRes.success, 'Admin code generation must succeed');
  assert.strictEqual(adminCodeRes.code.length, 6, 'Admin code must be 6 digits');
  console.log(`✓ Admin generated 6-digit code: ${adminCodeRes.code}`);

  // 9. User uses Admin-issued 6-digit code to reset password
  const adminResetPass = 'fromAdminCode2026';
  const userResetByAdminCodeRes = Database.verifyOtpAndResetPassword(testUser, adminCodeRes.code, adminResetPass);
  assert(userResetByAdminCodeRes.success, 'Reset with admin-issued OTP must succeed');
  const finalLoginRes = Database.login(testUser, adminResetPass);
  assert(finalLoginRes.success, 'Login with password set via admin OTP code must succeed');
  console.log('✓ User successfully set own password using Admin-issued 6-digit code');

  console.log('🎉 ALL GMAIL REGISTRATION & EMAIL OTP TESTS PASSED 100%! 🎉');
  process.exit(0);
}

runTest().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
