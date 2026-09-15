/**
 * Real-time Game Engine & Room Manager for 'ประโยคนี้...พูดว่าอะไร?'
 * Implements strict Server State Machine:
 * LOBBY -> COUNTDOWN -> INTRO -> ANSWERING -> REVEAL -> SCOREBOARD -> NEXT or FINISHED
 * Handles CAS state transitions, choice randomization, signed reconnection tokens,
 * server-driven timers, and persistent multiplayer stats.
 */

const crypto = require('crypto');
const Database = require('./quoteDb');
const QuoteStatsDb = require('./quoteStatsDb');

const SECRET_KEY = process.env.QUOTE_SECRET_KEY || 'agy_quote_secret_salt_2026';

function signToken(playerId, roomCode) {
  return crypto.createHmac('sha256', SECRET_KEY).update(`${playerId}::${roomCode}`).digest('hex');
}

function verifyToken(playerId, roomCode, token) {
  const expected = signToken(playerId, roomCode);
  return expected === token;
}

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

  generateId() {
    return 'p_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6);
  }

  createRoom(hostSocket, hostName) {
    const code = this.generateRoomCode();
    const cleanName = (hostName || 'ผู้เล่น 1').trim().slice(0, 16);
    const playerId = this.generateId();
    const reconnectToken = signToken(playerId, code);

    const room = {
      code,
      gameId: 'g_' + Date.now().toString(36),
      stateVersion: 1,
      hostPlayerId: playerId,
      category: 'all',
      difficulty: 'mixed',
      state: 'LOBBY', // LOBBY, COUNTDOWN, INTRO, ANSWERING, REVEAL, SCOREBOARD, FINISHED
      players: new Map(), // playerId -> Player
      questions: [],
      currentQuestionIndex: 0,
      phaseDeadline: 0,
      phaseStartAt: 0,
      stateTimer: null,
      playerReadiness: new Set(),
      chatMessages: []
    };

    const hostPlayer = {
      id: playerId,
      socketId: hostSocket.id,
      username: cleanName,
      isHost: true,
      isReady: true,
      score: 0,
      totalCorrectTime: 0,
      streak: 0,
      maxStreak: 0,
      answers: {}, // qIndex -> { selectedChoiceId, isCorrect, timeTaken, isLate }
      choicesLayout: {}, // qIndex -> array of choices
      isConnected: true,
      reconnectToken
    };

    room.players.set(playerId, hostPlayer);
    this.rooms.set(code, room);
    hostSocket.join('room_' + code);

    return {
      success: true,
      room: this.serializeRoom(room),
      playerId,
      reconnectToken
    };
  }

  joinRoom(roomCode, socket, username) {
    const code = (roomCode || '').trim().toUpperCase();
    const room = this.rooms.get(code);
    if (!room) return { success: false, message: 'ไม่พบห้องรหัสนี้ กรุณาตรวจสอบอีกครั้ง' };

    if (room.state !== 'LOBBY') {
      return { success: false, message: 'เกมในห้องนี้เริ่มไปแล้ว ไม่สามารถเข้าร่วมได้ (ยกเว้นผู้เล่นเดิมที่หลุดแล้วกลับมา)' };
    }

    if (room.players.size >= 10) {
      return { success: false, message: 'ห้องเต็มแล้ว (จำกัดไม่เกิน 10 คน)' };
    }

    const cleanName = (username || 'ผู้เล่น').trim().slice(0, 16);
    const playerId = this.generateId();
    const reconnectToken = signToken(playerId, code);

    const player = {
      id: playerId,
      socketId: socket.id,
      username: cleanName,
      isHost: false,
      isReady: false,
      score: 0,
      totalCorrectTime: 0,
      streak: 0,
      maxStreak: 0,
      answers: {},
      choicesLayout: {},
      isConnected: true,
      reconnectToken
    };

    room.players.set(playerId, player);
    socket.join('room_' + code);
    this.broadcastRoomUpdate(code);

    return {
      success: true,
      room: this.serializeRoom(room),
      playerId,
      reconnectToken
    };
  }

  /**
   * Reconnection using signed token
   */
  reconnect(roomCode, playerId, reconnectToken, socket) {
    const code = (roomCode || '').trim().toUpperCase();
    const room = this.rooms.get(code);
    if (!room) return { success: false, message: 'ไม่พบห้องที่ต้องการเชื่อมต่อใหม่' };

    if (!verifyToken(playerId, code, reconnectToken)) {
      return { success: false, message: 'โทเคนเชื่อมต่อใหม่ไม่ถูกต้อง' };
    }

    const player = room.players.get(playerId);
    if (!player) return { success: false, message: 'ไม่พบข้อมูลผู้เล่นในห้องนี้' };

    // Invalidate old socket if active
    if (player.socketId && player.socketId !== socket.id) {
      this.io.to(player.socketId).emit('session_superseded', { message: 'มีการเชื่อมต่อใหม่จากอุปกรณ์หรือแท็บอื่น' });
    }

    player.socketId = socket.id;
    player.isConnected = true;
    socket.join('room_' + code);

    // Prepare state snapshot
    const qIndex = room.currentQuestionIndex;
    const currentQ = room.questions[qIndex];
    const snapshot = {
      roomId: room.code,
      gameId: room.gameId,
      phase: room.state,
      questionSeq: qIndex + 1,
      stateVersion: room.stateVersion,
      deadline: room.phaseDeadline,
      startAt: room.phaseStartAt,
      score: player.score,
      answered: !!player.answers[qIndex],
      selectedChoiceId: player.answers[qIndex]?.selectedChoiceId || null,
      options: player.choicesLayout[qIndex] || (currentQ ? Database.formatQuestionForClient(currentQ, true).choices : [])
    };

    // If game finished, attach final rankings
    if (room.state === 'FINISHED') {
      snapshot.rankings = this.getRankedPlayers(room);
    }

    this.broadcastRoomUpdate(code);

    return {
      success: true,
      snapshot,
      room: this.serializeRoom(room)
    };
  }

  toggleReady(roomCode, playerIdOrSocketId) {
    const room = this.rooms.get(roomCode);
    if (!room || room.state !== 'LOBBY') return;
    const player = this.findPlayer(room, playerIdOrSocketId);
    if (!player || player.isHost) return;

    player.isReady = !player.isReady;
    this.broadcastRoomUpdate(roomCode);
  }

  kickPlayer(roomCode, hostIdentifier, targetPlayerIdOrSocketId) {
    const room = this.rooms.get(roomCode);
    if (!room || room.state !== 'LOBBY') return;
    const host = this.findPlayer(room, hostIdentifier);
    if (!host || !host.isHost) return;

    const target = this.findPlayer(room, targetPlayerIdOrSocketId);
    if (!target || target.isHost) return;

    room.players.delete(target.id);
    if (target.socketId) {
      this.io.to(target.socketId).emit('kicked_from_room');
    }
    this.broadcastRoomUpdate(roomCode);
  }

  updateSettings(roomCode, hostIdentifier, { category, difficulty }) {
    const room = this.rooms.get(roomCode);
    if (!room || room.state !== 'LOBBY') return;
    const host = this.findPlayer(room, hostIdentifier);
    if (!host || !host.isHost) return;

    if (category) room.category = category;
    if (difficulty) room.difficulty = difficulty;
    this.broadcastRoomUpdate(roomCode);
  }

  startGame(roomCode, hostIdentifier) {
    const room = this.rooms.get(roomCode);
    if (!room || room.state !== 'LOBBY') {
      return { success: false, message: 'ห้องไม่อยู่ในสถานะที่สามารถเริ่มเกมได้' };
    }

    const host = this.findPlayer(room, hostIdentifier);
    if (!host || !host.isHost) {
      return { success: false, message: 'เฉพาะหัวหน้าห้องเท่านั้นที่สามารถกดเริ่มเกมได้' };
    }

    // Check all ready
    for (const p of room.players.values()) {
      if (!p.isReady && !p.isHost && p.isConnected) {
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
    room.gameId = 'g_' + Date.now().toString(36);

    // Reset player scores and answers
    for (const p of room.players.values()) {
      p.score = 0;
      p.totalCorrectTime = 0;
      p.streak = 0;
      p.maxStreak = 0;
      p.answers = {};
      p.choicesLayout = {};
    }

    // Transition to COUNTDOWN
    this.transitionState(room, 'LOBBY', 'COUNTDOWN', () => {
      this.runCountdown(roomCode);
    });

    return { success: true };
  }

  /**
   * Compare-and-set State Transition
   */
  transitionState(room, expectedState, nextState, onEntered) {
    if (!room || room.state !== expectedState) {
      return false;
    }

    clearTimeout(room.stateTimer);
    room.state = nextState;
    room.stateVersion++;
    room.playerReadiness.clear();

    if (typeof onEntered === 'function') {
      onEntered();
    }
    return true;
  }

  runCountdown(roomCode) {
    const room = this.rooms.get(roomCode);
    if (!room || room.state !== 'COUNTDOWN') return;

    const currentSeq = room.currentQuestionIndex + 1;
    const currentQ = room.questions[room.currentQuestionIndex];
    const durationMs = 2500;
    room.phaseStartAt = Date.now();
    room.phaseDeadline = room.phaseStartAt + durationMs;

    this.io.to('room_' + roomCode).emit('game_countdown', {
      roomId: room.code,
      gameId: room.gameId,
      questionSeq: currentSeq,
      stateVersion: room.stateVersion,
      totalQuestions: 10,
      title: currentQ.title,
      character: currentQ.character,
      startAt: room.phaseStartAt,
      deadline: room.phaseDeadline
    });

    room.stateTimer = setTimeout(() => {
      this.transitionState(room, 'COUNTDOWN', 'INTRO', () => {
        this.runIntroPhase(roomCode);
      });
    }, durationMs);
  }

  runIntroPhase(roomCode) {
    const room = this.rooms.get(roomCode);
    if (!room || room.state !== 'INTRO') return;

    const qIndex = room.currentQuestionIndex;
    const currentQ = room.questions[qIndex];
    const clipDurationSec = parseFloat(currentQ.clipDuration) || parseFloat(currentQ.introDuration) || 12.0;
    const clipDurationMs = Math.round((clipDurationSec + 1.2) * 1000);

    room.phaseStartAt = Date.now();
    room.phaseDeadline = room.phaseStartAt + clipDurationMs;

    // Send question info with randomized choice positions per player
    for (const p of room.players.values()) {
      const formatted = Database.formatQuestionForClient(currentQ, true);
      p.choicesLayout[qIndex] = formatted.choices;

      if (p.socketId && p.isConnected) {
        this.io.to(p.socketId).emit('game_intro', {
          roomId: room.code,
          gameId: room.gameId,
          questionSeq: qIndex + 1,
          stateVersion: room.stateVersion,
          totalQuestions: 10,
          question: formatted,
          startAt: room.phaseStartAt,
          deadline: room.phaseDeadline
        });
      }
    }

    room.stateTimer = setTimeout(() => {
      this.transitionState(room, 'INTRO', 'ANSWERING', () => {
        this.runAnsweringPhase(roomCode);
      });
    }, clipDurationMs);
  }

  runAnsweringPhase(roomCode) {
    const room = this.rooms.get(roomCode);
    if (!room || room.state !== 'ANSWERING') return;

    const qIndex = room.currentQuestionIndex;
    const answerDurationMs = 15000; // 15 seconds
    room.phaseStartAt = Date.now();
    room.phaseDeadline = room.phaseStartAt + answerDurationMs;

    this.io.to('room_' + roomCode).emit('game_answering', {
      roomId: room.code,
      gameId: room.gameId,
      questionSeq: qIndex + 1,
      stateVersion: room.stateVersion,
      startAt: room.phaseStartAt,
      deadline: room.phaseDeadline,
      timeLimitSeconds: 15
    });

    // Server-side timeout
    room.stateTimer = setTimeout(() => {
      this.evaluateQuestion(roomCode, qIndex, 'timeout');
    }, answerDurationMs);
  }

  submitAnswer(roomCode, playerIdentifier, choiceId) {
    const room = this.rooms.get(roomCode);
    if (!room || room.state !== 'ANSWERING') return;

    const player = this.findPlayer(room, playerIdentifier);
    if (!player) return;

    const qIndex = room.currentQuestionIndex;
    if (player.answers[qIndex]) return; // Already answered

    const now = Date.now();
    const isLate = now > room.phaseDeadline;
    const timeTaken = Math.min(15, Math.max(0.1, (now - room.phaseStartAt) / 1000));
    const currentQ = room.questions[qIndex];

    const verifyResult = Database.verifyAnswer(currentQ.id, choiceId, now, room.phaseDeadline);
    const isCorrect = verifyResult.isCorrect && !isLate;

    player.answers[qIndex] = {
      selectedChoiceId: choiceId,
      isCorrect,
      isLate,
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

    // Broadcast that player answered (without revealing choice or correctness)
    this.io.to('room_' + roomCode).emit('player_answered', {
      roomId: room.code,
      gameId: room.gameId,
      questionSeq: qIndex + 1,
      playerId: player.id,
      username: player.username
    });

    // Check if all connected active players have answered
    const activeConnected = Array.from(room.players.values()).filter(p => p.isConnected);
    const allAnswered = activeConnected.every(p => p.answers[qIndex] !== undefined);

    if (allAnswered) {
      clearTimeout(room.stateTimer);
      // Small pause of 300ms before reveal
      room.stateTimer = setTimeout(() => {
        this.evaluateQuestion(roomCode, qIndex, 'all_answered');
      }, 350);
    }
  }

  evaluateQuestion(roomCode, qIndex, triggerReason) {
    const room = this.rooms.get(roomCode);
    if (!room || room.currentQuestionIndex !== qIndex) return;

    // CAS: Transition ANSWERING -> REVEAL atomically
    const transitioned = this.transitionState(room, 'ANSWERING', 'REVEAL', () => {});
    if (!transitioned) return; // Prevent double reveal!

    const currentQ = room.questions[qIndex];

    // Mark unanswered players as wrong
    for (const p of room.players.values()) {
      if (!p.answers[qIndex]) {
        p.answers[qIndex] = { selectedChoiceId: null, isCorrect: false, isLate: false, timeTaken: 15 };
        p.streak = 0;
      }
    }

    // Commentary
    const commentary = [];
    const correctPlayers = Array.from(room.players.values()).filter(p => p.answers[qIndex]?.isCorrect);
    if (correctPlayers.length === 0) {
      commentary.push('😱 ข้อนี้ไม่มีใครตอบถูกเลย!');
    } else if (correctPlayers.length === room.players.size) {
      commentary.push('🎉 เก่งมาก! ทุกคนตอบถูกหมด!');
    } else {
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

    const rankings = this.getRankedPlayers(room);
    const revealPayload = Database.verifyAnswer(currentQ.id, currentQ.correctAnswer);

    const replayDurationMs = Math.max(3500, ((currentQ.quoteEnd - currentQ.quoteStart) * 1000) + 3500);
    room.phaseStartAt = Date.now();
    room.phaseDeadline = room.phaseStartAt + replayDurationMs;

    this.io.to('room_' + roomCode).emit('game_reveal', {
      roomId: room.code,
      gameId: room.gameId,
      questionSeq: qIndex + 1,
      stateVersion: room.stateVersion,
      choiceId: revealPayload.correctChoiceId,
      correctChoiceId: revealPayload.correctChoiceId,
      correctAnswer: revealPayload.correctAnswer,
      explanation: revealPayload.explanation,
      quoteStart: revealPayload.quoteStart,
      quoteEnd: revealPayload.quoteEnd,
      audioUrl: revealPayload.quoteAudioUrl,
      introAudioUrl: revealPayload.introAudioUrl,
      quoteAudioUrl: revealPayload.quoteAudioUrl,
      videoUrl: revealPayload.quoteVideoUrl,
      introVideoUrl: revealPayload.introVideoUrl,
      quoteVideoUrl: revealPayload.quoteVideoUrl,
      character: revealPayload.character,
      title: revealPayload.title,
      mediaType: revealPayload.mediaType,
      playersResults: Array.from(room.players.values()).map(p => ({
        id: p.id,
        username: p.username,
        isCorrect: p.answers[qIndex].isCorrect,
        selectedChoiceId: p.answers[qIndex].selectedChoiceId,
        timeTaken: p.answers[qIndex].timeTaken.toFixed(1),
        score: p.score
      })),
      rankings,
      commentary,
      startAt: room.phaseStartAt,
      deadline: room.phaseDeadline
    });

    room.stateTimer = setTimeout(() => {
      this.transitionState(room, 'REVEAL', 'SCOREBOARD', () => {
        this.runScoreboardPhase(roomCode);
      });
    }, replayDurationMs);
  }

  runScoreboardPhase(roomCode) {
    const room = this.rooms.get(roomCode);
    if (!room || room.state !== 'SCOREBOARD') return;

    const qIndex = room.currentQuestionIndex;
    const rankings = this.getRankedPlayers(room);
    const scoreboardDurationMs = 2500;
    room.phaseStartAt = Date.now();
    room.phaseDeadline = room.phaseStartAt + scoreboardDurationMs;

    this.io.to('room_' + roomCode).emit('game_scoreboard', {
      roomId: room.code,
      gameId: room.gameId,
      questionSeq: qIndex + 1,
      stateVersion: room.stateVersion,
      rankings,
      startAt: room.phaseStartAt,
      deadline: room.phaseDeadline
    });

    room.stateTimer = setTimeout(() => {
      room.currentQuestionIndex++;
      if (room.currentQuestionIndex >= 10 || room.currentQuestionIndex >= room.questions.length) {
        this.finishGame(roomCode);
      } else {
        this.transitionState(room, 'SCOREBOARD', 'COUNTDOWN', () => {
          this.runCountdown(roomCode);
        });
      }
    }, scoreboardDurationMs);
  }

  getRankedPlayers(room) {
    const sorted = Array.from(room.players.values()).sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      // Tie-breaker: lower total correct response time wins
      return a.totalCorrectTime - b.totalCorrectTime;
    });

    let currentRank = 1;
    return sorted.map((p, idx) => {
      if (idx > 0) {
        const prev = sorted[idx - 1];
        const isTie = (p.score === prev.score && Math.abs(p.totalCorrectTime - prev.totalCorrectTime) < 0.05);
        if (!isTie) {
          currentRank = idx + 1;
        }
      }
      return {
        rank: currentRank,
        id: p.id,
        username: p.username,
        score: p.score,
        totalCorrectTime: p.totalCorrectTime.toFixed(1),
        maxStreak: p.maxStreak
      };
    });
  }

  async finishGame(roomCode) {
    const room = this.rooms.get(roomCode);
    if (!room) return;

    this.transitionState(room, room.state, 'FINISHED', () => {});

    const rankings = this.getRankedPlayers(room);
    const winner = rankings[0];

    // Atomically persist multiplayer stats to QuoteStatsDb
    const totalPlayers = room.players.size;
    for (const rankItem of rankings) {
      const player = room.players.get(rankItem.id);
      if (player) {
        const roundId = `${room.gameId}_${player.id}`;
        try {
          await QuoteStatsDb.createRound({
            roundId,
            userId: player.id,
            username: player.username,
            mode: 'multi',
            category: room.category,
            difficulty: room.difficulty,
            totalQuestions: 10,
            startedAt: room.phaseStartAt
          });

          await QuoteStatsDb.finishRound({
            roundId,
            userId: player.id,
            username: player.username,
            score: player.score,
            totalCorrectTimeMs: Math.round(player.totalCorrectTime * 1000),
            status: 'completed',
            rank: rankItem.rank,
            totalPlayers,
            finishedAt: Date.now()
          });
        } catch (err) {
          console.error('Error recording multiplayer round stats:', err);
        }
      }
    }

    this.io.to('room_' + roomCode).emit('game_finished', {
      roomId: room.code,
      gameId: room.gameId,
      stateVersion: room.stateVersion,
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
      const player = this.findPlayerBySocket(room, socketId);
      if (player) {
        player.isConnected = false;

        if (room.state === 'LOBBY') {
          room.players.delete(player.id);
          if (room.players.size === 0) {
            this.rooms.delete(code);
            return;
          }
          if (player.isHost) {
            const nextPlayer = room.players.values().next().value;
            if (nextPlayer) {
              nextPlayer.isHost = true;
              nextPlayer.isReady = true;
              room.hostPlayerId = nextPlayer.id;
            }
          }
          this.broadcastRoomUpdate(code);
        } else {
          // Mid-game: server state machine continues ticking
          this.broadcastRoomUpdate(code);
        }
        return;
      }
    }
  }

  sendChatMessage(roomCode, playerIdentifier, message) {
    const room = this.rooms.get(roomCode);
    if (!room) return;
    if (room.state === 'INTRO' || room.state === 'ANSWERING') return;

    const player = this.findPlayer(room, playerIdentifier);
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

  findPlayer(room, identifier) {
    if (!room || !identifier) return null;
    if (room.players.has(identifier)) return room.players.get(identifier);
    for (const p of room.players.values()) {
      if (p.socketId === identifier) return p;
    }
    return null;
  }

  findPlayerBySocket(room, socketId) {
    for (const p of room.players.values()) {
      if (p.socketId === socketId) return p;
    }
    return null;
  }

  leaveRoom(roomCode, playerIdentifier) {
    const room = this.rooms.get(roomCode);
    if (!room) return;
    const player = this.findPlayer(room, playerIdentifier);
    if (!player) return;

    if (player.socketId) {
      const s = this.io.sockets.sockets.get(player.socketId);
      if (s) s.leave('room_' + roomCode);
    }

    if (room.state === 'LOBBY') {
      room.players.delete(player.id);
      if (room.players.size === 0) {
        this.rooms.delete(roomCode);
        return;
      }
      if (player.isHost) {
        const nextPlayer = room.players.values().next().value;
        if (nextPlayer) {
          nextPlayer.isHost = true;
          nextPlayer.isReady = true;
          room.hostPlayerId = nextPlayer.id;
        }
      }
      this.broadcastRoomUpdate(roomCode);
    } else {
      player.isConnected = false;
      this.broadcastRoomUpdate(roomCode);
    }
  }

  serializeRoom(room) {
    return {
      code: room.code,
      gameId: room.gameId,
      hostId: room.hostPlayerId,
      hostPlayerId: room.hostPlayerId,
      category: room.category,
      difficulty: room.difficulty,
      state: room.state,
      stateVersion: room.stateVersion,
      players: Array.from(room.players.values()).map(p => ({
        id: p.id,
        socketId: p.socketId,
        username: p.username,
        isHost: p.isHost,
        isReady: p.isReady,
        score: p.score,
        totalCorrectTime: p.totalCorrectTime.toFixed(1),
        maxStreak: p.maxStreak,
        isConnected: p.isConnected
      })),
      chatMessages: room.chatMessages
    };
  }

  broadcastRoomUpdate(roomCode) {
    const room = this.rooms.get(roomCode);
    if (!room) return;
    const payload = this.serializeRoom(room);
    this.io.to('room_' + roomCode).emit('room_updated', payload);
    this.io.to('room_' + roomCode).emit('room_update', payload);
  }
}

module.exports = GameEngine;
