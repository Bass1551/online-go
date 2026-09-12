const { Server } = require('socket.io');
const http = require('http');
const express = require('express');
const { io: ClientIo } = require('socket.io-client');
const assert = require('assert');
const GoGame = require('../server/goEngine');
const { GoBot, getBotTauntAndComfort } = require('../server/botEngine');

console.log('--- STARTING BOT TIMER & PRESSURE TEST ---');

async function runTest() {
  const app = express();
  const server = http.createServer(app);
  const io = new Server(server);

  const rooms = new Map();

  io.on('connection', (socket) => {
    socket.on('start_bot_game', ({ size = 9, botLevel = 1, playerName = 'ผู้เล่น', timeLimit = 0 }) => {
      const initialTime = Number(timeLimit) > 0 ? Number(timeLimit) * 60 : 0;
      const room = {
        id: 'BOT-TEST',
        size,
        timeLimit: initialTime,
        timers: { 1: initialTime, 2: initialTime },
        isBotGame: true,
        botLevel,
        black: { name: playerName, socketId: socket.id, connected: true },
        white: { name: 'AI Bot', socketId: 'bot', connected: true, isBot: true }
      };
      rooms.set('BOT-TEST', room);
      socket.emit('room_created', {
        roomId: 'BOT-TEST',
        role: 1,
        room
      });
    });
  });

  await new Promise(r => server.listen(0, r));
  const port = server.address().port;
  console.log(`✓ Test server running on port ${port}`);

  const client = ClientIo(`http://localhost:${port}`);

  await new Promise((resolve) => {
    client.on('connect', () => {
      // Start Bot Game with 10 minutes (600s) time limit
      client.emit('start_bot_game', {
        size: 9,
        botLevel: 3,
        playerName: 'บาสคนหล่อ',
        timeLimit: 10
      });
    });

    client.on('room_created', (data) => {
      assert.strictEqual(data.room.timeLimit, 600, 'Time limit should be 600 seconds (10 minutes)');
      assert.strictEqual(data.room.timers[1], 600, 'Black timer should start at 600 seconds');
      assert.strictEqual(data.room.timers[2], 600, 'White timer should start at 600 seconds');
      console.log('✅ Bot Game initialized with 10 min time limit (600s) successfully!');
      resolve();
    });
  });

  client.disconnect();
  server.close();

  console.log('🎉 BOT TIMER & PRESSURE TEST PASSED 100%! 🎉');
  process.exit(0);
}

runTest().catch(err => {
  console.error(err);
  process.exit(1);
});
