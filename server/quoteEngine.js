/**
 * Real-time Game Engine & Room Manager for 'ประโยคนี้...พูดว่าอะไร?'
 * Controls synchronized timers, question state machine, and anti-cheat ranking
 */

const Database = require('./quoteDb');

class GameEngine {
  constructor(io) {
    this.io = io;
    this.rooms = new Map(); // roomCode -> Room object
  }

  generateRoomCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 4; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    if (this.rooms.has(code)) return this.generateRoomCode();
    return code;
  }

  createRoom(hostSocket, hostName) {
    const code = this.generateRoomCode();
    const cleanName = (hostName || 'ผู้เล่น 1').trim().slice(0, 16);

    const room = {
      code,
      hostId: hostSocket.id,
      category: 'all',
      difficulty: 'mixed',
      state: 'lobby', // lobby | interstitial | clip | question | reveal | leaderboard | finished
      players: new Map(),
      questions: [],
      currentQuestionIndex: 0,
      currentQuestionStartTime: 0,
      questionTimer: null,
      revealTimer: null,
      chatMessages: []
    };

    room.players.set(hostSocket.id, {
      id: hostSocket.id,
      username: cleanName,
      isHost: true,
      isReady: true,
      score: 0,
      totalCorrectTime: 0,
      streak: 0,
      maxStreak: 0,
      answers: {}, // qIndex -> { selected, isCorrect, timeTaken }
      isConnected: true
    });

    this.rooms.set(code, room);
    hostSocket.join('room_' + code);
    return { success: true, room: this.serializeRoom(room) };
  }

  joinRoom(roomCode, socket, username) {
    const code = (roomCode || '').trim().toUpperCase();
    const room = this.rooms.get(code);
    if (!room) return { success: false, message: 'ไม่พบห้องรหัสนี้ กรุณาตรวจสอบอีกครั้ง' };

    // If reconnecting existing player
    for (const [sId, p] of room.players.entries()) {
      if (p.username.toLowerCase() === (username || '').trim().toLowerCase() && !p.isConnected) {
        room.players.delete(sId);
        p.id = socket.id;
        p.isConnected = true;
        room.players.set(socket.id, p);
        socket.join('room_' + code);
        this.broadcastRoomUpdate(code);
        return { success: true, room: this.serializeRoom(room), isReconnected: true };
      }
    }

    if (room.state !== 'lobby') {
      return { success: false, message: 'เกมในห้องนี้เริ่มไปแล้ว ไม่สามารถเข้าร่วมได้' };
    }

    if (room.players.size >= 10) {
      return { success: false, message: 'ห้องเต็มแล้ว (จำกัดไม่เกิน 10 คน)' };
    }

    const cleanName = (username || 'ผู้เล่น').trim().slice(0, 16);
    room.players.set(socket.id, {
      id: socket.id,
      username: cleanName,
      isHost: false,
      isReady: false,
      score: 0,
      totalCorrectTime: 0,
      streak: 0,
      maxStreak: 0,
      answers: {},
      isConnected: true
    });

    socket.join('room_' + code);
    this.broadcastRoomUpdate(code);
    return { success: true, room: this.serializeRoom(room) };
  }

  toggleReady(roomCode, socketId) {
    const room = this.rooms.get(roomCode);
    if (!room || room.state !== 'lobby') return;
    const player = room.players.get(socketId);
    if (!player) return;
    if (player.isHost) return; // host is always ready

    player.isReady = !player.isReady;
    this.broadcastRoomUpdate(roomCode);
  }

  kickPlayer(roomCode, hostSocketId, targetSocketId) {
    const room = this.rooms.get(roomCode);
    if (!room || room.state !== 'lobby' || room.hostId !== hostSocketId) return;
    if (targetSocketId === hostSocketId) return;

    const target = room.players.get(targetSocketId);
    if (target) {
      room.players.delete(targetSocketId);
      this.io.to(targetSocketId).emit('kicked_from_room');
      this.broadcastRoomUpdate(roomCode);
    }
  }

  updateSettings(roomCode, hostSocketId, { category, difficulty }) {
    const room = this.rooms.get(roomCode);
    if (!room || room.state !== 'lobby' || room.hostId !== hostSocketId) return;

    if (category) room.category = category;
    if (difficulty) room.difficulty = difficulty;
    this.broadcastRoomUpdate(roomCode);
  }

  sendChatMessage(roomCode, socketId, message) {
    const room = this.rooms.get(roomCode);
    if (!room) return;
    // Disallow chat during question answering to prevent spoiling
    if (room.state === 'clip' || room.state === 'question') return;

    const player = room.players.get(socketId);
    if (!player) return;

    const cleanMsg = (message || '').trim().slice(0, 100);
    if (!cleanMsg) return;

    const chatItem = {
      sender: player.username,
      text: cleanMsg,
      time: new Date().toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })
    };
    room.chatMessages.push(chatItem);
    if (room.chatMessages.length > 50) room.chatMessages.shift();

    this.io.to('room_' + roomCode).emit('new_chat_message', chatItem);
  }

  startGame(roomCode, hostSocketId) {
    const room = this.rooms.get(roomCode);
    if (!room || room.state !== 'lobby' || room.hostId !== hostSocketId) return;

    // Check all ready
    for (const [id, p] of room.players.entries()) {
      if (!p.isReady && !p.isHost) {
        return { success: false, message: 'ผู้เล่นทุกคนต้องกดพร้อมก่อนเริ่มเกมครับ' };
      }
    }

    let selectedQ = Database.selectRoundQuestions(room.category || 'all', room.difficulty || 'mixed');
    if (!selectedQ || selectedQ.length < 10) {
      selectedQ = Database.selectRoundQuestions('all', 'mixed');
    }
    if (!selectedQ || selectedQ.length < 10) {
      return { success: false, message: 'มีคำถามที่พร้อมเล่นจริงไม่เพียงพอสำหรับเริ่มเกม (ต้องการอย่างน้อย 10 ข้อ)' };
    }
    room.questions = selectedQ;
    room.currentQuestionIndex = 0;
    room.state = 'interstitial';

    // Reset scores
    for (const p of room.players.values()) {
      p.score = 0;
      p.totalCorrectTime = 0;
      p.streak = 0;
      p.maxStreak = 0;
      p.answers = {};
    }

    this.runQuestionSequence(roomCode);
    return { success: true };
  }

  runQuestionSequence(roomCode) {
    const room = this.rooms.get(roomCode);
    if (!room) return;

    const qIndex = room.currentQuestionIndex;
    if (qIndex >= 10 || qIndex >= room.questions.length) {
      this.finishGame(roomCode);
      return;
    }

    const currentQ = room.questions[qIndex];
    room.state = 'interstitial';

    // 1. Interstitial Screen: "ข้อที่ X/10 เตรียมตัว..." (2 seconds)
    this.io.to('room_' + roomCode).emit('game_interstitial', {
      questionNumber: qIndex + 1,
      totalQuestions: 10,
      title: currentQ.title,
      character: currentQ.character
    });

    setTimeout(() => {
      const liveRoom = this.rooms.get(roomCode);
      if (!liveRoom || liveRoom.currentQuestionIndex !== qIndex) return;

      // 2. Video Clip Phase
      liveRoom.state = 'clip';
      // Deliver question details without answer
      for (const [sockId, p] of liveRoom.players.entries()) {
        const clientPayload = Database.formatQuestionForClient(currentQ, true);
        this.io.to(sockId).emit('game_clip_start', {
          questionNumber: qIndex + 1,
          totalQuestions: 10,
          question: clientPayload
        });
      }

      // Clip plays for currentQ.muteEnd seconds before pausing and revealing choices
      const clipDurationMs = (currentQ.muteEnd || 8.0) * 1000;

      setTimeout(() => {
        const activeRoom = this.rooms.get(roomCode);
        if (!activeRoom || activeRoom.currentQuestionIndex !== qIndex) return;

        // 3. Question Answering Phase: 15 Seconds Countdown
        activeRoom.state = 'question';
        activeRoom.currentQuestionStartTime = Date.now();

        this.io.to('room_' + roomCode).emit('game_question_start', {
          questionNumber: qIndex + 1,
          timeLimitSeconds: 15
        });

        // 15 seconds timer
        clearTimeout(activeRoom.questionTimer);
        activeRoom.questionTimer = setTimeout(() => {
          this.evaluateQuestion(roomCode, qIndex);
        }, 15500);

      }, clipDurationMs);

    }, 2000);
  }

  submitAnswer(roomCode, socketId, selectedOption) {
    const room = this.rooms.get(roomCode);
    if (!room || room.state !== 'question') return;

    const player = room.players.get(socketId);
    if (!player) return;

    const qIndex = room.currentQuestionIndex;
    if (player.answers[qIndex]) return; // already answered

    const now = Date.now();
    const timeTaken = Math.min(15, Math.max(0.1, (now - room.currentQuestionStartTime) / 1000));
    const currentQ = room.questions[qIndex];
    const isCorrect = (selectedOption || '').trim() === (currentQ.correctAnswer || '').trim();

    player.answers[qIndex] = {
      selected: selectedOption,
      isCorrect,
      timeTaken
    };

    if (isCorrect) {
      player.score++;
      player.totalCorrectTime += timeTaken;
      player.streak++;
      if (player.streak > player.maxStreak) player.maxStreak = player.streak;
    } else {
      player.streak = 0;
    }

    // Broadcast that player answered (without revealing choice)
    this.io.to('room_' + roomCode).emit('player_answered', {
      playerId: socketId,
      username: player.username
    });

    // Check if all connected players have answered
    const activePlayers = Array.from(room.players.values()).filter(p => p.isConnected);
    const allAnswered = activePlayers.every(p => p.answers[qIndex] !== undefined);

    if (allAnswered) {
      clearTimeout(room.questionTimer);
      // Small pause of 300ms before reveal
      setTimeout(() => {
        this.evaluateQuestion(roomCode, qIndex);
      }, 400);
    }
  }

  evaluateQuestion(roomCode, qIndex) {
    const room = this.rooms.get(roomCode);
    if (!room || room.currentQuestionIndex !== qIndex || room.state === 'reveal') return;

    room.state = 'reveal';
    clearTimeout(room.questionTimer);

    const currentQ = room.questions[qIndex];

    // Mark unanswered players as wrong
    for (const p of room.players.values()) {
      if (!p.answers[qIndex]) {
        p.answers[qIndex] = { selected: '', isCorrect: false, timeTaken: 15 };
        p.streak = 0;
      }
    }

    // Calculate dynamic commentary
    const commentary = [];
    const correctPlayers = Array.from(room.players.values()).filter(p => p.answers[qIndex]?.isCorrect);
    if (correctPlayers.length === 0) {
      commentary.push('😱 ข้อนี้ไม่มีใครตอบถูกเลย!');
    } else if (correctPlayers.length === room.players.size) {
      commentary.push('🎉 เก่งมาก! ทุกคนตอบถูกหมด!');
    } else {
      // Find fastest correct answer
      const fastest = [...correctPlayers].sort((a,b) => a.answers[qIndex].timeTaken - b.answers[qIndex].timeTaken)[0];
      if (fastest) {
        commentary.push(`⚡ ${fastest.username} ตอบเร็วที่สุด (${fastest.answers[qIndex].timeTaken.toFixed(1)} วินาที)!`);
      }
    }

    for (const p of room.players.values()) {
      if (p.streak >= 3) {
        commentary.push(`🔥 ${p.username} ตอบถูกติดกัน ${p.streak} ข้อแล้ว!`);
      }
    }

    // Sort players for leaderboard
    const rankings = this.getRankedPlayers(room);

    // Broadcast Reveal payload
    this.io.to('room_' + roomCode).emit('game_reveal', {
      questionNumber: qIndex + 1,
      correctAnswer: currentQ.correctAnswer,
      explanation: currentQ.explanation,
      quoteStart: currentQ.quoteStart,
      quoteEnd: currentQ.quoteEnd,
      audioUrl: currentQ.audioUrl || (currentQ.quoteAudioUrl || ''),
      introAudioUrl: currentQ.introAudioUrl || '',
      quoteAudioUrl: currentQ.quoteAudioUrl || '',
      videoUrl: currentQ.videoUrl || '',
      introVideoUrl: currentQ.introVideoUrl || '',
      quoteVideoUrl: currentQ.quoteVideoUrl || '',
      character: currentQ.character,
      title: currentQ.title,
      mediaType: currentQ.mediaType,
      playersResults: Array.from(room.players.values()).map(p => ({
        id: p.id,
        username: p.username,
        isCorrect: p.answers[qIndex].isCorrect,
        selected: p.answers[qIndex].selected,
        timeTaken: p.answers[qIndex].timeTaken.toFixed(1),
        score: p.score
      })),
      rankings,
      commentary
    });

    // Length of replay sentence + 3.5s for reading reveal
    const replayDurationMs = Math.max(3500, ((currentQ.quoteEnd - currentQ.quoteStart) * 1000) + 3500);

    setTimeout(() => {
      const activeRoom = this.rooms.get(roomCode);
      if (!activeRoom) return;

      activeRoom.currentQuestionIndex++;
      this.runQuestionSequence(roomCode);
    }, replayDurationMs);
  }

  getRankedPlayers(room) {
    return Array.from(room.players.values()).sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      // If tied, lower total time taken on correct answers wins
      return a.totalCorrectTime - b.totalCorrectTime;
    }).map((p, idx) => ({
      rank: idx + 1,
      id: p.id,
      username: p.username,
      score: p.score,
      totalCorrectTime: p.totalCorrectTime.toFixed(1),
      maxStreak: p.maxStreak
    }));
  }

  finishGame(roomCode) {
    const room = this.rooms.get(roomCode);
    if (!room) return;

    room.state = 'finished';
    const rankings = this.getRankedPlayers(room);
    const winner = rankings[0];

    Database.recordRoundCompleted();

    this.io.to('room_' + roomCode).emit('game_finished', {
      rankings,
      winner,
      questionsPlayed: room.questions.map(q => ({
        title: q.title,
        mediaType: q.mediaType,
        character: q.character,
        correctAnswer: q.correctAnswer
      }))
    });
  }

  handleDisconnect(socketId) {
    for (const [code, room] of this.rooms.entries()) {
      if (room.players.has(socketId)) {
        const player = room.players.get(socketId);
        player.isConnected = false;

        if (room.state === 'lobby') {
          // Remove from lobby
          room.players.delete(socketId);
          if (room.players.size === 0) {
            this.rooms.delete(code);
            return;
          }
          // If host left, migrate host to next player
          if (player.isHost) {
            const nextPlayer = room.players.values().next().value;
            if (nextPlayer) {
              nextPlayer.isHost = true;
              nextPlayer.isReady = true;
              room.hostId = nextPlayer.id;
            }
          }
          this.broadcastRoomUpdate(code);
        } else {
          // During game, announce disconnect
          this.io.to('room_' + code).emit('player_disconnected', {
            playerId: socketId,
            username: player.username
          });
          // If host disconnected during game, migrate host
          if (player.isHost) {
            const activePlayer = Array.from(room.players.values()).find(p => p.isConnected);
            if (activePlayer) {
              activePlayer.isHost = true;
              room.hostId = activePlayer.id;
            }
          }
        }
      }
    }
  }

  broadcastRoomUpdate(roomCode) {
    const room = this.rooms.get(roomCode);
    if (!room) return;
    this.io.to('room_' + roomCode).emit('room_update', this.serializeRoom(room));
  }

  serializeRoom(room) {
    return {
      code: room.code,
      hostId: room.hostId,
      category: room.category,
      difficulty: room.difficulty,
      state: room.state,
      players: Array.from(room.players.values()).map(p => ({
        id: p.id,
        username: p.username,
        isHost: p.isHost,
        isReady: p.isReady,
        score: p.score,
        isConnected: p.isConnected
      })),
      playerCount: room.players.size
    };
  }
}

module.exports = GameEngine;
