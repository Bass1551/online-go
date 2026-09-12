/**
 * Persistent Database & Authentication Module for Online Go
 * Zero external binary dependencies, 100% safe on Windows, Linux, and Cloud
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DATA_DIR = path.join(__dirname, '..', 'data');
const USERS_FILE = path.join(DATA_DIR, 'users.json');
const GAMES_FILE = path.join(DATA_DIR, 'games.json');
const SESSIONS_FILE = path.join(DATA_DIR, 'sessions.json');

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
  } catch (err) {
    console.error(`Error saving ${filePath}:`, err);
  }
}

// In-memory cache synced with disk
let users = loadJSON(USERS_FILE, {});
let games = loadJSON(GAMES_FILE, []);
let sessions = loadJSON(SESSIONS_FILE, {});

function hashPassword(password, salt) {
  return crypto.scryptSync(password, salt, 64).toString('hex');
}

class Database {
  /**
   * Register a new user
   */
  static register(username, password) {
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

    const salt = crypto.randomBytes(16).toString('hex');
    const passwordHash = hashPassword(password, salt);
    const userId = 'usr_' + crypto.randomBytes(8).toString('hex');

    const newUser = {
      id: userId,
      username: cleanUsername,
      salt,
      passwordHash,
      createdAt: new Date().toISOString()
    };

    users[lowerKey] = newUser;
    saveJSON(USERS_FILE, users);

    // Create session token
    const token = Database.createSession(newUser);
    return {
      success: true,
      user: { id: newUser.id, username: newUser.username },
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

    // If user not found (e.g. server restarted or redeployed on Render),
    // automatically register them on the fly so they never lose their account!
    if (!user) {
      if (password && password.length >= 4) {
        return Database.register(rawUsername, password);
      }
      return { success: false, message: 'กรุณากรอกรหัสผ่านอย่างน้อย 4 ตัวอักษร' };
    }

    const testHash = hashPassword(password || '', user.salt);
    if (testHash !== user.passwordHash) {
      return { success: false, message: 'รหัสผ่านไม่ถูกต้อง กรุณาตรวจสอบรหัสผ่านอีกครั้ง' };
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
}

module.exports = Database;
