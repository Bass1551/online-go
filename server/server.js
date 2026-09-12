const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const os = require('os');
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

// Enable JSON body parsing for API
app.use(express.json());

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
  const { username, password } = req.body || {};
  const result = Database.register(username, password);
  if (!result.success) {
    return res.status(400).json(result);
  }
  res.json(result);
});

app.post('/api/login', (req, res) => {
  const { username, password } = req.body || {};
  const result = Database.login(username, password);
  if (!result.success) {
    return res.status(401).json(result);
  }
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

// Store active rooms in memory
// Key: roomId, Value: Room object
const rooms = new Map();

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

  // Allow client to authenticate session dynamically after connect
  socket.on('auth_session', ({ token }, callback) => {
    currentUser = Database.verifyToken(token);
    if (typeof callback === 'function') {
      callback({ success: !!currentUser, user: currentUser });
    }
  });

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
    let roomId = 'BOT-' + generateRoomId().slice(0, 4);

    const game = new GoGame({ size: validSize });
    const bot = new GoBot(level);
    const botName = `AI ${GoBot.LEVEL_NAMES[level]}`;
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
      lastTimerTick: null,
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

    // Simulate thinking delay (350ms - 750ms)
    setTimeout(() => {
      room.botThinking = false;
      if (!rooms.has(roomId) || room.game.turn !== botColor || room.game.isGameOver) return;

      const botPlayerObj = botColor === 1 ? room.black : room.white;

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

        // If no legal moves could be played or bot intentionally passed
        if (!moveRes || !moveRes.success || !botMove || botMove.pass) {
          const passRes = room.game.pass(botColor);
          io.to(roomId).emit('turn_passed', {
            player: botColor,
            turn: passRes.turn,
            consecutivePasses: passRes.consecutivePasses,
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
          sound: moveRes.capturedStones.length > 0 ? 'capture' : 'stone'
        });

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
            announcement: `${botPlayerObj.name} ผ่าน (Pass)`
          });
        } catch (e) {}
      }
    }, 350 + Math.random() * 350);
  }

  // Join Room
  socket.on('join_room', ({ roomId, playerName = 'ผู้เล่น 2' }) => {
    roomId = (roomId || '').trim().toUpperCase();
    const room = rooms.get(roomId);

    if (!room) {
      return socket.emit('join_error', { message: `ไม่พบห้องรหัส "${roomId}"` });
    }

    currentRoomId = roomId;
    socket.join(roomId);

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
  });

  // Play Move
  socket.on('play_move', ({ roomId, r, c }) => {
    const room = rooms.get(roomId);
    if (!room) return socket.emit('move_error', { message: 'ไม่พบห้องนี้' });

    if (playerRole !== 1 && playerRole !== 2) {
      return socket.emit('move_error', { message: 'คุณอยู่ในสถานะผู้ชม ไม่สามารถวางหมากได้' });
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
      sound: result.capturedStones.length > 0 ? 'capture' : 'stone'
    });

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

    if (playerRole === 1) {
      senderName = room.black?.name || 'หมากดำ';
      senderColor = 'black';
    } else if (playerRole === 2) {
      senderName = room.white?.name || 'หมากขาว';
      senderColor = 'white';
    } else {
      const spec = room.spectators.find(s => s.socketId === socket.id);
      if (spec) senderName = spec.name;
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
