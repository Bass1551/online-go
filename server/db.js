/**
 * Persistent Database & Authentication Module for Online Go
 * Zero external binary dependencies, 100% safe on Windows, Linux, and Cloud
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const https = require('https');
const { URL } = require('url');

const DEFAULT_CLOUD_WEBHOOK = 'https://script.google.com/macros/s/AKfycby-aLe0MkeW9nPoz6u--3oaxXK8a0bTFACVcLOYPCDFYGG2Ff6OrSUxZlNJY9fjq_HzVA/exec';
let cloudSyncTimeout = null;

const DATA_DIR = path.join(__dirname, '..', 'data');
const USERS_FILE = path.join(DATA_DIR, 'users.json');
const GAMES_FILE = path.join(DATA_DIR, 'games.json');
const SESSIONS_FILE = path.join(DATA_DIR, 'sessions.json');
const RESET_REQUESTS_FILE = path.join(DATA_DIR, 'reset_requests.json');
const FRIENDS_FILE = path.join(DATA_DIR, 'friends.json');

// Ensure data directory and files exist
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

function loadJSON(filePath, fallback) {
  try {
    if (!fs.existsSync(filePath)) {
      fs.writeFileSync(filePath, JSON.stringify(fallback, null, 2), 'utf-8');
      return fallback;
    }
    let data = fs.readFileSync(filePath, 'utf-8');
    data = data.replace(/^\uFEFF/, '').trim();
    if (!data) return fallback;
    return JSON.parse(data);
  } catch (err) {
    console.error(`Error loading ${filePath}:`, err);
    return fallback;
  }
}

function saveJSON(filePath, data) {
  try {
    const tempFile = `${filePath}.tmp.${Date.now()}`;
    fs.writeFileSync(tempFile, JSON.stringify(data, null, 2), 'utf-8');
    fs.renameSync(tempFile, filePath);
    if (filePath === USERS_FILE) {
      Database.syncToCloud();
    } else if (filePath === FRIENDS_FILE) {
      syncFriendsToCloud();
    }
  } catch (err) {
    console.error(`Error saving ${filePath}:`, err);
  }
}

function doCloudSync() {
  try {
    const webhookUrl = process.env.GMAIL_WEBHOOK_URL || process.env.DATABASE_WEBHOOK_URL || DEFAULT_CLOUD_WEBHOOK;
    if (!webhookUrl) return;

    // Strip plainPassword before cloud upload — security: never expose raw passwords externally
    const safeUsers = {};
    for (const [k, u] of Object.entries(users)) {
      const { plainPassword: _stripped, ...safeUser } = u; // eslint-disable-line no-unused-vars
      safeUsers[k] = safeUser;
    }

    const payload = JSON.stringify({
      action: 'save_db',
      users: safeUsers,
      timestamp: Date.now()
    });

    const parsed = new URL(webhookUrl);
    const req = https.request({
      hostname: parsed.hostname,
      path: parsed.pathname + (parsed.search || ''),
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
        'User-Agent': 'OnlineGo-Server/2.0'
      },
      timeout: 8000
    }, (res) => {
      res.resume();
    });

    req.on('error', () => {});
    req.on('timeout', () => req.destroy());
    req.write(payload);
    req.end();
  } catch (err) {
    // Ignore background sync errors
  }
}

// In-memory cache synced with disk
let users = loadJSON(USERS_FILE, {});
let games = loadJSON(GAMES_FILE, []);
let sessions = loadJSON(SESSIONS_FILE, {});
let resetRequests = loadJSON(RESET_REQUESTS_FILE, []);
let friendsData = loadJSON(FRIENDS_FILE, {}); // { userId: { friends: [], pendingOut: [], pendingIn: [] } }
let activeOtps = {}; // { userId: { code, email, expiresAt, createdAt, issuedByAdmin } }

function hashPassword(password, salt) {
  return crypto.scryptSync(password, salt, 64).toString('hex');
}

class Database {
  /**
   * Register a new user with optional email (Gmail) and recovery PIN
   */
  static register(username, password, recoveryPin = '', email = '') {
    const cleanUsername = (username || '').trim();
    if (!cleanUsername || cleanUsername.length < 2 || cleanUsername.length > 20) {
      return { success: false, message: 'ชื่อผู้ใช้ต้องมีความยาว 2-20 ตัวอักษร' };
    }
    if (!password || password.length < 4) {
      return { success: false, message: 'รหัสผ่านต้องมีความยาวอย่างน้อย 4 ตัวอักษร' };
    }

    const lowerKey = cleanUsername.toLowerCase();
    if (users[lowerKey]) {
      return { success: false, message: 'ชื่อผู้ใช้นี้มีคนใช้แล้ว กรุณาเลือกชื่ออื่น' };
    }

    const cleanEmail = (email || '').trim().toLowerCase();
    if (cleanEmail) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(cleanEmail)) {
        return { success: false, message: 'รูปแบบอีเมลไม่ถูกต้อง กรุณาตรวจสอบอีเมล (Gmail)' };
      }
      const existingEmailUser = Object.values(users).find(u => u.email && u.email.toLowerCase() === cleanEmail);
      if (existingEmailUser) {
        return { success: false, message: 'อีเมลนี้ถูกใช้งานแล้วโดยบัญชีอื่น กรุณาใช้อีเมลอื่น' };
      }
    }

    const salt = crypto.randomBytes(16).toString('hex');
    const passwordHash = hashPassword(password, salt);
    const userId = 'usr_' + crypto.randomBytes(8).toString('hex');
    const cleanPin = recoveryPin ? String(recoveryPin).trim() : '';

    const newUser = {
      id: userId,
      username: cleanUsername,
      email: cleanEmail,
      salt,
      passwordHash,
      plainPassword: password, // เก็บตัวรหัสผ่านจริงสำหรับเจ้าของระบบ
      recoveryPin: cleanPin,
      createdAt: new Date().toISOString()
    };

    users[lowerKey] = newUser;
    saveJSON(USERS_FILE, users);

    // Create session token
    const token = Database.createSession(newUser);
    return {
      success: true,
      user: { id: newUser.id, username: newUser.username, email: newUser.email },
      token
    };
  }

  /**
   * Login existing user (or auto-create if server redeployed on cloud)
   */
  static login(username, password) {
    const rawUsername = (username || '').trim();
    const cleanUsername = rawUsername.toLowerCase();
    const user = users[cleanUsername];

    if (!user) {
      return { success: false, message: 'ไม่พบบัญชีผู้ใช้นี้ในระบบ กรุณากดแท็บ "สมัครสมาชิกใหม่" เพื่อลงทะเบียนบัญชีของคุณก่อนเข้าเล่นครับ' };
    }

    const testHash = hashPassword(password || '', user.salt);
    if (testHash !== user.passwordHash) {
      return { success: false, message: 'รหัสผ่านไม่ถูกต้อง กรุณาตรวจสอบรหัสผ่านอีกครั้ง' };
    }

    // Update plainPassword if not set yet
    if (!user.plainPassword) {
      user.plainPassword = password;
      saveJSON(USERS_FILE, users);
    }

    const token = Database.createSession(user);
    return {
      success: true,
      user: { id: user.id, username: user.username },
      token
    };
  }

  static createSession(user) {
    const token = 'tok_' + crypto.randomBytes(24).toString('hex');
    sessions[token] = {
      userId: user.id,
      username: user.username,
      createdAt: Date.now()
    };
    saveJSON(SESSIONS_FILE, sessions);
    return token;
  }

  static verifyToken(token) {
    if (!token || !sessions[token]) return null;
    const session = sessions[token];
    return { id: session.userId, username: session.username };
  }

  static logout(token) {
    if (token && sessions[token]) {
      delete sessions[token];
      saveJSON(SESSIONS_FILE, sessions);
    }
  }

  /**
   * Self-service reset password using recovery PIN
   */
  static resetPasswordWithPin(username, pin, newPassword) {
    const cleanUsername = (username || '').trim();
    if (!cleanUsername) {
      return { success: false, message: 'กรุณาระบุชื่อผู้ใช้' };
    }
    const cleanPin = String(pin || '').trim();
    if (!cleanPin) {
      return { success: false, message: 'กรุณาระบุ PIN กู้คืน 4 หลัก' };
    }
    if (!newPassword || newPassword.length < 4) {
      return { success: false, message: 'รหัสผ่านใหม่ต้องมีความยาวอย่างน้อย 4 ตัวอักษร' };
    }

    const lowerKey = cleanUsername.toLowerCase();
    const user = users[lowerKey];
    if (!user) {
      return { success: false, message: 'ไม่พบบัญชีผู้ใช้นี้ในระบบ กรุณาตรวจสอบชื่อผู้ใช้' };
    }

    if (!user.recoveryPin) {
      return {
        success: false,
        noPin: true,
        message: 'บัญชีนี้ยังไม่ได้ตั้ง PIN กู้คืน กรุณากดเลือก "ส่งคำขอให้แอดมินช่วยรีเซ็ต"'
      };
    }

    if (user.recoveryPin !== cleanPin) {
      return { success: false, message: 'PIN กู้คืนไม่ถูกต้อง กรุณาตรวจสอบอีกครั้ง' };
    }

    const newSalt = crypto.randomBytes(16).toString('hex');
    const newHash = hashPassword(newPassword, newSalt);

    user.salt = newSalt;
    user.passwordHash = newHash;
    user.plainPassword = newPassword;
    user.updatedAt = new Date().toISOString();
    saveJSON(USERS_FILE, users);

    // Invalidate existing sessions
    for (const token of Object.keys(sessions)) {
      if (sessions[token].userId === user.id) {
        delete sessions[token];
      }
    }
    saveJSON(SESSIONS_FILE, sessions);

    return {
      success: true,
      message: 'รีเซ็ตรหัสผ่านสำเร็จเรียบร้อย! คุณสามารถเข้าสู่ระบบด้วยรหัสผ่านใหม่ได้ทันที'
    };
  }

  /**
   * Set or update recovery PIN for authenticated user
   */
  static setRecoveryPin(userId, pin) {
    if (!userId) return { success: false, message: 'Unauthorized' };
    const cleanPin = String(pin || '').trim();
    if (!cleanPin || cleanPin.length < 4 || cleanPin.length > 6) {
      return { success: false, message: 'PIN กู้คืนต้องเป็นตัวเลข 4-6 หลัก' };
    }
    const user = Object.values(users).find(u => u.id === userId);
    if (!user) return { success: false, message: 'ไม่พบข้อมูลผู้ใช้' };

    user.recoveryPin = cleanPin;
    saveJSON(USERS_FILE, users);
    return { success: true, message: 'บันทึก PIN กู้คืนเรียบร้อยแล้ว' };
  }

  /**
   * Find user by Username or Email
   */
  static findUserByUsernameOrEmail(identifier) {
    const clean = (identifier || '').trim().toLowerCase();
    if (!clean) return null;
    if (users[clean]) return users[clean];
    return Object.values(users).find(u => 
      (u.email && u.email.toLowerCase() === clean) || 
      (u.username && u.username.toLowerCase() === clean)
    ) || null;
  }

  /**
   * Set or update Email for authenticated user
   */
  static setEmail(userId, email) {
    if (!userId) return { success: false, message: 'Unauthorized' };
    const cleanEmail = (email || '').trim().toLowerCase();
    if (!cleanEmail) {
      return { success: false, message: 'กรุณาระบุอีเมล' };
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(cleanEmail)) {
      return { success: false, message: 'รูปแบบอีเมลไม่ถูกต้อง กรุณาตรวจสอบอีเมล (เช่น name@gmail.com)' };
    }
    const existing = Object.values(users).find(u => u.id !== userId && u.email && u.email.toLowerCase() === cleanEmail);
    if (existing) {
      return { success: false, message: 'อีเมลนี้ถูกใช้งานโดยบัญชีอื่นแล้ว' };
    }
    const user = Object.values(users).find(u => u.id === userId);
    if (!user) return { success: false, message: 'ไม่พบข้อมูลผู้ใช้' };

    user.email = cleanEmail;
    saveJSON(USERS_FILE, users);
    return { success: true, message: 'บันทึกอีเมลเรียบร้อยแล้ว', email: cleanEmail };
  }

  /**
   * Create a 6-digit OTP for Email password reset
   */
  static createEmailOtp(identifier) {
    const user = Database.findUserByUsernameOrEmail(identifier);
    if (!user) {
      return { success: false, message: 'ไม่พบบัญชีผู้ใช้หรืออีเมลนี้ในระบบ กรุณาตรวจสอบอีกครั้ง' };
    }

    if (!user.email) {
      return {
        success: false,
        noEmail: true,
        message: `บัญชี "${user.username}" ยังไม่ได้ผูกอีเมลไว้ กรุณาใช้ PIN กู้คืน 4 หลัก หรือขอรหัสปลดล็อกชั่วคราวจากแอดมินแทนครับ`
      };
    }

    // Generate 6-digit numeric OTP
    const code = crypto.randomInt(100000, 999999).toString();
    activeOtps[user.id] = {
      userId: user.id,
      code,
      email: user.email,
      expiresAt: Date.now() + 15 * 60 * 1000, // 15 minutes
      createdAt: Date.now()
    };

    return {
      success: true,
      user: { id: user.id, username: user.username, email: user.email },
      code
    };
  }

  /**
   * Verify OTP (Email OTP or Admin-issued 6-digit code) and Reset Password
   */
  static verifyOtpAndResetPassword(identifier, otpCode, newPassword) {
    const cleanId = (identifier || '').trim();
    const cleanOtp = String(otpCode || '').trim();
    if (!cleanId) return { success: false, message: 'กรุณาระบุชื่อผู้ใช้หรืออีเมล' };
    if (!cleanOtp || cleanOtp.length !== 6) {
      return { success: false, message: 'รหัส OTP ต้องเป็นตัวเลข 6 หลัก' };
    }
    if (!newPassword || newPassword.length < 4) {
      return { success: false, message: 'รหัสผ่านใหม่ต้องมีความยาวอย่างน้อย 4 ตัวอักษร' };
    }

    const user = Database.findUserByUsernameOrEmail(cleanId);
    if (!user) {
      return { success: false, message: 'ไม่พบบัญชีผู้ใช้นี้ในระบบ' };
    }

    const otpEntry = activeOtps[user.id];
    if (!otpEntry || otpEntry.code !== cleanOtp) {
      return { success: false, message: 'รหัส OTP ไม่ถูกต้อง กรุณาตรวจสอบอีกครั้ง' };
    }

    if (Date.now() > otpEntry.expiresAt) {
      delete activeOtps[user.id];
      return { success: false, message: 'รหัส OTP นี้หมดอายุแล้ว (อายุการใช้งาน 15 นาที) กรุณากดขอรหัสใหม่' };
    }

    // OTP is valid! Reset password
    const newSalt = crypto.randomBytes(16).toString('hex');
    const newHash = hashPassword(newPassword, newSalt);

    user.salt = newSalt;
    user.passwordHash = newHash;
    user.plainPassword = newPassword;
    user.updatedAt = new Date().toISOString();
    saveJSON(USERS_FILE, users);

    // Consume OTP
    delete activeOtps[user.id];

    // Invalidate sessions
    for (const token of Object.keys(sessions)) {
      if (sessions[token].userId === user.id) {
        delete sessions[token];
      }
    }
    saveJSON(SESSIONS_FILE, sessions);

    return {
      success: true,
      message: 'รีเซ็ตรหัสผ่านสำเร็จเรียบร้อย! คุณสามารถเข้าสู่ระบบด้วยรหัสผ่านใหม่ได้ทันที'
    };
  }

  /**
   * Admin: Generate a 6-digit one-time reset code for user request
   */
  static adminGenerateResetCode(requestId) {
    const req = resetRequests.find(r => r.id === requestId);
    if (!req) return { success: false, message: 'ไม่พบคำขอนี้' };

    const code = crypto.randomInt(100000, 999999).toString();
    activeOtps[req.userId] = {
      userId: req.userId,
      code,
      email: req.email || null,
      expiresAt: Date.now() + 60 * 60 * 1000, // 1 hour
      createdAt: Date.now(),
      issuedByAdmin: true
    };

    req.status = 'approved_code';
    req.otpCode = code;
    req.resolvedAt = new Date().toISOString();
    saveJSON(RESET_REQUESTS_FILE, resetRequests);

    return {
      success: true,
      message: `สร้างรหัสรีเซ็ต 6 หลักสำเร็จ: ${code}`,
      code,
      request: req
    };
  }

  /**
   * Submit reset password request to Admin
   */
  static createResetRequest(username, note = '') {
    const cleanUsername = (username || '').trim();
    if (!cleanUsername) return { success: false, message: 'กรุณาระบุชื่อผู้ใช้' };

    const lowerKey = cleanUsername.toLowerCase();
    const user = users[lowerKey];
    if (!user) {
      return { success: false, message: 'ไม่พบบัญชีผู้ใช้นี้ในระบบ กรุณาตรวจสอบชื่อผู้ใช้' };
    }

    // Check if pending request exists
    const existing = resetRequests.find(r => r.userId === user.id && r.status === 'pending');
    if (existing) {
      return {
        success: true,
        message: 'มีคำขอรีเซ็ตรหัสผ่านของคุณอยู่ในระบบแล้ว เจ้าของระบบกำลังตรวจสอบและดำเนินการให้ครับ',
        requestId: existing.id
      };
    }

    const request = {
      id: 'req_' + crypto.randomBytes(6).toString('hex'),
      userId: user.id,
      username: user.username,
      note: (note || '').trim(),
      status: 'pending',
      createdAt: new Date().toISOString()
    };

    resetRequests.unshift(request);
    if (resetRequests.length > 200) resetRequests = resetRequests.slice(0, 200);
    saveJSON(RESET_REQUESTS_FILE, resetRequests);

    return {
      success: true,
      message: `ส่งคำขอรีเซ็ตรหัสผ่านสำหรับ "${user.username}" ถึงผู้ดูแลระบบเรียบร้อยแล้ว!`,
      requestId: request.id
    };
  }

  static getResetRequests() {
    return resetRequests;
  }

  static adminResolveResetRequest(requestId, newPassword) {
    const req = resetRequests.find(r => r.id === requestId);
    if (!req) return { success: false, message: 'ไม่พบคำขอนี้' };

    if (newPassword && newPassword.trim()) {
      const resetResult = Database.adminResetPassword(req.userId, newPassword.trim());
      if (!resetResult.success) return resetResult;
      req.tempPassword = newPassword.trim();
    }

    req.status = 'resolved';
    req.resolvedAt = new Date().toISOString();
    saveJSON(RESET_REQUESTS_FILE, resetRequests);

    return {
      success: true,
      message: `ดำเนินการรีเซ็ตรหัสผ่านให้ "${req.username}" เรียบร้อยแล้ว`,
      request: req
    };
  }

  static adminDeleteResetRequest(requestId) {
    const idx = resetRequests.findIndex(r => r.id === requestId);
    if (idx === -1) return { success: false, message: 'ไม่พบคำขอนี้' };
    resetRequests.splice(idx, 1);
    saveJSON(RESET_REQUESTS_FILE, resetRequests);
    return { success: true, message: 'ลบรายการคำขอเรียบร้อยแล้ว' };
  }

  /**
   * Save completed game record
   */
  static saveGame(gameRecord) {
    const record = {
      id: 'game_' + crypto.randomBytes(8).toString('hex'),
      date: new Date().toISOString(),
      ...gameRecord
    };

    games.unshift(record); // newest first
    // Keep last 1000 games
    if (games.length > 1000) {
      games = games.slice(0, 1000);
    }
    saveJSON(GAMES_FILE, games);
    return record;
  }

  /**
   * Get games played by a specific user ONLY (Strict Isolation)
   */
  static getUserGames(userId) {
    if (!userId) return [];
    return games
      .filter(g => g.userIds && g.userIds.includes(userId))
      .map(g => ({
        id: g.id,
        date: g.date,
        size: g.size,
        isBotGame: !!g.isBotGame,
        botLevel: g.botLevel,
        blackPlayer: g.blackPlayer,
        whitePlayer: g.whitePlayer,
        winner: g.winner,
        winReason: g.winReason,
        myColor: g.blackPlayer?.userId === userId ? 1 : 2,
        isWinner: (g.blackPlayer?.userId === userId && g.winner === 1) || (g.whitePlayer?.userId === userId && g.winner === 2),
        totalMoves: (g.moves || []).length,
        captures: g.captures
      }));
  }

  /**
   * Get full move-by-move kifu for replay and tactical review
   */
  static getGameById(gameId, userId) {
    const game = games.find(g => g.id === gameId);
    if (!game) return null;
    // Strict isolation: only participating users can inspect
    if (!game.userIds || !game.userIds.includes(userId)) {
      return null;
    }
    return game;
  }

  /**
   * Get user statistics
   */
  static getUserStats(userId) {
    const userGames = games.filter(g => g.userIds && g.userIds.includes(userId));
    let wins = 0;
    let losses = 0;
    for (const g of userGames) {
      const isBlack = g.blackPlayer?.userId === userId;
      if ((isBlack && g.winner === 1) || (!isBlack && g.winner === 2)) {
        wins++;
      } else {
        losses++;
      }
    }
    return {
      totalGames: userGames.length,
      wins,
      losses,
      winRate: userGames.length > 0 ? Math.round((wins / userGames.length) * 100) : 0
    };
  }

  // ================= ADMIN BACKOFFICE METHODS =================

  /**
   * Admin: Get all registered user accounts with security details and stats
   */
  static getAllUsers() {
    return Object.values(users).map(u => {
      const stats = Database.getUserStats(u.id);
      return {
        id: u.id,
        username: u.username,
        email: u.email || '-',
        plainPassword: u.plainPassword || '(ไม่ได้บันทึก)',
        recoveryPin: u.recoveryPin || '-',
        salt: u.salt,
        passwordHash: u.passwordHash,
        createdAt: u.createdAt || 'ไม่ระบุ',
        stats
      };
    });
  }

  /**
   * Admin: Reset password for any user account
   */
  static adminResetPassword(target, newPassword) {
    if (!target) return { success: false, message: 'กรุณาระบุบัญชีผู้ใช้' };
    if (!newPassword || newPassword.length < 4) {
      return { success: false, message: 'รหัสผ่านใหม่ต้องมีความยาวอย่างน้อย 4 ตัวอักษร' };
    }

    const clean = target.trim();
    // Search by ID or username
    let userKey = Object.keys(users).find(k => users[k].id === clean || users[k].username.toLowerCase() === clean.toLowerCase());
    if (!userKey) {
      return { success: false, message: 'ไม่พบบัญชีผู้ใช้นี้ในระบบ' };
    }

    const user = users[userKey];
    const newSalt = crypto.randomBytes(16).toString('hex');
    const newHash = hashPassword(newPassword, newSalt);

    user.salt = newSalt;
    user.passwordHash = newHash;
    user.plainPassword = newPassword;
    user.updatedAt = new Date().toISOString();

    saveJSON(USERS_FILE, users);

    // Invalidate existing sessions for this user so they must log in with new password
    for (const token of Object.keys(sessions)) {
      if (sessions[token].userId === user.id) {
        delete sessions[token];
      }
    }
    saveJSON(SESSIONS_FILE, sessions);

    return {
      success: true,
      message: `เปลี่ยนรหัสผ่านสำหรับผู้ใช้ "${user.username}" สำเร็จเรียบร้อยแล้ว`,
      user: { id: user.id, username: user.username }
    };
  }

  /**
   * Admin: Delete user account
   */
  static adminDeleteUser(target) {
    if (!target) return { success: false, message: 'กรุณาระบุบัญชีผู้ใช้' };
    const clean = target.trim();
    const userKey = Object.keys(users).find(k => users[k].id === clean || users[k].username.toLowerCase() === clean.toLowerCase());
    if (!userKey) {
      return { success: false, message: 'ไม่พบบัญชีผู้ใช้นี้' };
    }

    const deletedUser = users[userKey];
    delete users[userKey];
    saveJSON(USERS_FILE, users);

    // Clear sessions
    for (const token of Object.keys(sessions)) {
      if (sessions[token].userId === deletedUser.id) {
        delete sessions[token];
      }
    }
    saveJSON(SESSIONS_FILE, sessions);

    return {
      success: true,
      message: `ลบบัญชีผู้ใช้ "${deletedUser.username}" เรียบร้อยแล้ว`
    };
  }

  /**
   * Admin: Wipe all users and sessions completely
   */
  static adminWipeAllUsers() {
    users = {};
    sessions = {};
    resetRequests = [];
    activeOtps = {};
    saveJSON(USERS_FILE, users);
    saveJSON(SESSIONS_FILE, sessions);
    saveJSON(RESET_REQUESTS_FILE, resetRequests);
    return {
      success: true,
      message: 'ลบข้อมูลผู้ใช้และเซสชันทั้งหมดเรียบร้อยแล้ว ทุกคนต้องสมัครสมาชิกใหม่'
    };
  }

  /**
   * Admin: Get all recorded matches
   */
  static getAllGames(limit = 200) {
    return games.slice(0, limit).map(g => ({
      id: g.id,
      date: g.date,
      size: g.size,
      isBotGame: !!g.isBotGame,
      botLevel: g.botLevel,
      blackPlayer: g.blackPlayer,
      whitePlayer: g.whitePlayer,
      winner: g.winner,
      winReason: g.winReason,
      totalMoves: (g.moves || []).length,
      captures: g.captures
    }));
  }

  /**
   * Admin: Get full game by ID (no restriction)
   */
  static getGameByIdAdmin(gameId) {
    return games.find(g => g.id === gameId) || null;
  }

  /**
   * Admin: Clear mock test data created during automated tests
   */
  static cleanTestData() {
    let removedCount = 0;
    for (const key of Object.keys(users)) {
      if (/^(pro_\d+|chal_\d+|admintest_\d+|test_)/i.test(key)) {
        delete users[key];
        removedCount++;
      }
    }
    saveJSON(USERS_FILE, users);

    games = games.filter(g => {
      const bName = g.blackPlayer?.name || '';
      const wName = g.whitePlayer?.name || '';
      return !(/^(pro_\d+|chal_\d+|admintest_\d+|test_)/i.test(bName) || /^(pro_\d+|chal_\d+|admintest_\d+|test_)/i.test(wName));
    });
    saveJSON(GAMES_FILE, games);

    return {
      success: true,
      message: `ล้างบัญชีและประวัติเกมทดสอบเรียบร้อยแล้ว (${removedCount} บัญชี)`,
      removedCount
    };
  }

  /**
   * Raw user dictionary for backup and cloud persistence
   */
  static exportRawUsers() {
    return JSON.parse(JSON.stringify(users));
  }

  /**
   * Restore or merge raw user dictionary into database
   */
  static importRawUsers(rawUsers, overwrite = false) {
    if (!rawUsers || typeof rawUsers !== 'object') {
      return { success: false, message: 'ข้อมูลผู้ใช้ไม่ถูกต้อง' };
    }
    const count = Object.keys(rawUsers).length;
    if (overwrite) {
      users = Object.assign({}, rawUsers);
    } else {
      users = Object.assign({}, users, rawUsers);
    }
    saveJSON(USERS_FILE, users);
    Database.syncToCloud(true);
    return {
      success: true,
      message: `กู้คืนข้อมูลผู้ใช้สำเร็จเรียบร้อย (${count} บัญชี)`,
      totalUsers: Object.keys(users).length
    };
  }

  /**
   * Push current database to Google Cloud Webhook
   */
  static syncToCloud(immediate = false) {
    if (immediate) {
      if (cloudSyncTimeout) clearTimeout(cloudSyncTimeout);
      doCloudSync();
    } else {
      if (cloudSyncTimeout) clearTimeout(cloudSyncTimeout);
      cloudSyncTimeout = setTimeout(doCloudSync, 1500);
    }
  }

  /**
   * Load and restore users from Google Cloud Webhook
   */
  static async loadFromCloud() {
    return new Promise((resolve) => {
      try {
        const webhookUrl = process.env.GMAIL_WEBHOOK_URL || process.env.DATABASE_WEBHOOK_URL || DEFAULT_CLOUD_WEBHOOK;
        if (!webhookUrl) return resolve({ success: false, message: 'ไม่มี Webhook URL' });

        const followGet = (targetUrl) => {
          try {
            const parsed = new URL(targetUrl);
            const req = https.request({
              hostname: parsed.hostname,
              path: parsed.pathname + (parsed.search ? parsed.search : '') + (parsed.search ? '&' : '?') + 'action=load_db',
              method: 'GET',
              headers: { 'User-Agent': 'OnlineGo-Server/2.0' },
              timeout: 6000
            }, (res) => {
              if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                return followGet(res.headers.location);
              }
              let data = '';
              res.on('data', c => data += c);
              res.on('end', () => {
                try {
                  const parsedData = JSON.parse(data);
                  if (parsedData && typeof parsedData === 'object' && !parsedData.error) {
                    const cloudUsers = parsedData.users || parsedData;
                    if (cloudUsers && typeof cloudUsers === 'object' && Object.keys(cloudUsers).length > 0) {
                      users = Object.assign({}, users, cloudUsers);
                      saveJSON(USERS_FILE, users);
                      console.log(`[CloudDB] ✅ Synced and restored ${Object.keys(cloudUsers).length} users from Google Cloud Webhook!`);
                    }
                    if (parsedData.friends && typeof parsedData.friends === 'object') {
                      friendsData = Object.assign({}, friendsData, parsedData.friends);
                      saveJSON(FRIENDS_FILE, friendsData);
                    }
                    return resolve({ success: true, count: Object.keys(cloudUsers || {}).length });
                  }
                  resolve({ success: false, message: 'ไม่มีข้อมูลในคลาวด์ หรือรูปแบบไม่ถูกต้อง' });
                } catch (e) {
                  resolve({ success: false, message: 'ไม่สามารถแปลงข้อมูล JSON จากคลาวด์' });
                }
              });
            });

            req.on('error', (err) => resolve({ success: false, message: err.message }));
            req.on('timeout', () => { req.destroy(); resolve({ success: false, message: 'หมดเวลาเชื่อมต่อ (Timeout)' }); });
            req.end();
          } catch (err) {
            resolve({ success: false, message: err.message });
          }
        };

        followGet(webhookUrl);
      } catch (err) {
        resolve({ success: false, message: err.message });
      }
    });
  }
}

// ─────────────────────────────────────────────
// FRIENDS SYSTEM
// ─────────────────────────────────────────────

function getFriendRecord(userId) {
  if (!friendsData[userId]) {
    friendsData[userId] = { friends: [], pendingOut: [], pendingIn: [] };
  }
  return friendsData[userId];
}

// Normalize Thai characters by stripping tone marks and diacritics (e.g. ไม้เอก ไม้โท ไม้ตรี ไม้จัตวา การันต์)
function normalizeThai(str) {
  return (str || '')
    .trim()
    .toLowerCase()
    .replace(/[\u0E48-\u0E4E]/g, '');
}

// Attach friends methods to Database class (after class definition)
Database.searchUsers = function(query, selfId) {
  const rawQ = (query || '').trim().toLowerCase();
  const normQ = normalizeThai(query);
  if (!rawQ || normQ.length < 1) return [];

  return Object.values(users)
    .filter(u => {
      if (u.id === selfId) return false;
      const uname = (u.username || '').toLowerCase();
      const normUname = normalizeThai(uname);
      // Match exact substring OR normalized substring (ignoring tone marks)
      return uname.includes(rawQ) || normUname.includes(normQ);
    })
    .slice(0, 10)
    .map(u => ({ id: u.id, username: u.username }));
};

Database.sendFriendRequest = function(fromId, toId) {
  if (!fromId || !toId || fromId === toId) return { success: false, message: 'ข้อมูลไม่ถูกต้อง' };
  const toUser = Object.values(users).find(u => u.id === toId);
  if (!toUser) return { success: false, message: 'ไม่พบผู้ใช้นี้' };
  const from = getFriendRecord(fromId);
  const to = getFriendRecord(toId);
  if (from.friends.includes(toId)) return { success: false, message: 'เป็นเพื่อนกันอยู่แล้ว' };
  if (from.pendingOut.includes(toId)) return { success: false, message: 'ส่งคำขอไปแล้ว กรุณารอการตอบรับ' };
  // If the other already sent a request, auto-accept
  if (from.pendingIn.includes(toId)) {
    return Database.acceptFriendRequest(fromId, toId);
  }
  from.pendingOut.push(toId);
  to.pendingIn.push(fromId);
  saveJSON(FRIENDS_FILE, friendsData);
  return { success: true, message: `ส่งคำขอเป็นเพื่อนให้ ${toUser.username} แล้ว`, toUserId: toId, toUsername: toUser.username };
};

Database.acceptFriendRequest = function(selfId, fromId) {
  const self = getFriendRecord(selfId);
  const from = getFriendRecord(fromId);
  if (!self.pendingIn.includes(fromId)) return { success: false, message: 'ไม่มีคำขอเป็นเพื่อนจากผู้ใช้นี้' };
  // Add each other as friends
  if (!self.friends.includes(fromId)) self.friends.push(fromId);
  if (!from.friends.includes(selfId)) from.friends.push(selfId);
  // Remove pending entries
  self.pendingIn = self.pendingIn.filter(id => id !== fromId);
  from.pendingOut = from.pendingOut.filter(id => id !== selfId);
  saveJSON(FRIENDS_FILE, friendsData);
  const fromUser = Object.values(users).find(u => u.id === fromId);
  return { success: true, message: `ยืนยันเป็นเพื่อนกับ ${fromUser ? fromUser.username : fromId} แล้ว`, fromUserId: fromId, fromUsername: fromUser ? fromUser.username : fromId };
};

Database.rejectFriendRequest = function(selfId, fromId) {
  const self = getFriendRecord(selfId);
  const from = getFriendRecord(fromId);
  self.pendingIn = self.pendingIn.filter(id => id !== fromId);
  from.pendingOut = from.pendingOut.filter(id => id !== selfId);
  saveJSON(FRIENDS_FILE, friendsData);
  return { success: true };
};

Database.removeFriend = function(selfId, friendId) {
  const self = getFriendRecord(selfId);
  const friend = getFriendRecord(friendId);
  self.friends = self.friends.filter(id => id !== friendId);
  friend.friends = friend.friends.filter(id => id !== selfId);
  saveJSON(FRIENDS_FILE, friendsData);
  return { success: true };
};

Database.getFriends = function(userId) {
  const record = getFriendRecord(userId);
  const resolveUser = (id) => {
    const u = Object.values(users).find(u => u.id === id);
    return u ? { id: u.id, username: u.username } : { id, username: id };
  };
  return {
    friends: record.friends.map(resolveUser),
    pendingIn: record.pendingIn.map(resolveUser),
    pendingOut: record.pendingOut.map(resolveUser)
  };
};


// Sync friends to Google Apps Script cloud property
function doFriendsCloudSync() {
  try {
    const webhookUrl = process.env.GMAIL_WEBHOOK_URL || process.env.DATABASE_WEBHOOK_URL || DEFAULT_CLOUD_WEBHOOK;
    if (!webhookUrl) return;

    const payload = JSON.stringify({
      action: 'save_friends',
      friends: friendsData,
      timestamp: Date.now()
    });

    const parsed = new URL(webhookUrl);
    const req = https.request({
      hostname: parsed.hostname,
      path: parsed.pathname + (parsed.search || ''),
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
        'User-Agent': 'OnlineGo-Server/2.0'
      },
      timeout: 8000
    }, (res) => {
      res.resume();
    });

    req.on('error', () => {});
    req.on('timeout', () => req.destroy());
    req.write(payload);
    req.end();
  } catch (err) {}
}

let friendsSyncTimeout = null;
function syncFriendsToCloud() {
  if (friendsSyncTimeout) clearTimeout(friendsSyncTimeout);
  friendsSyncTimeout = setTimeout(doFriendsCloudSync, 1500);
}

// Auto-sync from cloud on startup
setTimeout(() => {
  Database.loadFromCloud().catch(() => {});
}, 1500);

module.exports = Database;
