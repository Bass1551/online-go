const { io } = require('socket.io-client');
const assert = require('assert');

const SERVER_URL = 'http://localhost:3000';

async function runE2ETest() {
  console.log('--- Starting Socket.io Multiplayer E2E Test ---');

  const p1 = io(SERVER_URL);
  const p2 = io(SERVER_URL);

  let roomId = null;

  // 1. P1 creates room
  await new Promise((resolve) => {
    p1.once('connect', () => {
      p1.emit('create_room', { size: 9, playerName: 'คุณแฟน (ดำ)', timeLimit: 0 });
    });

    p1.once('room_created', (data) => {
      roomId = data.roomId;
      assert.strictEqual(data.role, 1, 'P1 should be Black');
      assert.strictEqual(data.room.size, 9);
      console.log(`✓ P1 created room: ${roomId}`);
      resolve();
    });
  });

  // 2. P2 joins room
  await new Promise((resolve) => {
    p2.emit('join_room', { roomId, playerName: 'เพื่อนซี้ (ขาว)' });

    p2.once('room_joined', (data) => {
      assert.strictEqual(data.role, 2, 'P2 should be White');
      assert.strictEqual(data.roomId, roomId);
      console.log(`✓ P2 joined room: ${roomId}`);
      resolve();
    });
  });

  // 3. P1 plays move at (4,4)
  await new Promise((resolve) => {
    p2.once('move_played', (data) => {
      assert.strictEqual(data.r, 4);
      assert.strictEqual(data.c, 4);
      assert.strictEqual(data.player, 1);
      assert.strictEqual(data.turn, 2);
      console.log('✓ P2 received P1 move at (4,4)');
      resolve();
    });

    p1.emit('play_move', { roomId, r: 4, c: 4 });
  });

  // 4. P2 plays move at (2,2)
  await new Promise((resolve) => {
    p1.once('move_played', (data) => {
      assert.strictEqual(data.r, 2);
      assert.strictEqual(data.c, 2);
      assert.strictEqual(data.player, 2);
      assert.strictEqual(data.turn, 1);
      console.log('✓ P1 received P2 move at (2,2)');
      resolve();
    });

    p2.emit('play_move', { roomId, r: 2, c: 2 });
  });

  // 5. Chat & Emoji
  await new Promise((resolve) => {
    p1.once('new_message', (msg) => {
      assert.strictEqual(msg.type, 'emoji');
      assert.strictEqual(msg.text, '❤️');
      console.log(`✓ P1 received emoji reaction: ${msg.text} from ${msg.sender}`);
      resolve();
    });

    p2.emit('send_message', { roomId, text: '❤️', type: 'emoji' });
  });

  p1.disconnect();
  p2.disconnect();

  console.log('🎉 ALL SOCKET E2E TESTS PASSED PERFECTLY!');
  process.exit(0);
}

runE2ETest().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
