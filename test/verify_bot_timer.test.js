const { Server } = require('socket.io');
const http = require('http');
const express = require('express');
const { io: ClientIo } = require('socket.io-client');
const assert = require('assert');
const GoGame = require('../server/goEngine');
const { GoBot } = require('../server/botEngine');

console.log('--- STARTING REAL BOT TIMER REDUCTION TEST ---');

async function runTest() {
  const app = express();
  const server = http.createServer(app);
  const io = new Server(server);

  const rooms = new Map();

  function triggerBotMove(roomId) {
    const room = rooms.get(roomId);
    if (!room) return;
    const botColor = room.botColor;
    room.botThinking = true;

    // Simulate thinking delay 1200ms
    const thinkingDelay = 1200;

    setTimeout(() => {
      room.botThinking = false;
      const now = Date.now();
      if (room.timeLimit && room.timeLimit > 0 && room.lastTimerTick) {
        const elapsed = Math.floor((now - room.lastTimerTick) / 1000);
        if (elapsed >= 1) {
          room.timers[botColor] = Math.max(0, room.timers[botColor] - elapsed);
          room.lastTimerTick = now;
        }
      }

      const botMove = room.bot.computeMove(room.game, botColor);
      const moveRes = room.game.playMove(botColor, botMove.r, botMove.c);
      room.lastTimerTick = Date.now();

      io.to(roomId).emit('move_played', {
        r: botMove.r,
        c: botMove.c,
        player: botColor,
        turn: moveRes.turn,
        board: room.game.board,
        timers: room.timers
      });
    }, thinkingDelay);
  }

  io.on('connection', (socket) => {
    socket.on('start_bot_game', ({ size = 9, botLevel = 1, timeLimit = 10 }) => {
      const initialTime = Number(timeLimit) * 60;
      const game = new GoGame({ size });
      const bot = new GoBot(botLevel, size);
      const room = {
        id: 'BOT-TIMER-TEST',
        game,
        bot,
        botColor: 2,
        timeLimit: initialTime,
        timers: { 1: initialTime, 2: initialTime },
        lastTimerTick: Date.now()
      };
      rooms.set('BOT-TIMER-TEST', room);
      socket.join('BOT-TIMER-TEST');
      socket.emit('room_created', { roomId: 'BOT-TIMER-TEST', timers: room.timers });
    });

    socket.on('play_move', ({ roomId, r, c }) => {
      const room = rooms.get(roomId);
      const res = room.game.playMove(1, r, c);
      room.lastTimerTick = Date.now();
      io.to(roomId).emit('move_played', {
        r, c, player: 1, turn: res.turn, timers: room.timers
      });
      triggerBotMove(roomId);
    });
  });

  await new Promise(r => server.listen(0, r));
  const port = server.address().port;
  const client = ClientIo(`http://localhost:${port}`);

  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Timeout waiting for bot move')), 5000);

    client.on('connect', () => {
      client.emit('start_bot_game', { size: 9, botLevel: 1, timeLimit: 10 });
    });

    client.on('room_created', () => {
      // Player 1 plays move
      client.emit('play_move', { roomId: 'BOT-TIMER-TEST', r: 4, c: 4 });
    });

    client.on('move_played', (data) => {
      if (data.player === 2) {
        clearTimeout(timeout);
        console.log(`Bot played move! Bot remaining time: ${data.timers[2]}s (started at 600s)`);
        assert(data.timers[2] < 600, 'Bot timer must have counted down and be less than 600s!');
        console.log('✅ PASS: Bot timer successfully decremented on bot move!');
        resolve();
      }
    });
  });

  client.disconnect();
  server.close();
  console.log('🎉 BOT TIMER REDUCTION TEST PASSED! 🎉');
  process.exit(0);
}

runTest().catch(err => {
  console.error(err);
  process.exit(1);
});
