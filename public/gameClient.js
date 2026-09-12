/**
 * Go Game Client - Frontend Controller & Canvas Renderer
 */

const socket = io();

// State
let myRole = null; // 1 = Black, 2 = White, 'spectator'
let currentRoomId = null;
let roomState = null;
let hoverCoord = null;
let boardSize = 9;
let cellSize = 40;
let margin = 35;
let canvasSize = 500;

// Elements
const lobbyView = document.getElementById('lobbyView');
const gameView = document.getElementById('gameView');
const canvas = document.getElementById('goCanvas');
const ctx = canvas.getContext('2d');

const btnCreateRoom = document.getElementById('btnCreateRoom');
const btnJoinRoom = document.getElementById('btnJoinRoom');
const createPlayerName = document.getElementById('createPlayerName');
const joinPlayerName = document.getElementById('joinPlayerName');
const joinRoomCode = document.getElementById('joinRoomCode');
const timeLimitSelect = document.getElementById('timeLimitSelect');

const displayRoomId = document.getElementById('displayRoomId');
const gameStatusBanner = document.getElementById('gameStatusBanner');
const btnLeaveRoom = document.getElementById('btnLeaveRoom');
const btnShareModal = document.getElementById('btnShareModal');

const blackPlayerCard = document.getElementById('blackPlayerCard');
const whitePlayerCard = document.getElementById('whitePlayerCard');
const blackPlayerName = document.getElementById('blackPlayerName');
const whitePlayerName = document.getElementById('whitePlayerName');
const blackTimer = document.getElementById('blackTimer');
const whiteTimer = document.getElementById('whiteTimer');
const blackCaptures = document.getElementById('blackCaptures');
const whiteCaptures = document.getElementById('whiteCaptures');
const komiValue = document.getElementById('komiValue');
const roleIndicator = document.getElementById('roleIndicator');

const btnPass = document.getElementById('btnPass');
const btnUndo = document.getElementById('btnUndo');
const btnResign = document.getElementById('btnResign');
const btnRestart = document.getElementById('btnRestart');

const chatMessages = document.getElementById('chatMessages');
const chatInput = document.getElementById('chatInput');
const btnSendChat = document.getElementById('btnSendChat');

// Modals
const shareModal = document.getElementById('shareModal');
const shareRoomCodeDisplay = document.getElementById('shareRoomCodeDisplay');
const btnCopyRoomCode = document.getElementById('btnCopyRoomCode');
const btnCopyShareLink = document.getElementById('btnCopyShareLink');
const btnCloseShareModal = document.getElementById('btnCloseShareModal');

const gameOverModal = document.getElementById('gameOverModal');
const modalWinnerTitle = document.getElementById('modalWinnerTitle');
const modalWinReason = document.getElementById('modalWinReason');
const scoreDetailsBox = document.getElementById('scoreDetailsBox');
const scoreBlackDetail = document.getElementById('scoreBlackDetail');
const scoreWhiteDetail = document.getElementById('scoreWhiteDetail');
const scoreDiffDetail = document.getElementById('scoreDiffDetail');
const btnPlayAgain = document.getElementById('btnPlayAgain');
const btnCloseGameOverModal = document.getElementById('btnCloseGameOverModal');

// Bot Taunt & Comfort Modal
const botTauntModal = document.getElementById('botTauntModal');
const botTauntHeadline = document.getElementById('botTauntHeadline');
const botTauntLevelTag = document.getElementById('botTauntLevelTag');
const botMemeImg = document.getElementById('botMemeImg');
const botMemeCaption = document.getElementById('botMemeCaption');
const botTauntQuote = document.getElementById('botTauntQuote');
const botComfortQuote = document.getElementById('botComfortQuote');
const btnTauntRematch = document.getElementById('btnTauntRematch');
const btnTauntReview = document.getElementById('btnTauntReview');
const btnCloseTauntModal = document.getElementById('btnCloseTauntModal');

const undoModal = document.getElementById('undoModal');
const undoMessage = document.getElementById('undoMessage');
const btnAcceptUndo = document.getElementById('btnAcceptUndo');
const btnRejectUndo = document.getElementById('btnRejectUndo');

// Solo Bot & Coach Elements
const btnStartBotGame = document.getElementById('btnStartBotGame');
const botPlayerName = document.getElementById('botPlayerName');
const botLevelSelect = document.getElementById('botLevelSelect');
const botTimeLimitSelect = document.getElementById('botTimeLimitSelect');

const coachBanner = document.getElementById('coachBanner');
const coachBannerContent = document.getElementById('coachBannerContent');

// Non-blocking Top Alert (when Bot captures player)
const boardTopAlert = document.getElementById('boardTopAlert');
const topAlertTitle = document.getElementById('topAlertTitle');
const topAlertBadge = document.getElementById('topAlertBadge');
const topAlertExplanation = document.getElementById('topAlertExplanation');
const topAlertTip = document.getElementById('topAlertTip');
const btnCloseTopAlert = document.getElementById('btnCloseTopAlert');

// Non-blocking Quiz Dock (when Player captures bot)
const boardQuizDock = document.getElementById('boardQuizDock');
const btnCloseQuizDock = document.getElementById('btnCloseQuizDock');
const quizCapturedCount = document.getElementById('quizCapturedCount');
const quizExplanationInput = document.getElementById('quizExplanationInput');
const btnSubmitQuiz = document.getElementById('btnSubmitQuiz');
const quizResultBox = document.getElementById('quizResultBox');
const quizStarsDisplay = document.getElementById('quizStarsDisplay');
const quizTacticTitle = document.getElementById('quizTacticTitle');
const quizFeedbackText = document.getElementById('quizFeedbackText');
const quizTipText = document.getElementById('quizTipText');
let selectedQuizTactic = 'atari_neglect';

// Visual highlight for recent captures on board
let recentCaptures = null;

const toastContainer = document.getElementById('toastContainer');

// --- Auth State & Elements ---
const TOKEN_KEY = 'online_go_token';
let currentUser = null;

// Mandatory Gate View Elements (Shown before entering game)
const authGateView = document.getElementById('authGateView');
const gateTabLogin = document.getElementById('gateTabLogin');
const gateTabRegister = document.getElementById('gateTabRegister');
const gateErrorMessage = document.getElementById('gateErrorMessage');
const gateAuthForm = document.getElementById('gateAuthForm');
const gateUsername = document.getElementById('gateUsername');
const gatePassword = document.getElementById('gatePassword');
const btnGateSubmit = document.getElementById('btnGateSubmit');
const gateNoteText = document.getElementById('gateNoteText');
let gateMode = 'login'; // 'login' or 'register'

const currentUserName = document.getElementById('currentUserName');
const btnLogout = document.getElementById('btnLogout');

// --- Match History Elements ---
const btnOpenHistory = document.getElementById('btnOpenHistory');
const btnCloseHistoryModal = document.getElementById('btnCloseHistoryModal');
const historyModal = document.getElementById('historyModal');
const statTotalGames = document.getElementById('statTotalGames');
const statWins = document.getElementById('statWins');
const statLosses = document.getElementById('statLosses');
const statWinRate = document.getElementById('statWinRate');
const historyListContainer = document.getElementById('historyListContainer');

// --- Interactive Replay Elements ---
const replayModal = document.getElementById('replayModal');
const btnCloseReplayModal = document.getElementById('btnCloseReplayModal');
const replayCanvas = document.getElementById('replayCanvas');
const replayCtx = replayCanvas ? replayCanvas.getContext('2d') : null;
const replayModeBadge = document.getElementById('replayModeBadge');
const replaySizeBadge = document.getElementById('replaySizeBadge');
const replayDateText = document.getElementById('replayDateText');
const replayPlayersText = document.getElementById('replayPlayersText');
const replayResultText = document.getElementById('replayResultText');
const replaySlider = document.getElementById('replaySlider');
const replayStepDisplay = document.getElementById('replayStepDisplay');
const btnReplayFirst = document.getElementById('btnReplayFirst');
const btnReplayPrev = document.getElementById('btnReplayPrev');
const btnReplayAuto = document.getElementById('btnReplayAuto');
const btnReplayNext = document.getElementById('btnReplayNext');
const btnReplayLast = document.getElementById('btnReplayLast');
const replayTacticBox = document.getElementById('replayTacticBox');
const replayTacticTitle = document.getElementById('replayTacticTitle');
const replayTacticBadge = document.getElementById('replayTacticBadge');
const replayTacticDesc = document.getElementById('replayTacticDesc');
const replayCoachTip = document.getElementById('replayCoachTip');

let activeReplay = null;
let replayStep = 0;
let replayAutoTimer = null;
let replayCanvasSize = 420;
let replayCellSize = 40;
let replayMargin = 30;

// Coordinate letters (Standard Go notation skips 'I' to prevent confusion with 'J' or '1')
const COORD_LETTERS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'J', 'K', 'L', 'M', 'N', 'O', 'P', 'Q', 'R', 'S', 'T'];

// Star points (Hoshi) definitions
const STAR_POINTS = {
  9: [[2, 2], [2, 6], [6, 2], [6, 6], [4, 4]],
  13: [[3, 3], [3, 9], [9, 3], [9, 9], [6, 6]],
  19: [
    [3, 3], [3, 9], [3, 15],
    [9, 3], [9, 9], [9, 15],
    [15, 3], [15, 9], [15, 15]
  ]
};

// --- INITIALIZATION ---
function init() {
  setupEventListeners();
  checkUrlParams();
  setupCanvas();
  checkAuth();
}

function checkUrlParams() {
  const urlParams = new URLSearchParams(window.location.search);
  const roomParam = urlParams.get('room');
  if (roomParam) {
    joinRoomCode.value = roomParam.toUpperCase();
    showToast(`พบรหัสห้อง ${roomParam.toUpperCase()} ใส่ชื่อของคุณแล้วกดเข้าร่วมได้เลย!`);
  }
}

function showToast(msg) {
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.innerText = msg;
  toastContainer.appendChild(toast);
  setTimeout(() => toast.remove(), 3200);
}

function spawnFloatingEmoji(emoji, x, y) {
  const el = document.createElement('div');
  el.className = 'floating-emoji';
  el.innerText = emoji;
  el.style.left = (x || (window.innerWidth / 2 + (Math.random() * 80 - 40))) + 'px';
  el.style.top = (y || (window.innerHeight / 2 + 50)) + 'px';
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 2200);
}

// Format seconds into MM:SS
function formatTime(sec) {
  if (sec === undefined || sec === null || sec <= 0) return '00:00';
  const m = Math.floor(sec / 60).toString().padStart(2, '0');
  const s = (sec % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

// --- CANVAS SETUP & DRAWING ---
function setupCanvas() {
  // Determine size based on screen width
  const containerWidth = Math.min(window.innerWidth - 30, 620);
  canvasSize = Math.max(300, containerWidth);

  const dpr = window.devicePixelRatio || 1;
  canvas.width = canvasSize * dpr;
  canvas.height = canvasSize * dpr;
  canvas.style.width = canvasSize + 'px';
  canvas.style.height = canvasSize + 'px';

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  margin = Math.max(24, Math.floor(canvasSize * 0.065));
  cellSize = (canvasSize - margin * 2) / (boardSize - 1);

  renderBoard();
}

window.addEventListener('resize', () => {
  if (gameView.style.display !== 'none') {
    setupCanvas();
  }
});

function renderBoard() {
  if (!ctx) return;
  ctx.clearRect(0, 0, canvasSize, canvasSize);

  // 1. Grid Lines
  ctx.strokeStyle = '#3d2511';
  ctx.lineWidth = 1.2;

  for (let i = 0; i < boardSize; i++) {
    const p = margin + i * cellSize;

    // Horizontal line
    ctx.beginPath();
    ctx.moveTo(margin, p);
    ctx.lineTo(canvasSize - margin, p);
    ctx.stroke();

    // Vertical line
    ctx.beginPath();
    ctx.moveTo(p, margin);
    ctx.lineTo(p, canvasSize - margin);
    ctx.stroke();
  }

  // 2. Coordinate labels
  ctx.fillStyle = '#5c3818';
  ctx.font = `600 ${Math.max(10, Math.floor(cellSize * 0.32))}px Prompt, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  for (let i = 0; i < boardSize; i++) {
    const pos = margin + i * cellSize;
    const colName = COORD_LETTERS[i];
    const rowName = boardSize - i;

    // Top & Bottom (Columns)
    ctx.fillText(colName, pos, margin * 0.45);
    ctx.fillText(colName, pos, canvasSize - margin * 0.45);

    // Left & Right (Rows)
    ctx.fillText(rowName, margin * 0.45, pos);
    ctx.fillText(rowName, canvasSize - margin * 0.45, pos);
  }

  // 3. Star points (Hoshi)
  const hoshi = STAR_POINTS[boardSize] || [];
  ctx.fillStyle = '#3d2511';
  const hoshiRadius = Math.max(2.5, cellSize * 0.085);

  for (const [r, c] of hoshi) {
    const x = margin + c * cellSize;
    const y = margin + r * cellSize;
    ctx.beginPath();
    ctx.arc(x, y, hoshiRadius, 0, Math.PI * 2);
    ctx.fill();
  }

  // 4. Stones & Territory
  const board = roomState?.game?.board;
  const radius = cellSize * 0.46;

  if (board) {
    for (let r = 0; r < boardSize; r++) {
      for (let c = 0; c < boardSize; c++) {
        const stone = board[r][c];
        const x = margin + c * cellSize;
        const y = margin + r * cellSize;

        if (stone === 1 || stone === 2) {
          drawStone(x, y, radius, stone);
        }
      }
    }
  }

  // 5. Territory markers if game over with score
  if (roomState?.game?.scoreResult?.territoryMap) {
    const tMap = roomState.game.scoreResult.territoryMap;
    for (let r = 0; r < boardSize; r++) {
      for (let c = 0; c < boardSize; c++) {
        const owner = tMap[r][c];
        if (owner === 1 || owner === 2) {
          const x = margin + c * cellSize;
          const y = margin + r * cellSize;
          const markSize = cellSize * 0.28;
          ctx.fillStyle = owner === 1 ? 'rgba(0, 0, 0, 0.75)' : 'rgba(255, 255, 255, 0.9)';
          ctx.fillRect(x - markSize / 2, y - markSize / 2, markSize, markSize);
        }
      }
    }
  }

  // 6. Highlight recently captured stones
  if (recentCaptures && (Date.now() - recentCaptures.time < 5000)) {
    const elapsed = Date.now() - recentCaptures.time;
    const alpha = Math.max(0.2, (5000 - elapsed) / 5000);
    ctx.save();
    for (const stone of recentCaptures.stones) {
      const x = margin + stone.c * cellSize;
      const y = margin + stone.r * cellSize;

      // Red dashed glowing ring where stones were taken
      ctx.beginPath();
      ctx.arc(x, y, radius * 0.7, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(239, 68, 68, ${alpha})`;
      ctx.lineWidth = 2.5;
      ctx.setLineDash([4, 4]);
      ctx.stroke();

      // Small X inside
      ctx.strokeStyle = `rgba(239, 68, 68, ${alpha * 0.9})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x - radius * 0.3, y - radius * 0.3);
      ctx.lineTo(x + radius * 0.3, y + radius * 0.3);
      ctx.moveTo(x + radius * 0.3, y - radius * 0.3);
      ctx.lineTo(x - radius * 0.3, y + radius * 0.3);
      ctx.stroke();
    }
    ctx.restore();
  }

  // 7. Last move marker
  const lastMove = roomState?.game?.lastMove;
  if (lastMove && !lastMove.pass && lastMove.r !== undefined) {
    const x = margin + lastMove.c * cellSize;
    const y = margin + lastMove.r * cellSize;
    ctx.beginPath();
    ctx.arc(x, y, radius * 0.25, 0, Math.PI * 2);
    ctx.fillStyle = lastMove.player === 1 ? '#ff4d4f' : '#1890ff';
    ctx.fill();
  }

  // 8. Hover Preview Stone
  if (hoverCoord && myRole && (myRole === 1 || myRole === 2) && roomState?.game?.turn === myRole && !roomState?.game?.isGameOver) {
    const { r, c } = hoverCoord;
    if (board && board[r][c] === 0) {
      const x = margin + c * cellSize;
      const y = margin + r * cellSize;
      ctx.globalAlpha = 0.45;
      drawStone(x, y, radius, myRole);
      ctx.globalAlpha = 1.0;
    }
  }
}

function drawStone(x, y, radius, color, targetCtx = ctx) {
  if (!targetCtx) return;
  targetCtx.save();

  // Shadow
  targetCtx.beginPath();
  targetCtx.arc(x + 2, y + 3, radius, 0, Math.PI * 2);
  targetCtx.fillStyle = 'rgba(0, 0, 0, 0.35)';
  targetCtx.fill();

  // Stone Body Gradient
  targetCtx.beginPath();
  targetCtx.arc(x, y, radius, 0, Math.PI * 2);

  const grad = targetCtx.createRadialGradient(
    x - radius * 0.3,
    y - radius * 0.3,
    radius * 0.1,
    x,
    y,
    radius
  );

  if (color === 1) {
    // Black Stone (slate/obsidian sheen)
    grad.addColorStop(0, '#555555');
    grad.addColorStop(0.3, '#262626');
    grad.addColorStop(1, '#0c0c0c');
  } else {
    // White Stone (shell/ivory sheen)
    grad.addColorStop(0, '#ffffff');
    grad.addColorStop(0.65, '#f0f0f0');
    grad.addColorStop(1, '#d0d0d0');
  }

  targetCtx.fillStyle = grad;
  targetCtx.fill();

  // Subtle White Stone Border for definition
  if (color === 2) {
    targetCtx.strokeStyle = 'rgba(0, 0, 0, 0.2)';
    targetCtx.lineWidth = 1;
    targetCtx.stroke();
  }

  targetCtx.restore();
}

// Convert screen mouse/touch coordinate to (r, c)
function getGridCoord(e) {
  const rect = canvas.getBoundingClientRect();
  const clientX = e.touches ? e.touches[0].clientX : e.clientX;
  const clientY = e.touches ? e.touches[0].clientY : e.clientY;

  const x = clientX - rect.left;
  const y = clientY - rect.top;

  const col = Math.round((x - margin) / cellSize);
  const row = Math.round((y - margin) / cellSize);

  if (row >= 0 && row < boardSize && col >= 0 && col < boardSize) {
    return { r: row, c: col };
  }
  return null;
}

// --- EVENT LISTENERS ---
function setupEventListeners() {
  // Canvas Mouse & Touch
  canvas.addEventListener('mousemove', (e) => {
    const coord = getGridCoord(e);
    if (!coord && !hoverCoord) return;
    if (coord && hoverCoord && coord.r === hoverCoord.r && coord.c === hoverCoord.c) return;
    hoverCoord = coord;
    renderBoard();
  });

  canvas.addEventListener('mouseleave', () => {
    hoverCoord = null;
    renderBoard();
  });

  canvas.addEventListener('click', (e) => {
    window.goAudio.init();
    const coord = getGridCoord(e);
    if (coord) {
      handleBoardClick(coord.r, coord.c);
    }
  });

  // Touch Support
  canvas.addEventListener('touchstart', (e) => {
    window.goAudio.init();
    const coord = getGridCoord(e);
    if (coord) {
      hoverCoord = coord;
      renderBoard();
    }
  }, { passive: true });

  canvas.addEventListener('touchend', (e) => {
    if (hoverCoord) {
      handleBoardClick(hoverCoord.r, hoverCoord.c);
      hoverCoord = null;
    }
  });

  // Lobby Buttons
  if (btnStartBotGame) {
    btnStartBotGame.addEventListener('click', () => {
      window.goAudio.init();
      const size = document.querySelector('input[name="botBoardSize"]:checked')?.value || 9;
      const level = botLevelSelect.value || 1;
      const timeLimit = botTimeLimitSelect ? (parseInt(botTimeLimitSelect.value, 10) || 0) : 0;
      const name = currentUser ? currentUser.username : 'ผู้เล่น';

      socket.emit('start_bot_game', {
        size: parseInt(size, 10),
        botLevel: parseInt(level, 10),
        timeLimit,
        playerName: name
      });
    });
  }

  btnCreateRoom.addEventListener('click', () => {
    window.goAudio.init();
    const size = document.querySelector('input[name="boardSize"]:checked')?.value || 9;
    const name = currentUser ? currentUser.username : 'ผู้เล่น 1';
    const timeLimit = parseInt(timeLimitSelect.value, 10) || 0;

    socket.emit('create_room', { size: parseInt(size, 10), playerName: name, timeLimit });
  });

  btnJoinRoom.addEventListener('click', () => {
    window.goAudio.init();
    const roomId = joinRoomCode.value.trim().toUpperCase();
    const name = currentUser ? currentUser.username : 'ผู้เล่น 2';

    if (!roomId) {
      showToast('กรุณากรอกรหัสห้อง 6 ตัวอักษร');
      return;
    }

    socket.emit('join_room', { roomId, playerName: name });
  });

  // Action Buttons
  btnPass.addEventListener('click', () => {
    window.goAudio.init();
    if (!currentRoomId) return;
    socket.emit('pass_turn', { roomId: currentRoomId });
  });

  btnUndo.addEventListener('click', () => {
    if (!currentRoomId) return;
    socket.emit('request_undo', { roomId: currentRoomId });
    showToast('ส่งคำขอย้อนหมากไปยังอีกฝ่ายแล้ว...');
  });

  btnResign.addEventListener('click', () => {
    if (confirm('คุณแน่ใจหรือไม่ว่าต้องการยอมแพ้ในเกมนี้?')) {
      socket.emit('resign', { roomId: currentRoomId });
    }
  });

  btnRestart.addEventListener('click', () => {
    if (confirm('ต้องการเริ่มเล่นเกมใหม่หรือไม่?')) {
      if (roomState && roomState.isBotGame) {
        // Direct restart for bot game
        socket.emit('start_bot_game', {
          size: roomState.size || 9,
          botLevel: roomState.botLevel || 1,
          playerName: currentUser ? currentUser.username : (roomState.black?.name || 'ผู้เล่น')
        });
      } else {
        socket.emit('restart_game', { roomId: currentRoomId });
      }
    }
  });

  btnLeaveRoom.addEventListener('click', () => {
    if (confirm('ต้องการออกจากห้องและกลับไปยังหน้าหลักหรือไม่?')) {
      window.location.href = window.location.pathname;
    }
  });

  // Share Modal
  btnShareModal.addEventListener('click', () => {
    if (shareRoomCodeDisplay) shareRoomCodeDisplay.innerText = currentRoomId || '------';
    shareModal.style.display = 'flex';
  });

  btnCloseShareModal.addEventListener('click', () => {
    shareModal.style.display = 'none';
  });

  if (btnCopyRoomCode) {
    btnCopyRoomCode.addEventListener('click', () => {
      if (!currentRoomId) return;
      navigator.clipboard.writeText(currentRoomId).then(() => {
        showToast(`📋 คัดลอกรหัสห้อง "${currentRoomId}" เรียบร้อยแล้ว!`);
      }).catch(() => {
        showToast(`รหัสห้อง: ${currentRoomId}`);
      });
    });
  }

  if (btnCopyShareLink) {
    btnCopyShareLink.addEventListener('click', () => {
      const inviteUrl = `${window.location.origin}${window.location.pathname}?room=${currentRoomId}`;
      navigator.clipboard.writeText(inviteUrl).then(() => {
        showToast('🔗 คัดลอกลิงก์เต็มเรียบร้อยแล้ว!');
      }).catch(() => {
        showToast('คัดลอกลิงก์เรียบร้อย');
      });
    });
  }

  // Game Over Modal
  btnCloseGameOverModal.addEventListener('click', () => {
    gameOverModal.style.display = 'none';
  });

  btnPlayAgain.addEventListener('click', () => {
    gameOverModal.style.display = 'none';
    socket.emit('restart_game', { roomId: currentRoomId });
  });

  // Bot Taunt Modal Listeners
  if (btnCloseTauntModal) {
    btnCloseTauntModal.addEventListener('click', () => {
      botTauntModal.style.display = 'none';
    });
  }

  if (btnTauntRematch) {
    btnTauntRematch.addEventListener('click', () => {
      botTauntModal.style.display = 'none';
      socket.emit('restart_game', { roomId: currentRoomId });
    });
  }

  if (btnTauntReview) {
    btnTauntReview.addEventListener('click', () => {
      botTauntModal.style.display = 'none';
      if (typeof openHistoryModal === 'function') {
        openHistoryModal();
      }
    });
  }

  // Undo Modal
  btnAcceptUndo.addEventListener('click', () => {
    socket.emit('respond_undo', { roomId: currentRoomId, accepted: true });
    undoModal.style.display = 'none';
  });

  btnRejectUndo.addEventListener('click', () => {
    socket.emit('respond_undo', { roomId: currentRoomId, accepted: false });
    undoModal.style.display = 'none';
  });

  // Quiz Dock Listeners
  document.querySelectorAll('.tactic-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      document.querySelectorAll('.tactic-chip').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      selectedQuizTactic = chip.getAttribute('data-tactic');
    });
  });

  if (btnSubmitQuiz) {
    btnSubmitQuiz.addEventListener('click', () => {
      const explanation = quizExplanationInput.value.trim();
      socket.emit('submit_quiz_explanation', {
        roomId: currentRoomId,
        explanation,
        selectedTactic: selectedQuizTactic
      });
    });
  }

  if (btnCloseQuizDock) {
    btnCloseQuizDock.addEventListener('click', () => {
      if (boardQuizDock) boardQuizDock.style.display = 'none';
    });
  }

  // Top Alert Close Listener
  if (btnCloseTopAlert) {
    btnCloseTopAlert.addEventListener('click', () => {
      if (boardTopAlert) boardTopAlert.style.display = 'none';
    });
  }

  // Chat
  btnSendChat.addEventListener('click', sendChatMessage);
  chatInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') sendChatMessage();
  });

  // Quick Emoji Buttons
  document.querySelectorAll('.emoji-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      window.goAudio.init();
      const emoji = btn.getAttribute('data-emoji');
      if (currentRoomId && emoji) {
        socket.emit('send_message', { roomId: currentRoomId, text: emoji, type: 'emoji' });
        spawnFloatingEmoji(emoji);
      }
    });
  });

  // --- Mandatory Gate Auth Listeners ---
  if (gateTabLogin) {
    gateTabLogin.addEventListener('click', () => switchGateTab('login'));
  }

  if (gateTabRegister) {
    gateTabRegister.addEventListener('click', () => switchGateTab('register'));
  }

  if (gateAuthForm) {
    gateAuthForm.addEventListener('submit', handleGateSubmit);
  }

  if (btnLogout) {
    btnLogout.addEventListener('click', handleLogout);
  }

  // --- History Event Listeners ---
  if (btnOpenHistory) {
    btnOpenHistory.addEventListener('click', openHistoryModal);
  }

  if (btnCloseHistoryModal) {
    btnCloseHistoryModal.addEventListener('click', () => {
      historyModal.style.display = 'none';
    });
  }

  // --- Replay Event Listeners ---
  if (btnCloseReplayModal) {
    btnCloseReplayModal.addEventListener('click', closeReplayModal);
  }

  if (replaySlider) {
    replaySlider.addEventListener('input', (e) => {
      replayStep = parseInt(e.target.value, 10) || 0;
      renderReplay();
    });
  }

  if (btnReplayFirst) {
    btnReplayFirst.addEventListener('click', () => {
      replayStep = 0;
      renderReplay();
    });
  }

  if (btnReplayPrev) {
    btnReplayPrev.addEventListener('click', () => {
      if (replayStep > 0) {
        replayStep--;
        renderReplay();
      }
    });
  }

  if (btnReplayNext) {
    btnReplayNext.addEventListener('click', () => {
      const max = (activeReplay?.moves || []).length;
      if (replayStep < max) {
        replayStep++;
        renderReplay();
      }
    });
  }

  if (btnReplayLast) {
    btnReplayLast.addEventListener('click', () => {
      replayStep = (activeReplay?.moves || []).length;
      renderReplay();
    });
  }

  if (btnReplayAuto) {
    btnReplayAuto.addEventListener('click', toggleReplayAuto);
  }

  // Keyboard navigation for Replay
  window.addEventListener('keydown', (e) => {
    if (replayModal && replayModal.style.display === 'flex') {
      if (e.key === 'ArrowLeft') {
        if (replayStep > 0) {
          replayStep--;
          renderReplay();
        }
      } else if (e.key === 'ArrowRight') {
        const max = (activeReplay?.moves || []).length;
        if (replayStep < max) {
          replayStep++;
          renderReplay();
        }
      } else if (e.key === ' ' && document.activeElement !== chatInput) {
        e.preventDefault();
        toggleReplayAuto();
      } else if (e.key === 'Escape') {
        closeReplayModal();
      }
    }
  });
}

// --- AUTHENTICATION & SESSIONS ---
async function checkAuth() {
  const token = localStorage.getItem(TOKEN_KEY);
  if (!token) {
    currentUser = null;
    renderUserBar();
    return;
  }

  try {
    const res = await fetch('/api/me', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const data = await res.json();
    if (data.success) {
      currentUser = data.user;
      renderUserBar();
      socket.emit('auth_session', { token });
    } else {
      localStorage.removeItem(TOKEN_KEY);
      currentUser = null;
      renderUserBar();
    }
  } catch (err) {
    console.error('Auth check error:', err);
  }
}

function renderUserBar() {
  const accountPlayerNames = document.querySelectorAll('.account-player-name');
  if (currentUser) {
    if (authGateView) authGateView.style.display = 'none';
    if (lobbyView && gameView.style.display !== 'flex') lobbyView.style.display = 'block';
    if (currentUserName) currentUserName.innerText = currentUser.username;
    accountPlayerNames.forEach(el => el.innerText = currentUser.username);
  } else {
    if (authGateView) authGateView.style.display = 'flex';
    if (lobbyView) lobbyView.style.display = 'none';
    if (gameView) gameView.style.display = 'none';
  }
}

function switchGateTab(mode) {
  gateMode = mode;
  if (mode === 'login') {
    gateTabLogin.classList.add('active');
    gateTabRegister.classList.remove('active');
    btnGateSubmit.innerText = 'เข้าสู่ระบบและเริ่มเล่น';
    gateNoteText.innerText = '🔒 เข้าสู่ระบบเพื่อบันทึกประวัติการแข่งและดูรีเพลย์ย้อนหลังเฉพาะบัญชีของคุณ 100%';
  } else {
    gateTabRegister.classList.add('active');
    gateTabLogin.classList.remove('active');
    btnGateSubmit.innerText = 'สมัครสมาชิกและเริ่มเล่น';
    gateNoteText.innerText = '✨ สมัครสมาชิกใหม่ ตรวจสอบชื่อไม่ให้ซ้ำ และบันทึกประวัติการแข่งขันแยกเฉพาะบัญชีคุณ 100%';
  }
  gateErrorMessage.style.display = 'none';
}

async function handleGateSubmit(e) {
  if (e) e.preventDefault();
  const username = gateUsername.value.trim();
  const password = gatePassword.value;

  gateErrorMessage.style.display = 'none';
  gateErrorMessage.innerText = '';

  if (!username || !password) {
    gateErrorMessage.innerText = 'กรุณากรอกชื่อผู้ใช้และรหัสผ่านให้ครบถ้วน';
    gateErrorMessage.style.display = 'block';
    return;
  }

  const endpoint = gateMode === 'register' ? '/api/register' : '/api/login';
  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    const data = await res.json();
    if (data.success) {
      localStorage.setItem(TOKEN_KEY, data.token);
      currentUser = data.user;
      renderUserBar();
      socket.emit('auth_session', { token: data.token });
      gatePassword.value = '';
      showToast(gateMode === 'register' ? `🎉 สมัครสมาชิกสำเร็จ! ยินดีต้อนรับคุณ ${currentUser.username}` : `👋 เข้าสู่ระบบสำเร็จ! ยินดีต้อนรับกลับคุณ ${currentUser.username}`);
    } else {
      gateErrorMessage.innerHTML = data.message || 'เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง';
      if (gateMode === 'login' && data.message && data.message.includes('สมัครสมาชิกใหม่')) {
        gateErrorMessage.innerHTML += `<br><a href="#" id="linkSwitchRegister" style="color: #fde047; font-weight: 700; text-decoration: underline; display: inline-block; margin-top: 0.35rem;">👉 คลิกตรงนี้เพื่อสมัครสมาชิกชื่อ "${username}" ทันที</a>`;
        const link = document.getElementById('linkSwitchRegister');
        if (link) {
          link.addEventListener('click', (ev) => {
            ev.preventDefault();
            switchGateTab('register');
          });
        }
      }
      gateErrorMessage.style.display = 'block';
    }
  } catch (err) {
    gateErrorMessage.innerText = 'เชื่อมต่อเซิร์ฟเวอร์ไม่สำเร็จ กรุณาลองใหม่';
    gateErrorMessage.style.display = 'block';
  }
}

async function handleLogout() {
  const token = localStorage.getItem(TOKEN_KEY);
  if (token) {
    try {
      await fetch('/api/logout', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });
    } catch (e) {}
  }
  localStorage.removeItem(TOKEN_KEY);
  currentUser = null;
  renderUserBar();
  showToast('ออกจากระบบเรียบร้อยแล้ว');
}

// --- MATCH HISTORY ---
async function openHistoryModal() {
  if (!currentUser) {
    showToast('กรุณาเข้าสู่ระบบเพื่อดูประวัติการแข่งขันของคุณ');
    renderUserBar();
    return;
  }

  historyModal.style.display = 'flex';
  historyListContainer.innerHTML = '<div style="text-align: center; padding: 2.5rem; color: var(--text-secondary);">กำลังโหลดประวัติ...</div>';

  try {
    const token = localStorage.getItem(TOKEN_KEY);
    // 1. Fetch user stats
    const meRes = await fetch('/api/me', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const meData = await meRes.json();
    if (meData.success && meData.stats) {
      statTotalGames.innerText = meData.stats.totalGames;
      statWins.innerText = meData.stats.wins;
      statLosses.innerText = meData.stats.losses;
      statWinRate.innerText = `${meData.stats.winRate}%`;
    }

    // 2. Fetch user games
    const histRes = await fetch('/api/history', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const histData = await histRes.json();

    if (!histData.success || !histData.games || histData.games.length === 0) {
      historyListContainer.innerHTML = `
        <div style="text-align: center; padding: 3rem 1rem; color: var(--text-secondary);">
          <div style="font-size: 2.5rem; margin-bottom: 0.5rem;">📜</div>
          <div style="font-size: 1.05rem; font-weight: 600; color: var(--text-primary); margin-bottom: 0.3rem;">ยังไม่มีประวัติการเล่น</div>
          <p style="font-size: 0.85rem;">เมื่อคุณเล่นจบเกมกับบ็อตหรือเพื่อน ระบบจะบันทึกประวัติการเดินหมากทุกก้าวไว้ที่นี่ให้คุณโดยอัตโนมัติ</p>
        </div>
      `;
      return;
    }

    historyListContainer.innerHTML = '';
    histData.games.forEach(game => {
      const card = document.createElement('div');
      card.className = 'history-card';

      const dateStr = new Date(game.date).toLocaleDateString('th-TH', {
        day: 'numeric',
        month: 'short',
        year: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
      });

      const isWin = game.isWinner;
      const badgeResult = isWin 
        ? `<span class="badge-win">🟢 ชนะ</span>`
        : (game.winner ? `<span class="badge-loss">🔴 แพ้</span>` : `<span class="badge-draw">⚪ เสมอ</span>`);

      const modeBadge = game.isBotGame
        ? `<span class="badge-mode">🤖 ซ้อมกับบ็อต ${game.botLevel ? `(ระดับ ${game.botLevel})` : ''}</span>`
        : `<span class="badge-mode" style="color: #60a5fa; border-color: rgba(96, 165, 250, 0.4); background: rgba(59, 130, 246, 0.15);">⚔️ แข่งกับผู้เล่น</span>`;

      const opponentName = game.myColor === 1 ? (game.whitePlayer?.name || 'สีขาว') : (game.blackPlayer?.name || 'สีดำ');
      const myColorName = game.myColor === 1 ? 'หมากดำ ⚫' : 'หมากขาว ⚪';

      card.innerHTML = `
        <div class="history-card-left">
          <div class="history-tags-row">
            ${badgeResult}
            ${modeBadge}
            <span class="badge-size">${game.size}×${game.size}</span>
            <span style="font-size: 0.78rem; color: var(--text-secondary); margin-left: auto;">${dateStr}</span>
          </div>
          <div class="history-match-title">
            คุณ (${myColorName}) vs ${opponentName}
          </div>
          <div class="history-match-sub">
            ${game.winReason || 'จบเกม'} • เดินทั้งหมด ${game.totalMoves} ตา
          </div>
        </div>
        <div>
          <button class="btn-view-replay" data-game-id="${game.id}">
            🔍 ดูรีเพลย์ & แท็กติก
          </button>
        </div>
      `;

      card.querySelector('.btn-view-replay').addEventListener('click', () => {
        loadAndOpenReplay(game.id);
      });

      historyListContainer.appendChild(card);
    });

  } catch (err) {
    console.error('Fetch history error:', err);
    historyListContainer.innerHTML = '<div style="color: #fca5a5; padding: 2rem; text-align: center;">เกิดข้อผิดพลาดในการโหลดประวัติ</div>';
  }
}

// --- INTERACTIVE REPLAY REVIEWER ---
async function loadAndOpenReplay(gameId) {
  const token = localStorage.getItem(TOKEN_KEY);
  try {
    const res = await fetch(`/api/games/${gameId}`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const data = await res.json();
    if (!data.success || !data.game) {
      showToast(data.message || 'ไม่สามารถเปิดรีเพลย์เกมนี้ได้');
      return;
    }

    activeReplay = data.game;
    replayStep = 0;
    if (replayAutoTimer) {
      clearInterval(replayAutoTimer);
      replayAutoTimer = null;
      btnReplayAuto.innerText = '▶️ เล่น';
    }

    // Set header info
    const modeName = activeReplay.isBotGame
      ? `🤖 AI ฝึกซ้อม ${activeReplay.botLevel ? `(ระดับ ${activeReplay.botLevel})` : ''}`
      : '⚔️ แข่งขันระหว่างผู้เล่น';
    replayModeBadge.innerText = modeName;
    replaySizeBadge.innerText = `${activeReplay.size}×${activeReplay.size}`;

    const dateStr = new Date(activeReplay.date).toLocaleDateString('th-TH', {
      day: 'numeric',
      month: 'short',
      year: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });
    replayDateText.innerText = dateStr;

    replayPlayersText.innerText = `⚫ ${activeReplay.blackPlayer?.name || 'หมากดำ'} vs ⚪ ${activeReplay.whitePlayer?.name || 'หมากขาว'}`;
    replayResultText.innerText = `🏆 ผล: ${activeReplay.winReason || 'จบเกม'}`;

    // Setup slider
    const totalMoves = (activeReplay.moves || []).length;
    replaySlider.min = 0;
    replaySlider.max = totalMoves;
    replaySlider.value = 0;

    // Show modal & setup canvas
    replayModal.style.display = 'flex';
    setupReplayCanvas();
    renderReplay();

  } catch (err) {
    console.error('Error loading replay:', err);
    showToast('โหลดรีเพลย์ไม่สำเร็จ');
  }
}

function closeReplayModal() {
  if (replayAutoTimer) {
    clearInterval(replayAutoTimer);
    replayAutoTimer = null;
  }
  if (replayModal) replayModal.style.display = 'none';
}

function toggleReplayAuto() {
  if (replayAutoTimer) {
    clearInterval(replayAutoTimer);
    replayAutoTimer = null;
    btnReplayAuto.innerText = '▶️ เล่น';
  } else {
    const max = (activeReplay?.moves || []).length;
    if (replayStep >= max) replayStep = 0;
    btnReplayAuto.innerText = '⏸️ หยุด';
    replayAutoTimer = setInterval(() => {
      const total = (activeReplay?.moves || []).length;
      if (replayStep < total) {
        replayStep++;
        renderReplay();
      } else {
        clearInterval(replayAutoTimer);
        replayAutoTimer = null;
        btnReplayAuto.innerText = '▶️ เล่น';
      }
    }, 1200);
  }
}

function setupReplayCanvas() {
  if (!replayCanvas) return;
  const isMobile = window.innerWidth < 600;
  replayCanvasSize = isMobile ? Math.min(window.innerWidth - 60, 320) : 400;

  const dpr = window.devicePixelRatio || 1;
  replayCanvas.width = replayCanvasSize * dpr;
  replayCanvas.height = replayCanvasSize * dpr;
  replayCanvas.style.width = replayCanvasSize + 'px';
  replayCanvas.style.height = replayCanvasSize + 'px';

  replayCtx.setTransform(dpr, 0, 0, dpr, 0, 0);

  const bSize = activeReplay?.size || 9;
  replayMargin = Math.max(22, Math.floor(replayCanvasSize * 0.07));
  replayCellSize = (replayCanvasSize - replayMargin * 2) / (bSize - 1);
}

function renderReplay() {
  if (!replayCtx || !activeReplay) return;
  const bSize = activeReplay.size || 9;
  const totalMoves = (activeReplay.moves || []).length;

  replayStepDisplay.innerText = `ก้าวที่ ${replayStep} / ${totalMoves}`;
  replaySlider.value = replayStep;

  replayCtx.clearRect(0, 0, replayCanvasSize, replayCanvasSize);

  // 1. Grid lines
  replayCtx.strokeStyle = '#3d2511';
  replayCtx.lineWidth = 1.2;

  for (let i = 0; i < bSize; i++) {
    const p = replayMargin + i * replayCellSize;

    // Horizontal
    replayCtx.beginPath();
    replayCtx.moveTo(replayMargin, p);
    replayCtx.lineTo(replayCanvasSize - replayMargin, p);
    replayCtx.stroke();

    // Vertical
    replayCtx.beginPath();
    replayCtx.moveTo(p, replayMargin);
    replayCtx.lineTo(p, replayCanvasSize - replayMargin);
    replayCtx.stroke();
  }

  // 2. Coordinate labels
  replayCtx.fillStyle = '#5c3818';
  replayCtx.font = `600 ${Math.max(9, Math.floor(replayCellSize * 0.32))}px Prompt, sans-serif`;
  replayCtx.textAlign = 'center';
  replayCtx.textBaseline = 'middle';

  for (let i = 0; i < bSize; i++) {
    const pos = replayMargin + i * replayCellSize;
    const colName = COORD_LETTERS[i];
    const rowName = bSize - i;

    replayCtx.fillText(colName, pos, replayMargin * 0.45);
    replayCtx.fillText(colName, pos, replayCanvasSize - replayMargin * 0.45);
    replayCtx.fillText(rowName, replayMargin * 0.45, pos);
    replayCtx.fillText(rowName, replayCanvasSize - replayMargin * 0.45, pos);
  }

  // 3. Star points (Hoshi)
  const hoshi = STAR_POINTS[bSize] || [];
  replayCtx.fillStyle = '#3d2511';
  const hoshiRadius = Math.max(2.5, replayCellSize * 0.085);
  for (const [r, c] of hoshi) {
    const x = replayMargin + c * replayCellSize;
    const y = replayMargin + r * replayCellSize;
    replayCtx.beginPath();
    replayCtx.arc(x, y, hoshiRadius, 0, Math.PI * 2);
    replayCtx.fill();
  }

  // 4. Board State at step
  let currentBoard = null;
  let currentMove = null;

  if (replayStep === 0) {
    currentBoard = Array.from({ length: bSize }, () => Array(bSize).fill(0));
  } else {
    currentMove = activeReplay.moves[replayStep - 1];
    currentBoard = currentMove?.boardState;
  }

  const radius = replayCellSize * 0.46;

  if (currentBoard) {
    for (let r = 0; r < bSize; r++) {
      for (let c = 0; c < bSize; c++) {
        const stone = currentBoard[r][c];
        if (stone === 1 || stone === 2) {
          const x = replayMargin + c * replayCellSize;
          const y = replayMargin + r * replayCellSize;
          drawStone(x, y, radius, stone, replayCtx);
        }
      }
    }
  }

  // 5. Highlight current move and captures
  if (currentMove && !currentMove.pass && currentMove.r !== undefined) {
    const x = replayMargin + currentMove.c * replayCellSize;
    const y = replayMargin + currentMove.r * replayCellSize;

    // Glowing marker for last placed stone
    replayCtx.beginPath();
    replayCtx.arc(x, y, radius * 0.28, 0, Math.PI * 2);
    replayCtx.fillStyle = currentMove.player === 1 ? '#ef4444' : '#3b82f6';
    replayCtx.fill();
    replayCtx.strokeStyle = '#ffffff';
    replayCtx.lineWidth = 1.5;
    replayCtx.stroke();

    // If stones were captured on this move, highlight captured locations
    if (currentMove.capturedStones && currentMove.capturedStones.length > 0) {
      replayCtx.save();
      for (const st of currentMove.capturedStones) {
        const cx = replayMargin + st.c * replayCellSize;
        const cy = replayMargin + st.r * replayCellSize;

        // Red dashed ring
        replayCtx.beginPath();
        replayCtx.arc(cx, cy, radius * 0.72, 0, Math.PI * 2);
        replayCtx.strokeStyle = '#ef4444';
        replayCtx.lineWidth = 2.5;
        replayCtx.setLineDash([4, 4]);
        replayCtx.stroke();

        // X mark
        replayCtx.strokeStyle = '#ef4444';
        replayCtx.lineWidth = 2;
        replayCtx.beginPath();
        replayCtx.moveTo(cx - radius * 0.35, cy - radius * 0.35);
        replayCtx.lineTo(cx + radius * 0.35, cy + radius * 0.35);
        replayCtx.moveTo(cx + radius * 0.35, cy - radius * 0.35);
        replayCtx.lineTo(cx - radius * 0.35, cy + radius * 0.35);
        replayCtx.stroke();
      }
      replayCtx.restore();
    }
  }

  // 6. Update Tactical Review Card
  updateReplayTacticalCard(currentMove);
}

function updateReplayTacticalCard(move) {
  if (!move) {
    replayTacticTitle.innerText = 'จุดเริ่มต้นเกม (กระดานว่าง)';
    replayTacticBadge.style.display = 'none';
    replayTacticDesc.innerText = 'กดปุ่ม "ถัดไป ▶️" หรือเลื่อนแถบเพื่อดูการเดินหมากย้อนหลังทีละก้าว';
    replayCoachTip.style.display = 'none';
    return;
  }

  const playerName = move.player === 1 ? 'หมากดำ ⚫' : 'หมากขาว ⚪';
  const posName = move.pass ? 'กดผ่าน (Pass)' : `${COORD_LETTERS[move.c]}${activeReplay.size - move.r}`;

  if (move.tacticAnalysis && move.captured > 0) {
    const analysis = move.tacticAnalysis;
    replayTacticTitle.innerText = `🎯 ${playerName} กินหมาก (${move.captured} เม็ด)`;
    replayTacticBadge.innerText = analysis.title || 'แท็กติก';
    replayTacticBadge.style.display = 'inline-block';
    replayTacticDesc.innerHTML = `<b>ตำแหน่งที่วาง:</b> ${posName}<br><b>กินเพราะอะไร:</b> ${analysis.explanation}`;
    if (analysis.competitionTip) {
      replayCoachTip.innerHTML = `<b>💡 คำแนะนำสำหรับการแข่ง:</b><br>${analysis.competitionTip}`;
      replayCoachTip.style.display = 'block';
    } else {
      replayCoachTip.style.display = 'none';
    }
  } else if (move.pass) {
    replayTacticTitle.innerText = `⏸️ ${playerName} ผ่าน (Pass)`;
    replayTacticBadge.style.display = 'none';
    replayTacticDesc.innerText = 'ผู้เล่นประเมินว่าไม่มีจุดวางหมากที่คุ้มค่าแล้ว จึงเลือกผ่าน';
    replayCoachTip.style.display = 'none';
  } else {
    replayTacticTitle.innerText = `📍 ${playerName} เดินที่ ${posName}`;
    replayTacticBadge.style.display = 'none';
    replayTacticDesc.innerText = `วางหมากเดินเกมขยายพื้นที่และป้องกันรูปทรง`;
    replayCoachTip.style.display = 'none';
  }
}

function handleBoardClick(r, c) {
  if (!currentRoomId || !roomState) return;

  if (myRole !== 1 && myRole !== 2) {
    showToast('คุณกำลังรับชมเกมในฐานะผู้ชม');
    return;
  }

  if (roomState.game.turn !== myRole) {
    showToast('ยังไม่ใช่ตาของคุณ รออีกฝ่ายวางก่อนนะ');
    return;
  }

  socket.emit('play_move', { roomId: currentRoomId, r, c });
}

function sendChatMessage() {
  const text = chatInput.value.trim();
  if (!text || !currentRoomId) return;

  socket.emit('send_message', { roomId: currentRoomId, text, type: 'chat' });
  chatInput.value = '';
}

function addChatMessage(msg) {
  const div = document.createElement('div');
  if (msg.type === 'emoji') {
    div.className = 'chat-msg emoji-burst';
    div.innerHTML = `<span class="sender" style="font-size:0.85rem; display:block; color:var(--text-secondary);">${msg.sender}:</span> ${msg.text}`;
    spawnFloatingEmoji(msg.text);
    window.goAudio.playEmoji();
  } else if (msg.type === 'system') {
    div.className = 'chat-msg system';
    div.innerText = msg.text;
  } else {
    div.className = 'chat-msg';
    const colorStyle = msg.senderColor === 'black' ? 'color:#a5b4fc;' : (msg.senderColor === 'white' ? 'color:#fbcfe8;' : '');
    div.innerHTML = `<span class="sender" style="${colorStyle}">${msg.sender} (${msg.time}):</span> <span>${escapeHtml(msg.text)}</span>`;
  }
  chatMessages.appendChild(div);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.innerText = text;
  return div.innerHTML;
}

// --- SYNC UI WITH STATE ---
function updateRoomUI(state) {
  roomState = state;
  boardSize = state.size || 9;
  setupCanvas();

  displayRoomId.innerText = state.id;

  // Players
  if (state.black) {
    blackPlayerName.innerText = state.black.name;
  } else {
    blackPlayerName.innerText = 'กำลังรอ...';
  }

  if (state.white) {
    whitePlayerName.innerText = state.white.name;
  } else {
    whitePlayerName.innerText = 'กำลังรอผู้เล่นหมากขาว...';
  }

  // Turn active highlight
  const currentTurn = state.game.turn; // 1 or 2
  if (currentTurn === 1) {
    blackPlayerCard.classList.add('active-turn');
    whitePlayerCard.classList.remove('active-turn');
  } else {
    whitePlayerCard.classList.add('active-turn');
    blackPlayerCard.classList.remove('active-turn');
  }

  // Captures
  blackCaptures.innerText = `กินได้: ${state.game.captures[1] || 0}`;
  whiteCaptures.innerText = `กินได้: ${state.game.captures[2] || 0}`;
  komiValue.innerText = `+${state.game.komi}`;

  // Role Indicator
  if (myRole === 1) {
    roleIndicator.innerHTML = 'คุณเป็น: <b style="color:#fff;">หมากดำ ⚫</b>';
  } else if (myRole === 2) {
    roleIndicator.innerHTML = 'คุณเป็น: <b style="color:#fff;">หมากขาว ⚪</b>';
  } else {
    roleIndicator.innerHTML = 'คุณเป็น: <b>ผู้ชม 👁️</b>';
  }

  // Status Banner
  if (state.game.isGameOver) {
    gameStatusBanner.innerText = `จบเกม: ${state.game.winReason}`;
    gameStatusBanner.style.color = 'var(--accent-gold)';
  } else if (!state.white) {
    gameStatusBanner.innerText = 'รอเพื่อนหรือแฟนเข้าร่วมห้อง...';
    gameStatusBanner.style.color = 'var(--accent-pink)';
  } else {
    const isMyTurn = state.game.turn === myRole;
    if (isMyTurn) {
      gameStatusBanner.innerText = '✨ ตาของคุณแล้ว วางหมากได้เลย!';
      gameStatusBanner.style.color = 'var(--accent-gold)';
    } else {
      const turnName = state.game.turn === 1 ? (state.black?.name || 'หมากดำ') : (state.white?.name || 'หมากขาว');
      gameStatusBanner.innerText = `กำลังรอตาของ ${turnName}...`;
      gameStatusBanner.style.color = 'var(--text-secondary)';
    }
  }

  // Bot Coach Banner
  if (state.isBotGame) {
    if (coachBanner) coachBanner.style.display = 'block';
    if (btnShareModal) btnShareModal.style.display = 'none';
    if (coachBannerContent && !coachBannerContent.innerText) {
      coachBannerContent.innerHTML = `🥋 ยินดีต้อนรับสู่โหมดซ้อมแข่ง! คุณกำลังประลองกับ <b>${state.white?.name}</b> ทุกครั้งที่มีการกินหมาก โค้ชจะช่วยวิเคราะห์แท็กติกให้คุณ`;
    }
  } else {
    if (coachBanner) coachBanner.style.display = 'none';
    if (btnShareModal) btnShareModal.style.display = 'inline-flex';
  }

  // Timers
  if (state.timers) {
    blackTimer.innerText = formatTime(state.timers[1]);
    whiteTimer.innerText = formatTime(state.timers[2]);
  }

  renderBoard();
}

// Switch between Lobby and Game screen
function enterGameView() {
  lobbyView.style.display = 'none';
  gameView.style.display = 'flex';
  setupCanvas();
}

// --- SOCKET.IO EVENT HANDLERS ---
socket.on('room_created', (data) => {
  currentRoomId = data.roomId;
  myRole = data.role;
  enterGameView();
  updateRoomUI(data.room);
  showToast(`เข้าห้อง ${data.roomId} สำเร็จแล้ว!`);
  // Automatically show share modal only on human multiplayer room
  if (!data.room.isBotGame) {
    btnShareModal.click();
  }
});

socket.on('room_joined', (data) => {
  currentRoomId = data.roomId;
  myRole = data.role;
  enterGameView();
  updateRoomUI(data.room);
  showToast(`เข้าห้อง ${data.roomId} เรียบร้อยแล้ว!`);
});

socket.on('join_error', (data) => {
  showToast(`⚠️ ${data.message}`);
});

socket.on('room_updated', (data) => {
  updateRoomUI(data.room);
  if (data.announcement) {
    addChatMessage({ type: 'system', text: data.announcement });
  }
});

socket.on('move_played', (data) => {
  if (data.capturedStones && data.capturedStones.length > 0) {
    recentCaptures = {
      stones: data.capturedStones,
      player: data.player,
      time: Date.now()
    };
    // Re-render over 5 seconds to animate fade
    let animCount = 0;
    const animInterval = setInterval(() => {
      renderBoard();
      animCount++;
      if (animCount > 25 || !recentCaptures || (Date.now() - recentCaptures.time >= 5000)) {
        clearInterval(animInterval);
        recentCaptures = null;
        renderBoard();
      }
    }, 200);
  }

  if (roomState) {
    roomState.game.board = data.board;
    roomState.game.turn = data.turn;
    roomState.game.captures = data.captures;
    roomState.game.lastMove = data.lastMove;
    updateRoomUI(roomState);
  }

  if (data.sound === 'capture') {
    window.goAudio.playCapture();
  } else {
    window.goAudio.playStoneClick();
  }
});

socket.on('connect', () => {
  console.log('Connected to server');
  const token = localStorage.getItem(TOKEN_KEY);
  if (token) {
    socket.emit('auth_session', { token });
  }
});

socket.on('disconnect', (reason) => {
  console.warn('Disconnected:', reason);
  showToast('🔄 เซิร์ฟเวอร์กำลังรีโหลด/อัปเดตเวอร์ชัน ระบบจะเชื่อมต่อใหม่โดยอัตโนมัติ...');
});

socket.on('move_error', (data) => {
  if (data.message && (data.message.includes('ไม่พบห้อง') || data.message.includes('not found'))) {
    showToast('⚠️ เซิร์ฟเวอร์เพิ่งอัปเดตเวอร์ชันใหม่สำเร็จ! กด "🔄 เริ่มใหม่" หรือสร้างห้องใหม่ได้เลยครับ');
  } else {
    showToast(`⚠️ ${data.message}`);
  }
});

socket.on('turn_passed', (data) => {
  window.goAudio.playPass();
  if (roomState) {
    roomState.game.turn = data.turn;
    roomState.game.consecutivePasses = data.consecutivePasses;
    updateRoomUI(roomState);
  }
  if (data.announcement) {
    addChatMessage({ type: 'system', text: data.announcement });
  }
});

socket.on('timer_update', (data) => {
  if (roomState) {
    roomState.timers = data.timers;
    blackTimer.innerText = formatTime(data.timers[1]);
    whiteTimer.innerText = formatTime(data.timers[2]);
  }
});

socket.on('game_over', (data) => {
  if (data.room) {
    updateRoomUI(data.room);
  }

  // Check if player lost to a bot (Trigger Mockery & Comfort + Meme!)
  if (data.botTaunt && (myRole === 1 || myRole === 2) && data.winner !== myRole) {
    if (window.goAudio.playBotTaunt) {
      window.goAudio.playBotTaunt();
    }

    if (botTauntHeadline) botTauntHeadline.innerText = data.botTaunt.headline || '💥 อ่อนว่ะ!! 55555';
    if (botTauntLevelTag) botTauntLevelTag.innerText = `🤖 ${data.botTaunt.botLevelName || 'บ็อต'}`;
    if (botTauntQuote) botTauntQuote.innerText = data.botTaunt.taunt;
    if (botComfortQuote) botComfortQuote.innerText = data.botTaunt.comfort;

    if (data.botTaunt.meme && botMemeImg) {
      botMemeImg.src = data.botTaunt.meme.url;
      if (botMemeCaption) botMemeCaption.innerText = data.botTaunt.meme.caption || '';
    }

    if (gameOverModal) gameOverModal.style.display = 'none';
    if (botTauntModal) botTauntModal.style.display = 'flex';
  } else {
    window.goAudio.playWin();

    const isMeWinner = data.winner === myRole;
    if (myRole === 1 || myRole === 2) {
      modalWinnerTitle.innerText = isMeWinner ? '🎉 ยินดีด้วย คุณเป็นฝ่ายชนะ! 🎉' : 'เกมจบลงแล้ว!';
    } else {
      modalWinnerTitle.innerText = 'เกมจบลงแล้ว!';
    }
    modalWinReason.innerText = data.winReason;

    if (data.scoreResult) {
      scoreDetailsBox.style.display = 'block';
      scoreBlackDetail.innerText = `${data.scoreResult.blackTotal} แต้ม (พื้นที่ ${data.scoreResult.blackTerritory} + กินได้ ${data.scoreResult.blackCaptures})`;
      scoreWhiteDetail.innerText = `${data.scoreResult.whiteTotal} แต้ม (พื้นที่ ${data.scoreResult.whiteTerritory} + กินได้ ${data.scoreResult.whiteCaptures} + คอมิ ${data.scoreResult.komi})`;
      scoreDiffDetail.innerText = `${data.scoreResult.margin} แต้ม`;
    } else {
      scoreDetailsBox.style.display = 'none';
    }

    if (botTauntModal) botTauntModal.style.display = 'none';
    gameOverModal.style.display = 'flex';
  }

  addChatMessage({ type: 'system', text: `🏆 เกมจบแล้ว: ${data.winReason}` });
});

socket.on('undo_requested', (data) => {
  undoMessage.innerText = `${data.requesterName} ต้องการขอย้อนหมาก 1 ตา คุณยินยอมหรือไม่?`;
  undoModal.style.display = 'flex';
});

socket.on('undo_rejected', (data) => {
  showToast(data.message);
});

socket.on('undo_completed', (data) => {
  updateRoomUI(data.room);
  addChatMessage({ type: 'system', text: data.announcement });
  showToast('ย้อนหมากเรียบร้อยแล้ว');
});

socket.on('game_restarted', (data) => {
  if (gameOverModal) gameOverModal.style.display = 'none';
  if (botTauntModal) botTauntModal.style.display = 'none';
  updateRoomUI(data.room);
  addChatMessage({ type: 'system', text: data.announcement });
  showToast('เริ่มเกมใหม่เรียบร้อยแล้ว');
});

socket.on('quiz_prompt', (data) => {
  if (quizCapturedCount) quizCapturedCount.innerText = data.capturedCount;
  if (quizExplanationInput) quizExplanationInput.value = '';
  if (quizResultBox) quizResultBox.style.display = 'none';

  // Set default tactic chip matching backend guess
  document.querySelectorAll('.tactic-chip').forEach(chip => {
    if (chip.getAttribute('data-tactic') === data.analysis.tacticKey) {
      chip.classList.add('active');
      selectedQuizTactic = data.analysis.tacticKey;
    } else {
      chip.classList.remove('active');
    }
  });

  // Display dock above the board (NEVER blocks the board)
  if (boardQuizDock) {
    boardQuizDock.style.display = 'block';
  }
});

socket.on('quiz_result', (data) => {
  const stars = data.stars === 3 ? '⭐⭐⭐ ยอดเยี่ยมมาก!' : (data.stars === 2 ? '⭐⭐ ดีมาก!' : '⭐ พยายามอีกนิด!');
  if (quizStarsDisplay) quizStarsDisplay.innerText = stars;
  if (quizTacticTitle) quizTacticTitle.innerText = data.tacticTitle;
  if (quizFeedbackText) quizFeedbackText.innerText = data.feedback;
  if (quizTipText) quizTipText.innerText = data.competitionTip;
  if (quizResultBox) quizResultBox.style.display = 'block';

  if (data.stars >= 2) {
    window.goAudio.playWin();
  }

  // Update Coach banner on sidebar as well
  if (coachBannerContent) {
    coachBannerContent.innerHTML = `<b>🎯 คุณกินหมากสำเร็จ:</b> ${data.tacticTitle}<br>${data.competitionTip}`;
  }
});

socket.on('bot_captured_advice', (data) => {
  // Show non-blocking alert banner ABOVE the board (Never covers the board)
  if (boardTopAlert) {
    topAlertTitle.innerText = `คุณโดนบ็อตกินหมาก (${data.analysis.count} เม็ด)!`;
    topAlertBadge.innerText = data.analysis.title;
    topAlertExplanation.innerText = data.analysis.explanation;
    topAlertTip.innerText = data.analysis.competitionTip;
    boardTopAlert.style.display = 'flex';
  }

  // Update Coach banner on sidebar
  if (coachBannerContent) {
    coachBannerContent.innerHTML = `<b>⚠️ คุณโดนบ็อตกินหมาก:</b> ${data.analysis.title}<br>${data.analysis.competitionTip}`;
  }
});

socket.on('new_message', (data) => {
  addChatMessage(data);
});

// Boot
init();

// ========================================================
// PWA (Progressive Web App) & Mobile Installation Setup
// ========================================================
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js')
      .then((reg) => {
        console.log('[PWA] ServiceWorker registered successfully:', reg.scope);
      })
      .catch((err) => {
        console.warn('[PWA] ServiceWorker registration failed:', err);
      });
  });
}

let deferredPrompt = null;
const btnInstallPwa = document.getElementById('btnInstallPwa');
const pwaGuideModal = document.getElementById('pwaGuideModal');
const btnClosePwaGuide = document.getElementById('btnClosePwaGuide');

// Chrome, Edge, Android PWA Install Event
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e;
  if (btnInstallPwa) {
    btnInstallPwa.style.display = 'inline-flex';
  }
});

// Detect iOS Safari (not in standalone mode yet)
const isIosDevice = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
const isAlreadyStandalone = window.matchMedia('(display-mode: standalone)').matches || ('standalone' in navigator && navigator.standalone);

if (isIosDevice && !isAlreadyStandalone && btnInstallPwa) {
  btnInstallPwa.style.display = 'inline-flex';
}

if (btnInstallPwa) {
  btnInstallPwa.addEventListener('click', async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === 'accepted') {
        btnInstallPwa.style.display = 'none';
        showToast('ติดตั้งแอป Go Online สำเร็จแล้ว!', 'success');
      }
      deferredPrompt = null;
    } else {
      // Show iOS / Manual Installation guide modal
      if (pwaGuideModal) {
        pwaGuideModal.style.display = 'flex';
      }
    }
  });
}

if (btnClosePwaGuide && pwaGuideModal) {
  btnClosePwaGuide.addEventListener('click', () => {
    pwaGuideModal.style.display = 'none';
  });

  pwaGuideModal.addEventListener('click', (e) => {
    if (e.target === pwaGuideModal) {
      pwaGuideModal.style.display = 'none';
    }
  });
}

window.addEventListener('appinstalled', () => {
  if (btnInstallPwa) btnInstallPwa.style.display = 'none';
  showToast('Go Online ติดตั้งบนอุปกรณ์เรียบร้อยแล้ว!', 'success');
});
