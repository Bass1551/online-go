const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const os = require('os');
const fs = require('fs');

// Automatically load .env if present
const envPath = path.join(__dirname, '..', '.env');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf8');
  envContent.split('\n').forEach(line => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return;
    const [k, ...v] = trimmed.split('=');
    if (k && v.length > 0 && !process.env[k.trim()]) {
      process.env[k.trim()] = v.join('=').trim().replace(/^["']|["']$/g, '');
    }
  });
}

const GoGame = require('./goEngine');
const { GoBot, analyzeCapture, evaluateQuizExplanation, getBotTauntAndComfort } = require('./botEngine');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

const PORT = process.env.PORT || 3000;

const Database = require('./db');
const EmailService = require('./emailService');
const QuoteDatabase = require('./quoteDb');
const QuoteStatsDb = require('./quoteStatsDb');
const QuoteGameEngine = require('./quoteEngine');
const quoteEngine = new QuoteGameEngine(io);

// Initialize persistent stats database
QuoteStatsDb.init().catch(err => {
  console.error('[QuoteStatsDb] Startup initialization error:', err);
});

function maskEmail(email) {
  if (!email || !email.includes('@')) return email || '';
  const [name, domain] = email.split('@');
  if (name.length <= 2) return `${name[0]}*@${domain}`;
  return `${name.slice(0, 2)}${'*'.repeat(Math.min(5, name.length - 2))}@${domain}`;
}

// Enable JSON body parsing for API with 50mb limit for audio uploads
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));


// Serve static frontend files
app.use(express.static(path.join(__dirname, '..', 'public')));

// Auth Helper
function getAuthUser(req) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
  const token = authHeader.slice(7).trim();
  return Database.verifyToken(token);
}

// REST API Endpoints
app.post('/api/register', (req, res) => {
  const { username, password, recoveryPin, email } = req.body || {};
  const result = Database.register(username, password, recoveryPin, email);
  if (!result.success) {
    return res.status(400).json(result);
  }
  io.emit('admin_event', { type: 'user_registered', user: result.user });
  res.json(result);
});

// Request 6-digit OTP via Email (Gmail)
app.post('/api/auth/send-email-otp', async (req, res) => {
  const { identifier } = req.body || {};
  const cleanId = (identifier || '').trim();
  if (!cleanId) {
    return res.status(400).json({ success: false, message: 'กรุณากรอกชื่อผู้ใช้หรืออีเมล (Gmail)' });
  }

  const otpResult = Database.createEmailOtp(cleanId);
  if (!otpResult.success) {
    return res.status(400).json(otpResult);
  }

  const sendResult = await EmailService.sendPasswordResetOtp(otpResult.user.email, otpResult.user.username, otpResult.code);
  if (!sendResult.success) {
    return res.status(500).json(sendResult);
  }

  io.emit('admin_event', { type: 'email_otp_requested', username: otpResult.user.username });

  res.json({
    success: true,
    message: sendResult.message,
    emailMasked: maskEmail(otpResult.user.email),
    username: otpResult.user.username
  });
});

// Self-service reset password using 6-digit OTP (from Email or Admin)
app.post('/api/auth/reset-with-otp', (req, res) => {
  const { identifier, otp, newPassword } = req.body || {};
  const result = Database.verifyOtpAndResetPassword(identifier, otp, newPassword);
  if (!result.success) {
    return res.status(400).json(result);
  }
  io.emit('admin_event', { type: 'user_password_reset', identifier });
  res.json(result);
});

// Self-service reset password using 4-digit PIN
app.post('/api/auth/reset-with-pin', (req, res) => {
  const { username, pin, newPassword } = req.body || {};
  const result = Database.resetPasswordWithPin(username, pin, newPassword);
  if (!result.success) {
    return res.status(400).json(result);
  }
  io.emit('admin_event', { type: 'user_password_reset', username });
  res.json(result);
});

// Submit password reset request to Admin
app.post('/api/auth/request-reset', (req, res) => {
  const { username, note } = req.body || {};
  const result = Database.createResetRequest(username, note);
  if (!result.success) {
    return res.status(400).json(result);
  }
  io.emit('admin_event', { type: 'new_reset_request', username });
  res.json(result);
});

// Set or update recovery PIN for authenticated user
app.post('/api/auth/set-pin', (req, res) => {
  const user = getAuthUser(req);
  if (!user) return res.status(401).json({ success: false, message: 'Unauthorized' });
  const { pin } = req.body || {};
  const result = Database.setRecoveryPin(user.id, pin);
  if (!result.success) return res.status(400).json(result);
  io.emit('admin_event', { type: 'user_pin_updated', username: user.username });
  res.json(result);
});

// Set or update Email for authenticated user
app.post('/api/auth/set-email', (req, res) => {
  const user = getAuthUser(req);
  if (!user) return res.status(401).json({ success: false, message: 'Unauthorized' });
  const { email } = req.body || {};
  const result = Database.setEmail(user.id, email);
  if (!result.success) return res.status(400).json(result);
  io.emit('admin_event', { type: 'user_email_updated', username: user.username });
  res.json(result);
});

app.post('/api/login', (req, res) => {
  const { username, password } = req.body || {};
  const result = Database.login(username, password);
  if (!result.success) {
    return res.status(401).json(result);
  }
  io.emit('admin_event', { type: 'user_login', user: result.user });
  res.json(result);
});

app.get('/api/me', (req, res) => {
  const user = getAuthUser(req);
  if (!user) return res.status(401).json({ success: false, message: 'Unauthorized' });
  const stats = Database.getUserStats(user.id);
  res.json({ success: true, user, stats });
});

app.post('/api/logout', (req, res) => {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    Database.logout(authHeader.slice(7).trim());
  }
  res.json({ success: true });
});

app.get('/api/history', (req, res) => {
  const user = getAuthUser(req);
  if (!user) return res.status(401).json({ success: false, message: 'Unauthorized' });
  const games = Database.getUserGames(user.id);
  res.json({ success: true, games });
});

app.get('/api/games/:id', (req, res) => {
  const user = getAuthUser(req);
  if (!user) return res.status(401).json({ success: false, message: 'Unauthorized' });
  const game = Database.getGameById(req.params.id, user.id);
  if (!game) return res.status(404).json({ success: false, message: 'ไม่พบประวัติเกมนี้ หรือคุณไม่มีสิทธิ์เข้าถึง' });
  res.json({ success: true, game });
});

// ================= THAI QUOTE GAME API =================
app.get('/api/quote/categories', (req, res) => {
  const categories = QuoteDatabase.getCategoryList();
  const difficulties = QuoteDatabase.getDifficultyList();
  res.json({ success: true, categories, difficulties });
});

app.get('/api/quote/user/stats', async (req, res) => {
  try {
    const authUser = getAuthUser(req);
    const userId = (req.query.userId || (authUser ? authUser.username : '') || '').trim();
    if (!userId) {
      return res.json({
        success: true,
        stats: {
          completedRounds: 0,
          highScore: 0,
          avgScore: 0,
          totalAnswered: 0,
          totalCorrect: 0,
          totalCorrectTime: 0,
          avgAnswerTime: 0,
          bestCategory: null,
          multiplayerWins: 0,
          podiumFirst: 0,
          podiumSecond: 0,
          podiumThird: 0
        }
      });
    }
    const stats = await QuoteStatsDb.getUserStats(userId);
    res.json({ success: true, stats });
  } catch (err) {
    console.error('Error fetching quote user stats:', err);
    res.status(500).json({ success: false, message: 'Failed to fetch user stats' });
  }
});

app.post('/api/quote/single/start', async (req, res) => {
  try {
    const { category = 'all', difficulty = 'mixed' } = req.body || {};
    const authUser = getAuthUser(req);
    const userId = ((req.body && req.body.userId) || (authUser ? authUser.username : null) || ('guest_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5))).trim();

    const categories = QuoteDatabase.getCategoryList();
    const catItem = categories.find(c => c.id === category);
    if (category !== 'all' && catItem && !catItem.isUnlocked) {
      return res.status(400).json({
        success: false,
        message: `หมวด "${catItem.name}" มีคำถามที่พร้อมเล่นจริง ${catItem.count}/10 ข้อ (ยังไม่เปิดให้เล่นจนกว่าจะมีคลิปครบ 10 ข้อตามกติกา)`
      });
    }

    const difficulties = QuoteDatabase.getDifficultyList();
    const diffItem = difficulties.find(d => d.id === difficulty);
    if (difficulty !== 'mixed' && diffItem && !diffItem.isUnlocked) {
      return res.status(400).json({
        success: false,
        message: `ระดับความยากนี้มีคำถามที่พร้อมเล่นจริง ${diffItem.count}/10 ข้อ (ยังไม่เปิดให้เล่นจนกว่าจะมีคลิปครบ 10 ข้อตามกติกา)`
      });
    }

    const selectedQuestions = QuoteDatabase.selectRoundQuestions(category, difficulty);
    if (!selectedQuestions || selectedQuestions.length < 10) {
      return res.status(400).json({
        success: false,
        message: 'มีคำถามที่พร้อมเล่นจริงไม่ครบ 10 ข้อสำหรับรอบนี้ กรุณาเลือกหมวด "รวมทุกประเภท"'
      });
    }

    const roundId = 'rnd_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);
    await QuoteStatsDb.createRound({
      roundId,
      userId,
      username: userId,
      mode: 'single',
      category,
      difficulty,
      totalQuestions: selectedQuestions.length,
      startedAt: Date.now()
    });

    const clientQuestions = selectedQuestions.map(q => QuoteDatabase.formatQuestionForClient(q, true));
    res.json({
      success: true,
      roundId,
      userId,
      totalQuestions: clientQuestions.length,
      questions: clientQuestions
    });
  } catch (err) {
    console.error('Error starting single quote game:', err);
    res.status(500).json({ success: false, message: 'Failed to start game' });
  }
});

app.post('/api/quote/single/answer', async (req, res) => {
  try {
    const { roundId, userId, questionId, choiceId, selectedOption, answerTimeMs, clientDeadline } = req.body || {};
    if (!questionId) return res.status(400).json({ success: false, message: 'Missing questionId' });

    const chosen = choiceId || selectedOption;
    const now = Date.now();
    const verification = QuoteDatabase.verifyAnswer(questionId, chosen, now, clientDeadline);

    let recorded = true;
    let isDuplicate = false;

    if (roundId && userId) {
      const rec = await QuoteStatsDb.recordAnswer({
        roundId,
        userId,
        questionId,
        choiceId: verification.choiceId || chosen,
        isCorrect: verification.isCorrect,
        responseTimeMs: Math.round(Number(answerTimeMs) || 0),
        serverTimestamp: now,
        isLate: verification.isLate || false
      });
      recorded = rec.recorded;
      isDuplicate = rec.isDuplicate;
    }

    res.json({
      ...verification,
      recorded,
      isDuplicate
    });
  } catch (err) {
    console.error('Error recording answer:', err);
    res.status(500).json({ success: false, message: 'Failed to record answer' });
  }
});

app.post('/api/quote/single/finish', async (req, res) => {
  try {
    const { roundId, userId, score = 0, totalCorrectTimeMs = 0, categoryBreakdown = {} } = req.body || {};
    QuoteDatabase.recordRoundCompleted();

    if (roundId && userId) {
      const finishRes = await QuoteStatsDb.finishRound({
        roundId,
        userId,
        score: Number(score) || 0,
        totalCorrectTimeMs: Number(totalCorrectTimeMs) || 0,
        status: 'completed',
        rank: 1,
        totalPlayers: 1,
        finishedAt: Date.now(),
        categoryBreakdown
      });
      return res.json({ success: true, ...finishRes });
    }

    res.json({ success: true });
  } catch (err) {
    console.error('Error finishing single game:', err);
    res.status(500).json({ success: false, message: 'Failed to finish game' });
  }
});

app.post('/api/quote/single/abandon', async (req, res) => {
  try {
    const { roundId, userId } = req.body || {};
    if (roundId && userId) {
      await QuoteStatsDb.abandonRound(roundId, userId);
    }
    res.json({ success: true });
  } catch (err) {
    console.error('Error abandoning single game:', err);
    res.status(500).json({ success: false, message: 'Failed to abandon game' });
  }
});

app.post('/api/quote/report', (req, res) => {
  const { questionId, reason, details } = req.body || {};
  if (!questionId || !reason) return res.status(400).json({ success: false, message: 'Missing fields' });
  const report = QuoteDatabase.addReport({ questionId, reason, details });
  res.json({ success: true, report });
});

app.get('/api/quote/admin/questions', (req, res) => {
  res.json({ success: true, questions: QuoteDatabase.getAllQuestions() });
});

app.post('/api/quote/admin/questions', (req, res) => {
  const newQ = QuoteDatabase.addQuestion(req.body);
  res.json({ success: true, question: newQ });
});

app.put('/api/quote/admin/questions/:id', (req, res) => {
  const updated = QuoteDatabase.updateQuestion(req.params.id, req.body);
  res.json({ success: !!updated, question: updated });
});

app.post('/api/quote/admin/upload-audio', (req, res) => {
  try {
    const { filename, fileBase64 } = req.body;
    if (!filename || !fileBase64) {
      return res.status(400).json({ success: false, message: 'กรุณาส่งไฟล์เสียง' });
    }
    const ext = path.extname(filename).toLowerCase() || '.mp3';
    if (!['.mp3', '.wav', '.ogg', '.m4a', '.mp4'].includes(ext)) {
      return res.status(400).json({ success: false, message: 'รองรับเฉพาะไฟล์เสียง .mp3, .wav, .m4a, .ogg หรือ .mp4' });
    }
    const safeName = 'quote_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5) + ext;
    const destDir = path.join(__dirname, '..', 'public', 'audio', 'quotes');
    if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });
    
    const destPath = path.join(destDir, safeName);
    const base64Data = fileBase64.replace(/^data:(audio|video)\/[a-z0-9-]+;base64,/, '');
    fs.writeFileSync(destPath, Buffer.from(base64Data, 'base64'));

    res.json({ success: true, audioUrl: '/audio/quotes/' + safeName, filename: safeName });
  } catch (err) {
    console.error('Audio upload error:', err);
    res.status(500).json({ success: false, message: 'Upload failed: ' + err.message });
  }
});

app.delete('/api/quote/admin/questions/:id', (req, res) => {
  const deleted = QuoteDatabase.deleteQuestion(req.params.id);
  res.json({ success: deleted });
});

app.get('/api/quote/admin/reports', (req, res) => {
  res.json({ success: true, reports: QuoteDatabase.getReports() });
});

// ================= ADMIN BACKOFFICE API =================
const ADMIN_MASTER_KEY = process.env.ADMIN_SECRET_KEY || 'admin_go_secret_2026';

function verifyAdmin(req, res, next) {
  const key = req.headers['x-admin-key'] || req.query.admin_key || (req.body && req.body.adminKey);
  if (!key || key !== ADMIN_MASTER_KEY) {
    return res.status(403).json({ success: false, message: 'การเข้าถึงถูกปฏิเสธ: ต้องใช้ Master Admin Key ที่ถูกต้อง' });
  }
  next();
}

// Admin login verification
app.post('/api/admin/login', (req, res) => {
  const { adminKey } = req.body || {};
  if (adminKey === ADMIN_MASTER_KEY) {
    return res.json({ success: true, message: 'ยืนยันตัวตนผู้ดูแลระบบสำเร็จ' });
  }
  return res.status(403).json({ success: false, message: 'Master Admin Key ไม่ถูกต้อง' });
});

// Admin System Overview Stats
app.get('/api/admin/stats', verifyAdmin, (req, res) => {
  const users = Database.getAllUsers();
  const games = Database.getAllGames(1000);
  const mem = process.memoryUsage();
  res.json({
    success: true,
    stats: {
      totalUsers: users.length,
      activeRooms: rooms.size,
      totalGames: games.length,
      uptimeSeconds: Math.floor(process.uptime()),
      memoryUsageMB: {
        rss: Math.round(mem.rss / 1024 / 1024),
        heapUsed: Math.round(mem.heapUsed / 1024 / 1024),
        heapTotal: Math.round(mem.heapTotal / 1024 / 1024)
      },
      nodeVersion: process.version,
      platform: `${os.type()} ${os.release()} (${os.arch()})`,
      serverTime: new Date().toISOString()
    }
  });
});

// Admin User Management
app.get('/api/admin/users', verifyAdmin, (req, res) => {
  const users = Database.getAllUsers();
  res.json({ success: true, users });
});

app.post('/api/admin/users/reset-password', verifyAdmin, (req, res) => {
  const { target, newPassword } = req.body || {};
  const result = Database.adminResetPassword(target, newPassword);
  if (!result.success) {
    return res.status(400).json(result);
  }
  io.emit('admin_event', { type: 'password_reset', target });
  res.json(result);
});

app.delete('/api/admin/users/:id', verifyAdmin, (req, res) => {
  const result = Database.adminDeleteUser(req.params.id);
  if (!result.success) {
    return res.status(400).json(result);
  }
  io.emit('admin_event', { type: 'user_deleted', id: req.params.id });
  res.json(result);
});

app.post('/api/admin/users/wipe-all', verifyAdmin, (req, res) => {
  const result = Database.adminWipeAllUsers();
  io.emit('admin_event', { type: 'all_users_wiped' });
  res.json(result);
});

app.post('/api/admin/clean-test-data', verifyAdmin, (req, res) => {
  const result = Database.cleanTestData();
  io.emit('admin_event', { type: 'test_data_cleaned' });
  res.json(result);
});

// Admin Database Backup & Export
app.get('/api/admin/export-db', verifyAdmin, (req, res) => {
  const rawUsers = Database.exportRawUsers();
  res.json({
    success: true,
    users: rawUsers,
    totalCount: Object.keys(rawUsers).length,
    exportedAt: new Date().toISOString()
  });
});

app.get('/api/admin/download-backup', verifyAdmin, (req, res) => {
  const rawUsers = Database.exportRawUsers();
  const dateStr = new Date().toISOString().replace(/[:.]/g, '-');
  res.setHeader('Content-Disposition', `attachment; filename="online_go_users_${dateStr}.json"`);
  res.setHeader('Content-Type', 'application/json');
  res.send(JSON.stringify(rawUsers, null, 2));
});

app.post('/api/admin/restore-db', verifyAdmin, (req, res) => {
  const { users: rawUsers, overwrite } = req.body || {};
  if (!rawUsers || typeof rawUsers !== 'object') {
    return res.status(400).json({ success: false, message: 'ข้อมูล JSON ไม่ถูกต้อง' });
  }
  const result = Database.importRawUsers(rawUsers, !!overwrite);
  io.emit('admin_event', { type: 'database_restored' });
  res.json(result);
});

app.post('/api/admin/sync-cloud', verifyAdmin, async (req, res) => {
  const loadResult = await Database.loadFromCloud();
  if (loadResult.success) {
    io.emit('admin_event', { type: 'database_restored' });
    return res.json({
      success: true,
      message: `ดึงข้อมูลจาก Google Cloud สำเร็จ (${loadResult.count} บัญชี)`,
      count: loadResult.count
    });
  }
  // If loading failed, trigger push to cloud
  Database.syncToCloud(true);
  res.json({
    success: true,
    message: 'ส่งข้อมูลผู้ใช้ปัจจุบันไปบันทึกบน Google Cloud สำเร็จเรียบร้อยแล้ว'
  });
});

// Admin Live Rooms
app.get('/api/admin/rooms', verifyAdmin, (req, res) => {
  const liveRooms = [];
  rooms.forEach((room, id) => {
    liveRooms.push({
      id: room.id,
      size: room.size,
      timeLimit: room.timeLimit,
      isBotGame: !!room.isBotGame,
      botLevel: room.botLevel || null,
      black: room.black ? { name: room.black.name, connected: room.black.connected } : null,
      white: room.white ? { name: room.white.name, connected: room.white.connected } : null,
      spectatorCount: room.spectators ? room.spectators.length : 0,
      spectators: (room.spectators || []).map(s => s.name),
      moveCount: room.game ? room.game.history.length : 0,
      currentTurn: room.game ? room.game.currentTurn : 1,
      isGameOver: room.game ? room.game.isGameOver : false,
      captures: room.game ? room.game.captures : { 1: 0, 2: 0 },
      createdAt: room.createdAt || null
    });
  });
  res.json({ success: true, rooms: liveRooms });
});

app.delete('/api/admin/rooms/:id', verifyAdmin, (req, res) => {
  const roomId = req.params.id;
  const room = rooms.get(roomId);
  if (!room) {
    return res.status(404).json({ success: false, message: 'ไม่พบห้องที่ระบุ' });
  }
  io.to(roomId).emit('room_updated', {
    announcement: '⚠️ ห้องนี้ถูกปิดโดยผู้ดูแลระบบ (Admin Force Close)'
  });
  rooms.delete(roomId);
  res.json({ success: true, message: `ปิดห้อง ${roomId} สำเร็จเรียบร้อยแล้ว` });
});

// Admin All Match History
app.get('/api/admin/games', verifyAdmin, (req, res) => {
  const limit = parseInt(req.query.limit) || 200;
  const games = Database.getAllGames(limit);
  res.json({ success: true, games });
});

app.get('/api/admin/games/:id', verifyAdmin, (req, res) => {
  const game = Database.getGameByIdAdmin(req.params.id);
  if (!game) {
    return res.status(404).json({ success: false, message: 'ไม่พบข้อมูลเกมนี้' });
  }
  res.json({ success: true, game });
});

// Admin Password Reset Requests Management
app.get('/api/admin/reset-requests', verifyAdmin, (req, res) => {
  res.json({ success: true, requests: Database.getResetRequests() });
});

app.post('/api/admin/reset-requests/:id/resolve', verifyAdmin, (req, res) => {
  const { id } = req.params;
  const { newPassword } = req.body || {};
  const result = Database.adminResolveResetRequest(id, newPassword);
  if (!result.success) return res.status(400).json(result);
  io.emit('admin_event', { type: 'reset_request_resolved', id });
  res.json(result);
});

app.post('/api/admin/reset-requests/:id/generate-code', verifyAdmin, (req, res) => {
  const { id } = req.params;
  const result = Database.adminGenerateResetCode(id);
  if (!result.success) return res.status(400).json(result);
  io.emit('admin_event', { type: 'reset_request_resolved', id });
  res.json(result);
});

app.delete('/api/admin/reset-requests/:id', verifyAdmin, (req, res) => {
  const { id } = req.params;
  const result = Database.adminDeleteResetRequest(id);
  if (!result.success) return res.status(400).json(result);
  io.emit('admin_event', { type: 'reset_request_deleted', id });
  res.json(result);
});

let activeBroadcast = null;

// Admin System Broadcast to all connected clients
app.post('/api/admin/broadcast', verifyAdmin, (req, res) => {
  const { message, duration = 60 } = req.body || {};
  if (!message || !message.trim()) {
    return res.status(400).json({ success: false, message: 'กรุณาระบุข้อความประกาศ' });
  }

  const durationSec = Math.max(0, parseInt(duration, 10) || 0);
  const expiresAt = durationSec > 0 ? Date.now() + durationSec * 1000 : null;

  activeBroadcast = {
    message: message.trim(),
    duration: durationSec,
    timestamp: Date.now(),
    expiresAt
  };

  io.emit('system_announcement', activeBroadcast);
  res.json({
    success: true,
    message: `ส่งข้อความประกาศขึ้นแถบวิ่งเรียบร้อยแล้ว (${durationSec > 0 ? `แสดงผล ${durationSec} วินาที` : 'แสดงผลค้างไว้ตลอด'})`,
    broadcast: activeBroadcast
  });
});

app.post('/api/admin/broadcast/clear', verifyAdmin, (req, res) => {
  activeBroadcast = null;
  io.emit('system_announcement_clear');
  res.json({ success: true, message: 'ล้างและปิดแถบประกาศทั้งหมดเรียบร้อยแล้ว' });
});

app.get('/api/broadcast/current', (req, res) => {
  if (activeBroadcast && activeBroadcast.expiresAt && Date.now() > activeBroadcast.expiresAt) {
    activeBroadcast = null;
  }
  res.json({ success: true, broadcast: activeBroadcast });
});

// Admin Page Route
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'admin.html'));
});

// Store active rooms in memory
// Key: roomId, Value: Room object
const rooms = new Map();

// Track online users for friend presence: userId -> socketId
const onlineUsers = new Map();

function generateRoomId() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let id = '';
  for (let i = 0; i < 6; i++) {
    id += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return id;
}

function getLocalIp() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return 'localhost';
}

function getSanitizedRoomState(room) {
  return {
    id: room.id,
    size: room.size,
    timeLimit: room.timeLimit,
    isBotGame: !!room.isBotGame,
    botLevel: room.botLevel || null,
    botLevelName: room.botLevel ? GoBot.LEVEL_NAMES[room.botLevel] : null,
    black: room.black ? { name: room.black.name, connected: room.black.connected, isBot: !!room.black.isBot } : null,
    white: room.white ? { name: room.white.name, connected: room.white.connected, isBot: !!room.white.isBot } : null,
    spectatorCount: room.spectators.length,
    game: room.game.getState(),
    timers: room.timers,
    undoPending: room.undoPending ? { fromColor: room.undoPending.fromColor } : null
  };
}

function saveCompletedGame(room, winner, winReason, scoreResult) {
  if (!room || room._saved) return;
  room._saved = true;

  const userIds = [];
  if (room.black && room.black.userId) userIds.push(room.black.userId);
  if (room.white && room.white.userId) userIds.push(room.white.userId);

  // Save if at least one player is registered
  if (userIds.length > 0) {
    const blackName = room.black?.name || 'หมากดำ';
    const whiteName = room.white?.name || (room.isBotGame ? `AI ${GoBot.LEVEL_NAMES[room.botLevel] || 'บอท'}` : 'หมากขาว');

    Database.saveGame({
      roomId: room.id,
      size: room.size,
      isBotGame: !!room.isBotGame,
      botLevel: room.botLevel || null,
      blackPlayer: { name: blackName, userId: room.black?.userId || null },
      whitePlayer: { name: whiteName, userId: room.white?.userId || null },
      winner,
      winReason: winReason || '',
      scoreResult: scoreResult || null,
      moves: room.game.moveHistory || [],
      captures: room.game.captures || { 1: 0, 2: 0 },
      userIds
    });
    io.emit('admin_event', { type: 'game_completed', roomId: room.id });
  }
}

// Timer tick management
setInterval(() => {
  const now = Date.now();
  for (const [roomId, room] of rooms.entries()) {
    if (!room.timeLimit || room.timeLimit <= 0 || room.game.isGameOver) continue;
    if (!room.black || !room.white || !room.black.connected || !room.white.connected) continue;

    const activeColor = room.game.turn; // 1 = Black, 2 = White
    if (room.lastTimerTick) {
      const elapsed = Math.floor((now - room.lastTimerTick) / 1000);
      if (elapsed >= 1) {
        room.timers[activeColor] = Math.max(0, room.timers[activeColor] - elapsed);
        room.lastTimerTick = now;

        if (room.timers[activeColor] <= 0) {
          // Timeout! Opponent wins
          const winner = activeColor === 1 ? 2 : 1;
          const timedOutColor = activeColor === 1 ? 'ดำ' : 'ขาว';
          const winningColor = winner === 1 ? 'ดำ' : 'ขาว';
          room.game.isGameOver = true;
          room.game.winner = winner;
          room.game.winReason = `หมาก${timedOutColor}เวลาหมด (หมาก${winningColor}ชนะ)`;
          
          saveCompletedGame(room, winner, room.game.winReason, null);

          let botTaunt = null;
          const currentBotColor = room.botColor || (room.black && room.black.isBot ? 1 : 2);
          if (room.isBotGame && winner === currentBotColor) {
            botTaunt = getBotTauntAndComfort({
              botLevel: room.botLevel || 1,
              winReason: room.game.winReason,
              isTimeout: true
            });
          }

          io.to(roomId).emit('game_over', {
            winner,
            winReason: room.game.winReason,
            scoreResult: null,
            room: getSanitizedRoomState(room),
            botTaunt
          });
        }

        io.to(roomId).emit('timer_update', { timers: room.timers });
      }
    } else {
      room.lastTimerTick = now;
    }

    // Bot Watchdog: Recover if bot turn gets stuck without a move
    const activeBotColor = room.botColor || (room.black && room.black.isBot ? 1 : 2);
    if (room.isBotGame && room.game.turn === activeBotColor && !room.game.isGameOver && !room.botThinking) {
      if (!room.lastBotTurnTime) {
        room.lastBotTurnTime = now;
      } else if (now - room.lastBotTurnTime > 3000) {
        // More than 3 seconds on bot's turn without action -> kickstart bot move!
        room.lastBotTurnTime = now;
        triggerBotMove(roomId);
      }
    } else {
      room.lastBotTurnTime = null;
    }
  }
}, 1000);

io.on('connection', (socket) => {
  let currentRoomId = null;
  let playerRole = null; // 1: Black, 2: White, 'spectator'
  let currentUser = null;

  // Verify auth token if provided during connection handshake
  if (socket.handshake.auth && socket.handshake.auth.token) {
    currentUser = Database.verifyToken(socket.handshake.auth.token);
  }

  function registerUserOnline(user) {
    if (!user) return;
    currentUser = user;
    socket.join(`user_${user.id}`);
    
    // Track in onlineUsers Map (store Set of socketIds for each user)
    if (!onlineUsers.has(user.id)) {
      onlineUsers.set(user.id, new Set());
    }
    const userSockets = onlineUsers.get(user.id);
    const wasOffline = userSockets.size === 0;
    userSockets.add(socket.id);

    if (wasOffline) {
      notifyFriendsOnlineStatus(user.id, true);
    }
  }

  // Allow client to authenticate session dynamically after connect
  socket.on('auth_session', ({ token }, callback) => {
    const user = Database.verifyToken(token);
    if (typeof callback === 'function') {
      callback({ success: !!user, user });
    }
    if (user) {
      registerUserOnline(user);
    }
  });

  // Register online presence if already authed at handshake
  if (currentUser) {
    registerUserOnline(currentUser);
  }

  function notifyFriendsOnlineStatus(userId, isOnline) {
    const data = Database.getFriends(userId);
    const user = currentUser || { id: userId, username: userId };
    for (const friend of data.friends) {
      io.to(`user_${friend.id}`).emit(isOnline ? 'friend_online' : 'friend_offline', {
        id: userId, username: user.username
      });
    }
  }

  // ── FRIENDS SYSTEM ──────────────────────────────────────
  socket.on('get_friends', (callback) => {
    if (!currentUser) return typeof callback === 'function' && callback({ success: false });
    const data = Database.getFriends(currentUser.id);
    // Enrich with online status (user is online if they have at least 1 active socket)
    data.friends = data.friends.map(f => {
      const sockSet = onlineUsers.get(f.id);
      return { ...f, online: !!(sockSet && sockSet.size > 0) };
    });
    if (typeof callback === 'function') callback({ success: true, ...data });
  });

  socket.on('friend_search', ({ query }, callback) => {
    if (!currentUser) return typeof callback === 'function' && callback({ success: false, results: [], searchedSelf: false });
    const searchRes = Database.searchUsers(query, currentUser.id);
    const results = Array.isArray(searchRes) ? searchRes : (searchRes.results || []);
    const searchedSelf = Array.isArray(searchRes) ? false : (searchRes.searchedSelf || false);
    if (typeof callback === 'function') callback({ success: true, results, searchedSelf });
  });

  socket.on('friend_request', ({ toId }, callback) => {
    if (!currentUser) return typeof callback === 'function' && callback({ success: false, message: 'กรุณาเข้าสู่ระบบ' });
    const result = Database.sendFriendRequest(currentUser.id, toId);
    if (result.success) {
      // 1. Notify the recipient room in real-time
      io.to(`user_${toId}`).emit('friend_request_received', {
        fromId: currentUser.id, fromUsername: currentUser.username
      });
      io.to(`user_${toId}`).emit('friend_request_updated');
      // 2. Notify the sender room so other tabs update outgoing list
      io.to(`user_${currentUser.id}`).emit('friend_request_updated');
    }
    if (typeof callback === 'function') callback(result);
  });

  socket.on('friend_accept', ({ fromId }, callback) => {
    if (!currentUser) return typeof callback === 'function' && callback({ success: false });
    const result = Database.acceptFriendRequest(currentUser.id, fromId);
    if (result.success) {
      // 1. Notify requester in real-time
      io.to(`user_${fromId}`).emit('friend_accepted', {
        byId: currentUser.id, byUsername: currentUser.username
      });
      // 2. Notify both users that requests/friends list changed
      io.to(`user_${fromId}`).emit('friend_request_updated');
      io.to(`user_${currentUser.id}`).emit('friend_request_updated');

      // 3. Notify requester that self is online
      io.to(`user_${fromId}`).emit('friend_online', { id: currentUser.id, username: currentUser.username });
      
      // 4. Notify self if requester is online
      const fromSocks = onlineUsers.get(fromId);
      if (fromSocks && fromSocks.size > 0) {
        socket.emit('friend_online', { id: fromId, username: result.fromUsername });
      }
    }
    if (typeof callback === 'function') callback(result);
  });

  socket.on('friend_reject', ({ fromId }, callback) => {
    if (!currentUser) return typeof callback === 'function' && callback({ success: false });
    const result = Database.rejectFriendRequest(currentUser.id, fromId);
    // Notify both users that pending request was updated
    io.to(`user_${fromId}`).emit('friend_request_updated');
    io.to(`user_${currentUser.id}`).emit('friend_request_updated');
    if (typeof callback === 'function') callback(result);
  });

  socket.on('friend_remove', ({ friendId }, callback) => {
    if (!currentUser) return typeof callback === 'function' && callback({ success: false });
    const result = Database.removeFriend(currentUser.id, friendId);
    if (result.success) {
      // Notify both parties to update friends list instantly across all tabs
      io.to(`user_${friendId}`).emit('friend_removed', { byId: currentUser.id });
      io.to(`user_${currentUser.id}`).emit('friend_removed', { byId: friendId });
    }
    if (typeof callback === 'function') callback(result);
  });

  // ── ROOM INVITE ──────────────────────────────────────────
  socket.on('room_invite', ({ friendId, roomId }, callback) => {
    if (!currentUser) return typeof callback === 'function' && callback({ success: false, message: 'กรุณาเข้าสู่ระบบก่อน' });
    const room = rooms.get(roomId);
    if (!room) return typeof callback === 'function' && callback({ success: false, message: 'ไม่พบห้องนี้' });
    if (room.white && room.black) return typeof callback === 'function' && callback({ success: false, message: 'ห้องเต็มแล้ว' });
    const friendSocks = onlineUsers.get(friendId);
    if (!friendSocks || friendSocks.size === 0) return typeof callback === 'function' && callback({ success: false, message: 'เพื่อนออฟไลน์อยู่' });

    io.to(`user_${friendId}`).emit('room_invite_received', {
      fromId: currentUser.id,
      fromUsername: currentUser.username,
      roomId,
      size: room.size,
      timeLimit: room.timeLimit
    });
    if (typeof callback === 'function') callback({ success: true, message: `ส่งคำเชิญให้เพื่อนแล้ว!` });
  });

  // ── THAI QUOTE GAME MULTIPLAYER EVENTS ───────────────────
  socket.on('quote_create_room', ({ hostName }, callback) => {
    const name = hostName || (currentUser ? currentUser.username : 'ผู้เล่น');
    const res = quoteEngine.createRoom(socket, name);
    if (typeof callback === 'function') callback(res);
  });

  socket.on('quote_join_room', ({ roomCode, username }, callback) => {
    const name = username || (currentUser ? currentUser.username : 'ผู้เล่น');
    const res = quoteEngine.joinRoom(roomCode, socket, name);
    if (typeof callback === 'function') callback(res);
  });

  socket.on('quote_reconnect', ({ roomCode, playerId, reconnectToken }, callback) => {
    const res = quoteEngine.reconnect(roomCode, playerId, reconnectToken, socket);
    if (typeof callback === 'function') callback(res);
  });

  socket.on('quote_toggle_ready', ({ roomCode, playerId }) => {
    quoteEngine.toggleReady(roomCode, playerId || socket.id);
  });

  socket.on('quote_update_room_settings', ({ roomCode, playerId, category, difficulty }) => {
    quoteEngine.updateSettings(roomCode, playerId || socket.id, { category, difficulty });
  });

  socket.on('quote_kick_player', ({ roomCode, playerId, targetPlayerId, targetSocketId }) => {
    quoteEngine.kickPlayer(roomCode, playerId || socket.id, targetPlayerId || targetSocketId);
  });

  socket.on('quote_start_game', ({ roomCode, playerId }, callback) => {
    const res = quoteEngine.startGame(roomCode, playerId || socket.id);
    if (typeof callback === 'function') callback(res);
  });

  socket.on('quote_submit_answer', ({ roomCode, playerId, choiceId, selectedOption, answerTimeMs }) => {
    const chosen = choiceId || selectedOption;
    quoteEngine.submitAnswer(roomCode, playerId || socket.id, chosen, answerTimeMs);
  });

  socket.on('quote_send_chat', ({ roomCode, playerId, message }) => {
    quoteEngine.sendChatMessage(roomCode, playerId || socket.id, message);
  });

  socket.on('quote_leave_room', ({ roomCode, playerId }) => {
    quoteEngine.leaveRoom(roomCode, playerId || socket.id);
  });

  socket.on('room_invite_accepted', ({ roomId }) => {
    if (!currentUser) return;
    const targetRoom = (roomId || '').trim().toUpperCase();
    const room = rooms.get(targetRoom);
    if (!room) {
      return socket.emit('join_error', { message: `ไม่พบห้อง "${targetRoom}" หรือห้องอาจถูกปิดไปแล้ว` });
    }
    const playerName = currentUser.username;
    // Join as player if slot available, otherwise spectator
    if (!room.white && room.black && room.black.socketId !== socket.id) {
      room.white = { socketId: socket.id, name: playerName, userId: currentUser.id, connected: true };
      playerRole = 2;
    } else if (!room.black && room.white && room.white.socketId !== socket.id) {
      room.black = { socketId: socket.id, name: playerName, userId: currentUser.id, connected: true };
      playerRole = 1;
    } else {
      room.spectators.push({ socketId: socket.id, name: playerName, isAdmin: false });
      playerRole = 'spectator';
    }

    currentRoomId = targetRoom;
    socket.join(targetRoom);

    socket.emit('room_joined', {
      roomId: targetRoom,
      role: playerRole,
      room: getSanitizedRoomState(room)
    });

    io.to(targetRoom).emit('room_updated', {
      room: getSanitizedRoomState(room),
      announcement: `${playerName} เข้าร่วมห้องเรียบร้อยแล้ว!`
    });
  });
  // ─────────────────────────────────────────────────────────

  // Send active broadcast if any
  if (activeBroadcast) {
    if (activeBroadcast.expiresAt && Date.now() > activeBroadcast.expiresAt) {
      activeBroadcast = null;
    } else {
      socket.emit('system_announcement', activeBroadcast);
    }
  }

  // Create Room (Human vs Human)
  socket.on('create_room', ({ size = 19, playerName = 'ผู้เล่น 1', timeLimit = 0 }) => {
    const validSize = [9, 13, 19].includes(Number(size)) ? Number(size) : 19;
    let roomId = generateRoomId();
    while (rooms.has(roomId)) {
      roomId = generateRoomId();
    }

    const game = new GoGame({ size: validSize });
    const initialTime = timeLimit > 0 ? timeLimit * 60 : 0;
    const resolvedName = currentUser ? currentUser.username : (playerName.trim() || 'ผู้เล่นสีดำ');

    const room = {
      id: roomId,
      size: validSize,
      timeLimit: initialTime,
      game,
      black: { socketId: socket.id, name: resolvedName, userId: currentUser ? currentUser.id : null, connected: true },
      white: null,
      spectators: [],
      timers: { 1: initialTime, 2: initialTime },
      lastTimerTick: null,
      undoPending: null,
      isBotGame: false
    };

    rooms.set(roomId, room);
    currentRoomId = roomId;
    playerRole = 1;
    io.emit('admin_event', { type: 'room_created', roomId });

    socket.join(roomId);
    socket.emit('room_created', {
      roomId,
      role: 1, // Black
      room: getSanitizedRoomState(room)
    });
  });

  // Start Bot Game (Single Player Training Mode)
  socket.on('start_bot_game', ({ size = 9, botLevel = 1, playerName = 'ผู้เล่น', timeLimit = 0, playerColor = 'black' }) => {
    const validSize = [9, 13, 19].includes(Number(size)) ? Number(size) : 9;
    const level = Math.max(1, Math.min(6, parseInt(botLevel, 10) || 1));
    const botName = `AI ${GoBot.LEVEL_NAMES[level] || 'บอท'}`;

    let roomId = generateRoomId();
    while (rooms.has(roomId)) {
      roomId = generateRoomId();
    }

    const game = new GoGame({ size: validSize });
    const bot = new GoBot(level, validSize);
    const initialTime = Number(timeLimit) > 0 ? Number(timeLimit) * 60 : 0;

    // Resolve chosen color (support 'black', 'white', or 'random' / 'nigiri')
    let assignedRole = 1; // 1 = Black, 2 = White
    if (playerColor === 'white') {
      assignedRole = 2;
    } else if (playerColor === 'random' || playerColor === 'nigiri') {
      assignedRole = Math.random() < 0.5 ? 1 : 2;
    }

    const resolvedName = currentUser ? currentUser.username : (playerName.trim() || `ผู้เล่น (${assignedRole === 1 ? 'หมากดำ' : 'หมากขาว'})`);

    const room = {
      id: roomId,
      size: validSize,
      timeLimit: initialTime,
      game,
      black: assignedRole === 1
        ? { socketId: socket.id, name: resolvedName, userId: currentUser ? currentUser.id : null, connected: true }
        : { socketId: 'bot', name: botName, connected: true, isBot: true, userId: null },
      white: assignedRole === 2
        ? { socketId: socket.id, name: resolvedName, userId: currentUser ? currentUser.id : null, connected: true }
        : { socketId: 'bot', name: botName, connected: true, isBot: true, userId: null },
      spectators: [],
      timers: { 1: initialTime, 2: initialTime },
      lastTimerTick: Number(timeLimit) > 0 ? Date.now() : null,
      undoPending: null,
      isBotGame: true,
      bot,
      botColor: assignedRole === 1 ? 2 : 1,
      botLevel: level,
      pendingQuiz: null
    };

    rooms.set(roomId, room);
    currentRoomId = roomId;
    playerRole = assignedRole;
    io.emit('admin_event', { type: 'room_created', roomId });

    socket.join(roomId);
    socket.emit('room_created', {
      roomId,
      role: assignedRole,
      room: getSanitizedRoomState(room)
    });

    // If player chose White (role 2), Bot is Black (role 1) and moves FIRST!
    if (assignedRole === 2) {
      triggerBotMove(roomId);
    }
  });

  function triggerBotMove(roomId) {
    const room = rooms.get(roomId);
    if (!room || !room.isBotGame || room.game.isGameOver) return;
    const botColor = room.botColor || (room.black && room.black.isBot ? 1 : 2);
    if (room.game.turn !== botColor) return;
    if (room.botThinking) return;
    room.botThinking = true;

    if (!room.lastTimerTick) {
      room.lastTimerTick = Date.now();
    }

    // Snappy, smooth, instant bot response (250ms to 450ms) - feels fluid and natural like top Go/Chess apps
    const baseDelay = room.botLevel <= 2 ? 250 : (room.botLevel <= 4 ? 320 : 400);
    const variableDelay = Math.floor(Math.random() * 100);
    const thinkingDelay = baseDelay + variableDelay;

    setTimeout(() => {
      room.botThinking = false;
      if (!rooms.has(roomId) || room.game.turn !== botColor || room.game.isGameOver) return;

      const botPlayerObj = botColor === 1 ? room.black : room.white;

      // Deduct elapsed thinking time from bot's timer if timeLimit is enabled
      const now = Date.now();
      if (room.timeLimit && room.timeLimit > 0 && room.lastTimerTick) {
        const elapsed = Math.floor((now - room.lastTimerTick) / 1000);
        if (elapsed >= 1) {
          room.timers[botColor] = Math.max(0, room.timers[botColor] - elapsed);
          room.lastTimerTick = now;
          io.to(roomId).emit('timer_update', { timers: room.timers });

          // Bot timeout check
          if (room.timers[botColor] <= 0) {
            const winner = botColor === 1 ? 2 : 1;
            const timedOutColor = botColor === 1 ? 'ดำ' : 'ขาว';
            const winningColor = winner === 1 ? 'ดำ' : 'ขาว';
            room.game.isGameOver = true;
            room.game.winner = winner;
            room.game.winReason = `หมาก${timedOutColor} (AI) เวลาหมด (หมาก${winningColor}ชนะ)`;
            saveCompletedGame(room, winner, room.game.winReason, null);
            io.to(roomId).emit('game_over', {
              winner,
              winReason: room.game.winReason,
              scoreResult: null,
              room: getSanitizedRoomState(room),
              botTaunt: null
            });
            return;
          }
        }
      }

      try {
        let botMove = room.bot.computeMove(room.game, botColor);
        let moveRes = null;

        if (botMove && !botMove.pass) {
          moveRes = room.game.playMove(botColor, botMove.r, botMove.c);
        }

        // If computed move failed or was illegal, try all legal moves one by one
        if (!moveRes || !moveRes.success) {
          const legalMoves = room.bot.getLegalMoves(room.game, botColor);
          for (const fallback of legalMoves) {
            moveRes = room.game.playMove(botColor, fallback.r, fallback.c);
            if (moveRes.success) {
              botMove = fallback;
              break;
            }
          }
        }

        // Reset timer tick for human player's upcoming turn & broadcast timer
        room.lastTimerTick = Date.now();
        if (room.timeLimit && room.timeLimit > 0) {
          io.to(roomId).emit('timer_update', { timers: room.timers });
        }

        // If no legal moves could be played or bot intentionally passed
        if (!moveRes || !moveRes.success || !botMove || botMove.pass) {
          const passRes = room.game.pass(botColor);
          io.to(roomId).emit('turn_passed', {
            player: botColor,
            turn: passRes.turn,
            consecutivePasses: passRes.consecutivePasses,
            timers: room.timers,
            announcement: `${botPlayerObj.name} ผ่าน (Pass)`
          });

          if (passRes.isGameOver) {
            saveCompletedGame(room, passRes.winner, passRes.winReason, passRes.scoreResult);

            let botTaunt = null;
            if (room.isBotGame && passRes.winner === botColor) {
              botTaunt = getBotTauntAndComfort({
                botLevel: room.botLevel || 1,
                winReason: passRes.winReason,
                scoreResult: passRes.scoreResult
              });
            }

            io.to(roomId).emit('game_over', {
              winner: passRes.winner,
              winReason: passRes.winReason,
              scoreResult: passRes.scoreResult,
              room: getSanitizedRoomState(room),
              botTaunt
            });
          }
          return;
        }

        // Move successfully played!
        io.to(roomId).emit('move_played', {
          r: botMove.r,
          c: botMove.c,
          player: botColor,
          capturedStones: moveRes.capturedStones,
          captures: moveRes.captures,
          turn: moveRes.turn,
          board: room.game.board,
          lastMove: moveRes.lastMove,
          timers: room.timers,
          sound: moveRes.capturedStones.length > 0 ? 'capture' : 'stone'
        });
        io.emit('admin_event', { type: 'move_played', roomId });

        // If Bot captured user's stones, Coach explains why!
        if (moveRes.capturedStones.length > 0) {
          const analysis = analyzeCapture(null, null, room.game, moveRes.lastMove, moveRes.capturedStones);
          const lastHist = room.game.moveHistory[room.game.moveHistory.length - 1];
          if (lastHist) {
            lastHist.tacticAnalysis = analysis;
          }

          io.to(roomId).emit('bot_captured_advice', {
            analysis
          });
        }

        // If Bot played a recognized Joseki / Opening move, notify player with Tactical Coach insight!
        if (botMove && botMove.tacticalComment) {
          io.to(roomId).emit('bot_tactical_note', {
            note: botMove.tacticalComment,
            name: botMove.tacticName
          });
        }
      } catch (err) {
        console.error('Error in triggerBotMove:', err);
        try {
          const passRes = room.game.pass(botColor);
          io.to(roomId).emit('turn_passed', {
            player: botColor,
            turn: passRes.turn,
            consecutivePasses: passRes.consecutivePasses,
            timers: room.timers,
            announcement: `${botPlayerObj.name} ผ่าน (Pass)`
          });
        } catch (e) {}
      }
    }, thinkingDelay);
  }

  // Join Room
  socket.on('join_room', ({ roomId, playerName = 'ผู้เล่น 2', isAdmin = false }) => {
    roomId = (roomId || '').trim().toUpperCase();
    const room = rooms.get(roomId);

    if (!room) {
      return socket.emit('join_error', { message: `ไม่พบห้องรหัส "${roomId}"` });
    }

    currentRoomId = roomId;
    socket.join(roomId);

    // Admin inspection mode: ALWAYS enters as spectator with Admin title
    if (isAdmin) {
      playerRole = 'spectator';
      const adminName = '👑 ผู้ดูแลระบบ';
      room.spectators = room.spectators.filter(s => s.socketId !== socket.id);
      room.spectators.push({ socketId: socket.id, name: adminName, isAdmin: true });

      socket.emit('room_joined', {
        roomId,
        role: 'spectator',
        isAdmin: true,
        room: getSanitizedRoomState(room)
      });

      io.to(roomId).emit('room_updated', {
        room: getSanitizedRoomState(room),
        announcement: '👑 ผู้ดูแลระบบ ได้เข้ามารับชมการแข่งขัน'
      });
      io.emit('admin_event', { type: 'room_updated', roomId });
      return;
    }

    const resolvedName = currentUser ? currentUser.username : (playerName.trim() || 'ผู้เล่น 2');
    const resolvedUserId = currentUser ? currentUser.id : null;

    // Reconnection or role assignment
    if (room.black && room.black.socketId === socket.id) {
      room.black.connected = true;
      if (resolvedUserId && !room.black.userId) room.black.userId = resolvedUserId;
      playerRole = 1;
    } else if (room.white && room.white.socketId === socket.id) {
      room.white.connected = true;
      if (resolvedUserId && !room.white.userId) room.white.userId = resolvedUserId;
      playerRole = 2;
    } else if (!room.black || !room.black.connected && !room.black.name) {
      room.black = { socketId: socket.id, name: resolvedName, userId: resolvedUserId, connected: true };
      playerRole = 1;
    } else if (!room.white || !room.white.connected && !room.white.name) {
      room.white = { socketId: socket.id, name: resolvedName, userId: resolvedUserId, connected: true };
      playerRole = 2;
    } else if (room.white && !room.white.connected) {
      // Reconnect as White
      room.white.socketId = socket.id;
      room.white.connected = true;
      if (resolvedUserId && !room.white.userId) room.white.userId = resolvedUserId;
      playerRole = 2;
    } else if (room.black && !room.black.connected) {
      // Reconnect as Black
      room.black.socketId = socket.id;
      room.black.connected = true;
      if (resolvedUserId && !room.black.userId) room.black.userId = resolvedUserId;
      playerRole = 1;
    } else {
      // Join as spectator
      playerRole = 'spectator';
      room.spectators.push({ socketId: socket.id, name: resolvedName || `ผู้ชม ${room.spectators.length + 1}` });
    }

    socket.emit('room_joined', {
      roomId,
      role: playerRole,
      room: getSanitizedRoomState(room)
    });

    // Notify room of new presence
    io.to(roomId).emit('room_updated', {
      room: getSanitizedRoomState(room),
      announcement: `${resolvedName} ได้เข้าร่วมห้องแล้ว`
    });
    io.emit('admin_event', { type: 'room_updated', roomId });
  });

  // Play Move
  socket.on('play_move', ({ roomId, r, c }) => {
    const room = rooms.get(roomId);
    if (!room) return;

    if (playerRole !== 1 && playerRole !== 2) {
      return socket.emit('move_error', { message: 'คุณเป็นเพียงผู้ชม ไม่สามารถวางหมากได้' });
    }

    if (room.game.isGameOver) {
      return socket.emit('move_error', { message: 'เกมจบลงแล้ว ไม่สามารถวางหมากเพิ่มได้' });
    }

    if (room.game.turn !== playerRole) {
      return socket.emit('move_error', { message: 'ยังไม่ใช่ตาของคุณ' });
    }

    const result = room.game.playMove(playerRole, r, c);
    if (!result.success) {
      return socket.emit('move_error', { message: result.error });
    }

    // Reset timer tick reference
    room.lastTimerTick = Date.now();

    io.to(roomId).emit('move_played', {
      r,
      c,
      player: playerRole,
      capturedStones: result.capturedStones,
      captures: result.captures,
      turn: result.turn,
      board: room.game.board,
      lastMove: result.lastMove,
      timers: room.timers,
      sound: result.capturedStones.length > 0 ? 'capture' : 'stone'
    });
    io.emit('admin_event', { type: 'move_played', roomId });

    // If stones were captured, analyze tactic and record in move history
    if (result.capturedStones.length > 0) {
      const analysis = analyzeCapture(null, null, room.game, result.lastMove, result.capturedStones);
      const lastHist = room.game.moveHistory[room.game.moveHistory.length - 1];
      if (lastHist) {
        lastHist.tacticAnalysis = analysis;
      }

      // If user captures stones in a bot training game, trigger interactive Quiz!
      if (room.isBotGame && playerRole !== room.botColor) {
        room.pendingQuiz = analysis;
        socket.emit('quiz_prompt', {
          analysis,
          capturedCount: result.capturedStones.length
        });
      }
    }

    // If it's a bot game, trigger bot's next move!
    if (room.isBotGame && !room.game.isGameOver && room.game.turn === room.botColor) {
      triggerBotMove(roomId);
    }
  });

  // Submit Quiz Explanation
  socket.on('submit_quiz_explanation', ({ roomId, explanation, selectedTactic }) => {
    const room = rooms.get(roomId);
    if (!room || !room.pendingQuiz) return;

    const evaluation = evaluateQuizExplanation(explanation, selectedTactic, room.pendingQuiz);
    socket.emit('quiz_result', evaluation);
    room.pendingQuiz = null;
  });

  // Pass Turn
  socket.on('pass_turn', ({ roomId }) => {
    const room = rooms.get(roomId);
    if (!room) return;

    if (playerRole !== 1 && playerRole !== 2) {
      return socket.emit('move_error', { message: 'คุณอยู่ในสถานะผู้ชม' });
    }

    if (room.game.turn !== playerRole) {
      return socket.emit('move_error', { message: 'ยังไม่ใช่ตาของคุณ' });
    }

    const result = room.game.pass(playerRole);
    if (!result.success) {
      return socket.emit('move_error', { message: result.error });
    }

    room.lastTimerTick = Date.now();

    const playerName = playerRole === 1 ? (room.black?.name || 'สีดำ') : (room.white?.name || 'สีขาว');
    io.to(roomId).emit('turn_passed', {
      player: playerRole,
      turn: result.turn,
      consecutivePasses: result.consecutivePasses,
      announcement: `${playerName} กดผ่าน (Pass)`
    });

    if (result.isGameOver) {
      saveCompletedGame(room, result.winner, result.winReason, result.scoreResult);

      let botTaunt = null;
      if (room.isBotGame && result.winner === room.botColor) {
        botTaunt = getBotTauntAndComfort({
          botLevel: room.botLevel || 1,
          winReason: result.winReason,
          scoreResult: result.scoreResult
        });
      }

      io.to(roomId).emit('game_over', {
        winner: result.winner,
        winReason: result.winReason,
        scoreResult: result.scoreResult,
        room: getSanitizedRoomState(room),
        botTaunt
      });
    } else if (room.isBotGame && result.turn === room.botColor) {
      triggerBotMove(roomId);
    }
  });

  // Resign
  socket.on('resign', ({ roomId }) => {
    const room = rooms.get(roomId);
    if (!room || (playerRole !== 1 && playerRole !== 2)) return;

    const result = room.game.resign(playerRole);
    if (result.success) {
      saveCompletedGame(room, result.winner, result.winReason, null);

      let botTaunt = null;
      if (room.isBotGame && result.winner === room.botColor) {
        botTaunt = getBotTauntAndComfort({
          botLevel: room.botLevel || 1,
          winReason: result.winReason,
          isResign: true
        });
      }

      io.to(roomId).emit('game_over', {
        winner: result.winner,
        winReason: result.winReason,
        scoreResult: null,
        room: getSanitizedRoomState(room),
        botTaunt
      });
    }
  });

  // Request Undo
  socket.on('request_undo', ({ roomId }) => {
    const room = rooms.get(roomId);
    if (!room || (playerRole !== 1 && playerRole !== 2) || room.game.isGameOver) return;

    // Instant Undo for Bot Game (No bot confirmation required!)
    if (room.isBotGame) {
      let undoCount = 1;
      if (room.game.turn === playerRole && room.game.moveHistory.length >= 2) {
        undoCount = 2; // Undo bot move + player move
      } else if (room.game.moveHistory.length >= 1) {
        undoCount = 1;
      } else {
        return;
      }

      for (let i = 0; i < undoCount; i++) {
        room.game.undoMove();
      }

      io.to(roomId).emit('undo_completed', {
        room: getSanitizedRoomState(room),
        announcement: 'ย้อนหมากเรียบร้อย!'
      });
      return;
    }

    const requesterName = playerRole === 1 ? room.black?.name : room.white?.name;
    const opponentRole = playerRole === 1 ? 2 : 1;
    const opponentSocketId = opponentRole === 1 ? room.black?.socketId : room.white?.socketId;

    if (!opponentSocketId) return;

    room.undoPending = { fromRole: playerRole };

    io.to(opponentSocketId).emit('undo_requested', {
      fromRole: playerRole,
      requesterName
    });
  });

  // Respond Undo
  socket.on('respond_undo', ({ roomId, accepted }) => {
    const room = rooms.get(roomId);
    if (!room || !room.undoPending) return;

    if (accepted) {
      const undoRes = room.game.undoMove();
      if (undoRes.success) {
        io.to(roomId).emit('undo_completed', {
          room: getSanitizedRoomState(room),
          announcement: 'ยินยอมให้ย้อนหมากเรียบร้อย'
        });
      }
    } else {
      const targetSocketId = room.undoPending.fromRole === 1 ? room.black?.socketId : room.white?.socketId;
      if (targetSocketId) {
        io.to(targetSocketId).emit('undo_rejected', { message: 'อีกฝ่ายไม่อนุญาตให้ย้อนหมาก' });
      }
    }
    room.undoPending = null;
  });

  // Restart Game
  socket.on('restart_game', ({ roomId }) => {
    const room = rooms.get(roomId);
    if (!room || (playerRole !== 1 && playerRole !== 2)) return;

    // Reset game engine
    room.game = new GoGame({ size: room.size });
    if (room.timeLimit > 0) {
      room.timers = { 1: room.timeLimit, 2: room.timeLimit };
      room.lastTimerTick = null;
    }
    room.undoPending = null;

    // Swap roles for fair play
    const oldBlack = room.black;
    room.black = room.white;
    room.white = oldBlack;

    if (room.isBotGame) {
      room.botColor = room.black.isBot ? 1 : 2;
      playerRole = room.botColor === 1 ? 2 : 1;
    } else {
      playerRole = playerRole === 1 ? 2 : 1;
    }

    io.to(roomId).emit('game_restarted', {
      room: getSanitizedRoomState(room),
      announcement: 'เริ่มเกมใหม่เรียบร้อย! (สลับฝั่งหมากดำ/ขาว)'
    });

    // If bot became Black, bot moves first!
    if (room.isBotGame && room.botColor === 1) {
      triggerBotMove(roomId);
    }
  });

  // Chat message & quick emoji
  socket.on('send_message', ({ roomId, text, type = 'chat' }) => {
    const room = rooms.get(roomId);
    if (!room || !text) return;

    let senderName = 'ผู้ชม';
    let senderColor = null;

    const spec = room.spectators.find(s => s.socketId === socket.id);
    if (spec && spec.isAdmin) {
      senderName = '👑 ผู้ดูแลระบบ';
      senderColor = 'admin';
    } else if (playerRole === 1) {
      senderName = room.black?.name || 'หมากดำ';
      senderColor = 'black';
    } else if (playerRole === 2) {
      senderName = room.white?.name || 'หมากขาว';
      senderColor = 'white';
    } else if (spec) {
      senderName = spec.name;
    }

    io.to(roomId).emit('new_message', {
      sender: senderName,
      senderColor,
      text: text.slice(0, 150),
      type, // 'chat' or 'emoji'
      time: new Date().toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })
    });
  });

  // Disconnection
  socket.on('disconnect', () => {
    // Clean up online presence and notify friends
    if (currentUser) {
      const userSockets = onlineUsers.get(currentUser.id);
      if (userSockets) {
        userSockets.delete(socket.id);
        if (userSockets.size === 0) {
          onlineUsers.delete(currentUser.id);
          notifyFriendsOnlineStatus(currentUser.id, false);
        }
      }
    }

    quoteEngine.handleDisconnect(socket.id);

    if (!currentRoomId) return;
    const room = rooms.get(currentRoomId);
    if (!room) return;

    let leaverName = '';
    if (room.black && room.black.socketId === socket.id) {
      room.black.connected = false;
      leaverName = room.black.name;
    } else if (room.white && room.white.socketId === socket.id) {
      room.white.connected = false;
      leaverName = room.white.name;
    } else {
      const idx = room.spectators.findIndex(s => s.socketId === socket.id);
      if (idx !== -1) {
        leaverName = room.spectators[idx].name;
        room.spectators.splice(idx, 1);
      }
    }

    if (leaverName) {
      io.to(currentRoomId).emit('room_updated', {
        room: getSanitizedRoomState(room),
        announcement: `${leaverName} ออกจากเกมชั่วคราว`
      });
    }

    // Clean up empty rooms after 1 hour if both disconnected
    if ((!room.black || !room.black.connected) && (!room.white || !room.white.connected) && room.spectators.length === 0) {
      setTimeout(() => {
        const checkRoom = rooms.get(currentRoomId);
        if (checkRoom && (!checkRoom.black || !checkRoom.black.connected) && (!checkRoom.white || !checkRoom.white.connected)) {
          rooms.delete(currentRoomId);
        }
      }, 3600000);
    }
  });
});

server.listen(PORT, '0.0.0.0', () => {
  const localIp = getLocalIp();
  console.log(`====================================================`);
  console.log(` 🏯 GO ONLINE (หมากล้อมออนไลน์) เซิร์ฟเวอร์เริ่มทำงานแล้ว!`);
  console.log(` 👉 เล่นบนเครื่องนี้:    http://localhost:${PORT}`);
  console.log(` 👉 ให้เพื่อน/แฟนเปิด:  http://${localIp}:${PORT} (Wi-Fi เดียวกัน)`);
  console.log(`====================================================`);
});
