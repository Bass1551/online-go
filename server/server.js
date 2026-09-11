const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const os = require('os');
const GoGame = require('./goEngine');
const { GoBot, analyzeCapture, evaluateQuizExplanation } = require('./botEngine');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

const PORT = process.env.PORT || 3000;

// Serve static frontend files
app.use(express.static(path.join(__dirname, '..', 'public')));

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
          
          io.to(roomId).emit('game_over', {
            winner,
            winReason: room.game.winReason,
            scoreResult: null,
            room: getSanitizedRoomState(room)
          });
        }

        io.to(roomId).emit('timer_update', { timers: room.timers });
      }
    } else {
      room.lastTimerTick = now;
    }
  }
}, 1000);

io.on('connection', (socket) => {
  let currentRoomId = null;
  let playerRole = null; // 1: Black, 2: White, 'spectator'

  // Create Room (Human vs Human)
  socket.on('create_room', ({ size = 19, playerName = 'ผู้เล่น 1', timeLimit = 0 }) => {
    const validSize = [9, 13, 19].includes(Number(size)) ? Number(size) : 19;
    let roomId = generateRoomId();
    while (rooms.has(roomId)) {
      roomId = generateRoomId();
    }

    const game = new GoGame({ size: validSize });
    const initialTime = timeLimit > 0 ? timeLimit * 60 : 0;

    const room = {
      id: roomId,
      size: validSize,
      timeLimit: initialTime,
      game,
      black: { socketId: socket.id, name: playerName.trim() || 'ผู้เล่นสีดำ', connected: true },
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
  socket.on('start_bot_game', ({ size = 9, botLevel = 1, playerName = 'ผู้เล่น' }) => {
    const validSize = [9, 13, 19].includes(Number(size)) ? Number(size) : 9;
    const level = Math.max(1, Math.min(6, parseInt(botLevel, 10) || 1));
    let roomId = 'BOT-' + generateRoomId().slice(0, 4);

    const game = new GoGame({ size: validSize });
    const bot = new GoBot(level);
    const botName = `AI ${GoBot.LEVEL_NAMES[level]}`;

    const room = {
      id: roomId,
      size: validSize,
      timeLimit: 0,
      game,
      black: { socketId: socket.id, name: playerName.trim() || 'ผู้เล่น (ดำ)', connected: true },
      white: { socketId: 'bot', name: botName, connected: true, isBot: true },
      spectators: [],
      timers: { 1: 0, 2: 0 },
      lastTimerTick: null,
      undoPending: null,
      isBotGame: true,
      bot,
      botLevel: level,
      pendingQuiz: null
    };

    rooms.set(roomId, room);
    currentRoomId = roomId;
    playerRole = 1;

    socket.join(roomId);
    socket.emit('room_created', {
      roomId,
      role: 1,
      room: getSanitizedRoomState(room)
    });
  });

  function triggerBotMove(roomId) {
    const room = rooms.get(roomId);
    if (!room || !room.isBotGame || room.game.isGameOver || room.game.turn !== 2) return;

    // Simulate thinking delay (400ms - 900ms)
    setTimeout(() => {
      if (!rooms.has(roomId) || room.game.turn !== 2 || room.game.isGameOver) return;

      const botMove = room.bot.computeMove(room.game, 2);
      if (botMove.pass) {
        const passRes = room.game.pass(2);
        io.to(roomId).emit('turn_passed', {
          player: 2,
          turn: passRes.turn,
          consecutivePasses: passRes.consecutivePasses,
          announcement: `${room.white.name} ผ่าน (Pass)`
        });

        if (passRes.isGameOver) {
          io.to(roomId).emit('game_over', {
            winner: passRes.winner,
            winReason: passRes.winReason,
            scoreResult: passRes.scoreResult,
            room: getSanitizedRoomState(room)
          });
        }
      } else {
        const moveRes = room.game.playMove(2, botMove.r, botMove.c);
        if (moveRes.success) {
          io.to(roomId).emit('move_played', {
            r: botMove.r,
            c: botMove.c,
            player: 2,
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
            io.to(roomId).emit('bot_captured_advice', {
              analysis
            });
          }
        }
      }
    }, 600 + Math.random() * 400);
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

    // Reconnection or role assignment
    if (room.black && room.black.socketId === socket.id) {
      room.black.connected = true;
      playerRole = 1;
    } else if (room.white && room.white.socketId === socket.id) {
      room.white.connected = true;
      playerRole = 2;
    } else if (!room.black || !room.black.connected && !room.black.name) {
      room.black = { socketId: socket.id, name: playerName.trim() || 'ผู้เล่นสีดำ', connected: true };
      playerRole = 1;
    } else if (!room.white || !room.white.connected && !room.white.name) {
      room.white = { socketId: socket.id, name: playerName.trim() || 'ผู้เล่นสีขาว', connected: true };
      playerRole = 2;
    } else if (room.white && !room.white.connected) {
      // Reconnect as White
      room.white.socketId = socket.id;
      room.white.connected = true;
      playerRole = 2;
    } else if (room.black && !room.black.connected) {
      // Reconnect as Black
      room.black.socketId = socket.id;
      room.black.connected = true;
      playerRole = 1;
    } else {
      // Join as spectator
      playerRole = 'spectator';
      room.spectators.push({ socketId: socket.id, name: playerName.trim() || `ผู้ชม ${room.spectators.length + 1}` });
    }

    socket.emit('room_joined', {
      roomId,
      role: playerRole,
      room: getSanitizedRoomState(room)
    });

    // Notify room of new presence
    io.to(roomId).emit('room_updated', {
      room: getSanitizedRoomState(room),
      announcement: `${playerName} ได้เข้าร่วมห้องแล้ว`
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

    // If user captures stones in a bot training game, trigger interactive Quiz!
    if (room.isBotGame && playerRole === 1 && result.capturedStones.length > 0) {
      const analysis = analyzeCapture(null, null, room.game, result.lastMove, result.capturedStones);
      room.pendingQuiz = analysis;
      socket.emit('quiz_prompt', {
        analysis,
        capturedCount: result.capturedStones.length
      });
    }

    // If it's a bot game, trigger bot's next move!
    if (room.isBotGame && !room.game.isGameOver && room.game.turn === 2) {
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
      io.to(roomId).emit('game_over', {
        winner: result.winner,
        winReason: result.winReason,
        scoreResult: result.scoreResult,
        room: getSanitizedRoomState(room)
      });
    } else if (room.isBotGame && result.turn === 2) {
      triggerBotMove(roomId);
    }
  });

  // Resign
  socket.on('resign', ({ roomId }) => {
    const room = rooms.get(roomId);
    if (!room || (playerRole !== 1 && playerRole !== 2)) return;

    const result = room.game.resign(playerRole);
    if (result.success) {
      io.to(roomId).emit('game_over', {
        winner: result.winner,
        winReason: result.winReason,
        scoreResult: null,
        room: getSanitizedRoomState(room)
      });
    }
  });

  // Request Undo
  socket.on('request_undo', ({ roomId }) => {
    const room = rooms.get(roomId);
    if (!room || (playerRole !== 1 && playerRole !== 2) || room.game.isGameOver) return;

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

    io.to(roomId).emit('game_restarted', {
      room: getSanitizedRoomState(room),
      announcement: 'เริ่มเกมใหม่เรียบร้อย! (สลับฝั่งหมากดำ/ขาว)'
    });
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
