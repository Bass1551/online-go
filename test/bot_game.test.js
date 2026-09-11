const { io } = require('socket.io-client');
const assert = require('assert');

const SERVER_URL = 'http://localhost:3000';

async function testBotGame() {
  console.log('--- Testing Bot Game & Tactical Quiz Integration ---');

  const client = io(SERVER_URL);
  let roomId = null;

  // 1. Start Bot Game Level 6 (โคตรพ่อโคตรแม่มึงเอ้ย)
  await new Promise((resolve) => {
    client.once('connect', () => {
      client.emit('start_bot_game', { size: 9, botLevel: 6, playerName: 'นักกีฬาฝึกซ้อม' });
    });

    client.once('room_created', (data) => {
      roomId = data.roomId;
      assert(data.room.isBotGame, 'Room must be a Bot Game');
      assert.strictEqual(data.room.botLevel, 6);
      assert.strictEqual(data.room.botLevelName, 'โคตรพ่อโคตรแม่มึงเอ้ย (God / Insane)');
      console.log(`✓ Started Bot Game vs Level 6: ${roomId}`);
      resolve();
    });
  });

  // 2. User plays move at (4,4)
  await new Promise((resolve) => {
    // Expect bot to reply with a move
    client.once('move_played', (data) => {
      assert.strictEqual(data.player, 1);
      console.log('✓ User move played at (4,4)');

      // Next move must be bot's move
      client.once('move_played', (botData) => {
        assert.strictEqual(botData.player, 2, 'Next move must be bot (player 2)');
        assert(botData.r >= 0 && botData.r < 9);
        assert(botData.c >= 0 && botData.c < 9);
        console.log(`✓ Level 6 Bot responded with move at (${botData.r}, ${botData.c})`);
        resolve();
      });
    });

    client.emit('play_move', { roomId, r: 4, c: 4 });
  });

  client.disconnect();
  console.log('🎉 BOT GAME INTEGRATION TEST PASSED! 🎉');
  process.exit(0);
}

testBotGame().catch((err) => {
  console.error('Test error:', err);
  process.exit(1);
});
