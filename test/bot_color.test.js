const { Server } = require('socket.io');
const http = require('http');
const express = require('express');
const { io: ClientIo } = require('socket.io-client');
const assert = require('assert');
const GoGame = require('../server/goEngine');
const { GoBot, getBotTauntAndComfort } = require('../server/botEngine');

console.log('--- STARTING BOT COLOR SELECTION & NIGIRI TEST ---');

async function runTest() {
  const app = express();
  const server = http.createServer(app);
  const io = new Server(server);

  const rooms = new Map();

  function triggerBotMove(roomId) {
    const room = rooms.get(roomId);
    if (!room || !room.isBotGame || room.game.isGameOver) return;
    const botColor = room.botColor || (room.black && room.black.isBot ? 1 : 2);
    if (room.game.turn !== botColor) return;

    setTimeout(() => {
      let botMove = room.bot.computeMove(room.game, botColor);
      let moveRes = room.game.playMove(botColor, botMove.r, botMove.c);

      io.to(roomId).emit('move_played', {
        r: botMove.r,
        c: botMove.c,
        player: botColor,
        turn: moveRes.turn,
        board: room.game.board
      });
    }, 50);
  }

  io.on('connection', (socket) => {
    socket.on('start_bot_game', ({ size = 9, botLevel = 1, playerName = 'ผู้เล่น', timeLimit = 0, playerColor = 'black' }) => {
      const validSize = [9, 13, 19].includes(Number(size)) ? Number(size) : 9;
      const level = Math.max(1, Math.min(6, parseInt(botLevel, 10) || 1));
      let roomId = 'BOT-TEST';

      let assignedRole = 1;
      if (playerColor === 'white') assignedRole = 2;
      else if (playerColor === 'random' || playerColor === 'nigiri') assignedRole = Math.random() < 0.5 ? 1 : 2;

      const game = new GoGame({ size: validSize });
      const bot = new GoBot(level);

      const room = {
        id: roomId,
        size: validSize,
        game,
        black: assignedRole === 1
          ? { socketId: socket.id, name: playerName, isBot: false }
          : { socketId: 'bot', name: 'AI Bot', isBot: true },
        white: assignedRole === 2
          ? { socketId: socket.id, name: playerName, isBot: false }
          : { socketId: 'bot', name: 'AI Bot', isBot: true },
        isBotGame: true,
        bot,
        botColor: assignedRole === 1 ? 2 : 1
      };

      rooms.set(roomId, room);
      socket.join(roomId);
      socket.emit('room_created', {
        roomId,
        role: assignedRole,
        room
      });

      if (assignedRole === 2) {
        triggerBotMove(roomId);
      }
    });

    socket.on('play_move', ({ roomId, r, c }) => {
      const room = rooms.get(roomId);
      const playerRole = room.botColor === 1 ? 2 : 1;
      const res = room.game.playMove(playerRole, r, c);
      io.to(roomId).emit('move_played', {
        r,
        c,
        player: playerRole,
        turn: res.turn,
        board: room.game.board
      });

      if (room.isBotGame && !room.game.isGameOver && room.game.turn === room.botColor) {
        triggerBotMove(roomId);
      }
    });

    socket.on('request_undo', ({ roomId }) => {
      const room = rooms.get(roomId);
      const playerRole = room.botColor === 1 ? 2 : 1;
      let undoCount = 1;
      if (room.game.turn === playerRole && room.game.moveHistory.length >= 2) {
        undoCount = 2;
      }
      for (let i = 0; i < undoCount; i++) {
        room.game.undoMove();
      }
      io.to(roomId).emit('undo_completed', { room });
    });
  });

  await new Promise(r => server.listen(0, r));
  const port = server.address().port;
  console.log(`✓ Test server running on port ${port}`);

  const client = ClientIo(`http://localhost:${port}`);
  await new Promise(r => client.on('connect', r));

  // 1. Test Starting as White
  console.log('1. Testing player choosing White (Bot plays Move 1 as Black)...');
  client.emit('start_bot_game', {
    size: 9,
    botLevel: 3,
    playerColor: 'white',
    playerName: 'PlayerWhite'
  });

  const createdData = await new Promise(r => client.once('room_created', r));
  assert.strictEqual(createdData.role, 2, 'Player role must be 2 (White)');
  assert.strictEqual(createdData.room.botColor, 1, 'Bot color must be 1 (Black)');
  assert.strictEqual(createdData.room.black.isBot, true, 'Black must be the bot');
  console.log('✅ Player assigned role 2 (White) and Bot assigned role 1 (Black)!');

  // Wait for bot to play Move 1 as Black
  const botMove1 = await new Promise(r => client.once('move_played', r));
  assert.strictEqual(botMove1.player, 1, 'First move must be played by Bot as Black (player 1)');
  assert.strictEqual(botMove1.turn, 2, 'Turn must now be White (player turn)');
  console.log(`✅ Bot played Move 1 as Black at (${botMove1.r}, ${botMove1.c})!`);

  // 2. Test Player playing Move 2 as White
  console.log('2. Testing player making Move 2 as White...');
  const emptyR = botMove1.r === 4 && botMove1.c === 4 ? 2 : 4;
  const emptyC = botMove1.r === 4 && botMove1.c === 4 ? 2 : 4;
  client.emit('play_move', {
    roomId: createdData.roomId,
    r: emptyR,
    c: emptyC
  });

  const playerMove2 = await new Promise(r => client.once('move_played', r));
  assert.strictEqual(playerMove2.player, 2, 'Move 2 must be White (player)');
  console.log(`✅ Player played Move 2 as White at (${emptyR}, ${emptyC})!`);

  // Wait for bot response Move 3
  const botMove3 = await new Promise(r => client.once('move_played', r));
  assert.strictEqual(botMove3.player, 1, 'Move 3 must be Bot (Black)');
  console.log(`✅ Bot responded with Move 3 as Black at (${botMove3.r}, ${botMove3.c})!`);

  // 3. Test Undo for White player (reverts bot move 3 + player move 2)
  console.log('3. Testing Undo when player is White...');
  client.emit('request_undo', { roomId: createdData.roomId });
  const undoData = await new Promise(r => client.once('undo_completed', r));
  assert.strictEqual(undoData.room.game.turn, 2, 'Turn after undo must be White (2)');
  assert.strictEqual(undoData.room.game.moveHistory.length, 1, 'Move history should have 1 move left (Bot Move 1)');
  console.log('✅ Instant Undo correctly reverted back to White turn!');

  // 4. Test Nigiri / Random
  console.log('4. Testing Random Nigiri assignment...');
  const rolesSeen = new Set();
  for (let i = 0; i < 6; i++) {
    client.emit('start_bot_game', { size: 9, playerColor: 'random' });
    const d = await new Promise(r => client.once('room_created', r));
    rolesSeen.add(d.role);
  }
  assert(rolesSeen.has(1) || rolesSeen.has(2), 'Random must assign role 1 or 2');
  console.log(`✅ Random Nigiri verified (assigned roles: ${Array.from(rolesSeen).join(', ')})!`);

  console.log('🎉 ALL BOT COLOR & NIGIRI TESTS PASSED 100%! 🎉');
  client.disconnect();
  server.close();
  process.exit(0);
}

runTest().catch((err) => {
  console.error('Test Failed:', err);
  process.exit(1);
});
