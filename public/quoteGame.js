/**
 * Thai Quote Game Controller for Online Go Hub
 * Integrated with unified user authentication and friends system
 */

(function() {
  let videoStage = null;
  let quoteMode = 'single';
  let quoteCategory = 'all';
  let quoteDifficulty = 'mixed';

  let quoteSingleQuestions = [];
  let quoteSingleIndex = 0;
  let quoteSingleScore = 0;
  let quoteSingleStreak = 0;
  let quoteSingleMaxStreak = 0;
  let quoteSingleCorrectCount = 0;
  let quoteSingleWrongCount = 0;
  let quoteSingleStartTime = 0;
  let quoteSingleHistory = [];
  let quoteSingleTotalCorrectTime = 0;
  let currentRoundId = null;
  let currentUserId = null;
  let currentSingleDeadline = 0;

  let quoteRoom = null;
  let isQuoteHost = false;
  let quotePlayerId = sessionStorage.getItem('quote_player_id') || null;
  let quoteReconnectToken = sessionStorage.getItem('quote_reconnect_token') || null;
  let multiplayerStartTime = 0;
  let multiplayerDeadline = 0;

  let quoteTimer = null;
  let quoteTimerSec = 15;

  const qScreens = {};

  async function loadUserStats() {
    const loading = document.getElementById('qStatsLoading');
    const content = document.getElementById('qStatsContent');
    if (loading) loading.style.display = 'block';
    if (content) content.style.display = 'none';

    openQuoteModal('modalQStats');

    try {
      const username = window.currentUser?.username || '';
      const res = await fetch(`/api/quote/user/stats?userId=${encodeURIComponent(username)}`);
      const data = await res.json();
      if (data.success && data.stats) {
        const s = data.stats;
        const compEl = document.getElementById('stCompletedRounds');
        const highEl = document.getElementById('stHighScore');
        const avgEl = document.getElementById('stAvgScore');
        const accEl = document.getElementById('stAccuracy');
        const ansEl = document.getElementById('stTotalAnswered');
        const corrEl = document.getElementById('stTotalCorrect');
        const timeEl = document.getElementById('stTotalCorrectTime');
        const avgTimeEl = document.getElementById('stAvgAnswerTime');
        const bestCatEl = document.getElementById('stBestCategory');
        const winsEl = document.getElementById('stMpWins');
        const p1El = document.getElementById('stMpFirst');
        const p2El = document.getElementById('stMpSecond');
        const p3El = document.getElementById('stMpThird');

        if (compEl) compEl.innerText = s.completedRounds;
        if (highEl) highEl.innerText = `${s.highScore}/10`;
        if (avgEl) avgEl.innerText = s.avgScore.toFixed ? s.avgScore.toFixed(1) : s.avgScore;
        const acc = s.totalAnswered > 0 ? (Math.round((s.totalCorrect / s.totalAnswered) * 1000) / 10) : 0;
        if (accEl) accEl.innerText = `${acc}%`;
        if (ansEl) ansEl.innerText = `${s.totalAnswered} ข้อ`;
        if (corrEl) corrEl.innerText = `${s.totalCorrect} ข้อ`;
        if (timeEl) timeEl.innerText = `${s.totalCorrectTime} วินาที`;
        if (avgTimeEl) avgTimeEl.innerText = `${s.avgAnswerTime} วินาที`;

        if (bestCatEl) {
          if (s.bestCategory) {
            bestCatEl.innerText = `${s.bestCategory.category} (${s.bestCategory.accuracy}%)`;
          } else {
            bestCatEl.innerText = 'ยังไม่มีหมวดที่ตอบครบ 10 ข้อ';
          }
        }

        if (winsEl) winsEl.innerText = `${s.multiplayerWins} ครั้ง`;
        if (p1El) p1El.innerText = s.podiumFirst;
        if (p2El) p2El.innerText = s.podiumSecond;
        if (p3El) p3El.innerText = s.podiumThird;
      }
    } catch (err) {
      console.error('Error fetching user stats:', err);
    } finally {
      if (loading) loading.style.display = 'none';
      if (content) content.style.display = 'flex';
    }
  }

  function initQuoteGame() {
    qScreens.home = document.getElementById('qScreenHome');
    qScreens.category = document.getElementById('qScreenCategory');
    qScreens.lobby = document.getElementById('qScreenLobby');
    qScreens.game = document.getElementById('qScreenGame');
    qScreens.leaderboard = document.getElementById('qScreenLeaderboard');
    qScreens.results = document.getElementById('qScreenResults');

    if (document.getElementById('stageCanvas')) {
      videoStage = new VideoStageController('stageCanvas', 'stageVideo');
    }

    setupQuoteEvents();
    setupQuoteSocketListeners();
    loadQuoteCategories();
  }

  function switchQScreen(screenKey) {
    Object.values(qScreens).forEach(s => s && (s.style.display = 'none'));
    if (qScreens[screenKey]) {
      qScreens[screenKey].style.display = 'flex';
    }
  }

  let cachedCategories = [];
  let cachedDifficulties = [];

  function resetCategoryScreen() {
    // If quoteCategory is locked or invalid, default to 'all'
    const curCat = cachedCategories.find(c => c.id === quoteCategory);
    if (!curCat || !curCat.isUnlocked) {
      quoteCategory = 'all';
    }
    // If quoteDifficulty is locked or invalid, default to 'mixed'
    const curDiff = cachedDifficulties.find(d => d.id === quoteDifficulty);
    if (!curDiff || !curDiff.isUnlocked) {
      quoteDifficulty = 'mixed';
    }

    // Sync difficulty pills to match current quoteDifficulty variable
    document.querySelectorAll('.q-diff-pill').forEach(pill => {
      const diffId = pill.getAttribute('data-diff');
      if (diffId === quoteDifficulty) {
        pill.classList.add('active');
      } else {
        pill.classList.remove('active');
      }
    });

    // Sync category grid to match current quoteCategory variable
    document.querySelectorAll('.cat-card').forEach(card => {
      const catId = card.getAttribute('data-cat');
      if (catId === quoteCategory) {
        card.classList.add('active');
      } else {
        card.classList.remove('active');
      }
    });
  }

  window.openQuoteModal = function(id) {
    const m = document.getElementById(id);
    if (m) m.classList.add('active');
  };

  window.closeQuoteModal = function(id) {
    const m = document.getElementById(id);
    if (m) m.classList.remove('active');
  };

  async function loadQuoteCategories() {
    try {
      const res = await fetch('/api/quote/categories');
      const data = await res.json();
      if (data.success) {
        cachedCategories = data.categories || [];
        cachedDifficulties = data.difficulties || [];

        // 1. Render Category Cards
        const grid = document.getElementById('qCategoryGrid');
        if (grid && cachedCategories.length > 0) {
          grid.innerHTML = cachedCategories.map(c => {
            const isUnlocked = c.isUnlocked;
            const countLabel = isUnlocked
              ? `${c.count} ข้อ (เปิดให้เล่นได้ 🎉)`
              : `🔒 ${c.count}/10 ข้อ (รอคลิปเพิ่ม)`;
            const noteStyle = isUnlocked
              ? 'font-size:0.75rem; color:#34d399; font-weight:600;'
              : 'font-size:0.73rem; color:var(--text-secondary); opacity:0.85;';
            const cardClass = `cat-card ${c.id === quoteCategory ? 'active' : ''} ${!isUnlocked ? 'locked' : ''}`;
            return `
            <div class="${cardClass}" data-cat="${c.id}" data-unlocked="${isUnlocked}">
              <div class="cat-icon">${c.icon}</div>
              <div class="cat-name">${c.name}</div>
              <div class="cat-count" style="${noteStyle}">${countLabel}</div>
            </div>
          `;
          }).join('');

          grid.querySelectorAll('.cat-card').forEach(card => {
            card.addEventListener('click', () => {
              const isUnlocked = card.getAttribute('data-unlocked') === 'true';
              const catId = card.getAttribute('data-cat');
              const catObj = cachedCategories.find(c => c.id === catId);
              if (!isUnlocked) {
                alert(`หมวด "${catObj?.name || catId}" มีคำถามที่พร้อมเล่นจริงเพียง ${catObj?.count || 0} ข้อ (ต้องการอย่างน้อย 10 ข้อตามกติกา)\n\nระบบเปิดให้เล่นเฉพาะหมวดที่มีคำถามสมบูรณ์ครบ 10 ข้อเท่านั้น กรุณาเลือกหมวด "รวมทุกประเภท" เพื่อเริ่มเล่นครับ`);
                return;
              }
              grid.querySelectorAll('.cat-card').forEach(el => el.classList.remove('active'));
              card.classList.add('active');
              quoteCategory = catId;
            });
          });
        }

        // 2. Render Difficulty Pills
        if (cachedDifficulties.length > 0) {
          const diffPills = document.querySelectorAll('.q-diff-pill');
          diffPills.forEach(pill => {
            const diffId = pill.getAttribute('data-diff');
            const diffObj = cachedDifficulties.find(d => d.id === diffId);
            if (diffObj) {
              const isUnlocked = diffObj.isUnlocked;
              pill.setAttribute('data-unlocked', String(isUnlocked));
              if (!isUnlocked) {
                pill.classList.add('locked');
                pill.innerText = `🔒 ${diffObj.name} (${diffObj.count}/10 ข้อ)`;
              } else {
                pill.classList.remove('locked');
                pill.innerText = diffObj.name;
              }
            }
          });
        }
      }
    } catch (err) {
      console.error('Error loading categories:', err);
    }
  }

  function setupQuoteEvents() {
    // Open My Stats Modal
    document.getElementById('btnQOpenStats')?.addEventListener('click', loadUserStats);

    // Mode selection
    document.getElementById('btnQModeSingle')?.addEventListener('click', () => {
      videoStage?.unlockAudio?.();
      window.gameAudio?.initAudio?.();
      quoteMode = 'single';
      resetCategoryScreen();
      switchQScreen('category');
    });

    document.getElementById('btnQModeMulti')?.addEventListener('click', () => {
      videoStage?.unlockAudio?.();
      window.gameAudio?.initAudio?.();
      quoteMode = 'multi';
      const name = window.currentUser?.username || 'ผู้เล่น 1';
      socket.emit('quote_create_room', { hostName: name }, (res) => {
        if (res && res.success) {
          quoteRoom = res.room;
          quotePlayerId = res.playerId;
          quoteReconnectToken = res.reconnectToken;
          sessionStorage.setItem('quote_room_code', res.room.code);
          sessionStorage.setItem('quote_player_id', res.playerId);
          sessionStorage.setItem('quote_reconnect_token', res.reconnectToken);
          isQuoteHost = true;
          renderQLobby(quoteRoom);
          switchQScreen('lobby');
        } else {
          alert('ไม่สามารถสร้างห้องได้');
        }
      });
    });

    document.getElementById('btnQQuickJoin')?.addEventListener('click', () => {
      videoStage?.unlockAudio?.();
      window.gameAudio?.initAudio?.();
      const code = document.getElementById('inputQQuickCode')?.value.trim().toUpperCase();
      if (!code) return alert('กรุณากรอกรหัสห้อง');
      const name = window.currentUser?.username || 'ผู้เล่น 1';
      socket.emit('quote_join_room', { roomCode: code, username: name }, (res) => {
        if (res && res.success) {
          quoteRoom = res.room;
          quotePlayerId = res.playerId;
          quoteReconnectToken = res.reconnectToken;
          sessionStorage.setItem('quote_room_code', res.room.code);
          sessionStorage.setItem('quote_player_id', res.playerId);
          sessionStorage.setItem('quote_reconnect_token', res.reconnectToken);
          isQuoteHost = res.room.hostPlayerId === res.playerId || res.room.hostId === socket.id;
          renderQLobby(quoteRoom);
          switchQScreen('lobby');
        } else {
          alert(res?.message || 'ไม่สามารถเข้าร่วมห้องได้');
        }
      });
    });

    // Difficulty selection
    document.querySelectorAll('.q-diff-pill').forEach(pill => {
      pill.addEventListener('click', () => {
        const isUnlocked = pill.getAttribute('data-unlocked') !== 'false';
        const diffId = pill.getAttribute('data-diff');
        const diffObj = cachedDifficulties.find(d => d.id === diffId);
        if (!isUnlocked) {
          alert(`ระดับความยาก "${diffObj?.name || diffId}" มีคำถามที่พร้อมเล่นจริงเพียง ${diffObj?.count || 0} ข้อ (ต้องการอย่างน้อย 10 ข้อตามกติกา)\n\nกรุณาเลือกระดับ "รวมระดับ" เพื่อเริ่มเล่นรอบ 10 ข้อครับ`);
          return;
        }
        document.querySelectorAll('.q-diff-pill').forEach(el => el.classList.remove('active'));
        pill.classList.add('active');
        quoteDifficulty = diffId;
      });
    });

    document.getElementById('btnQBackFromCategory')?.addEventListener('click', () => switchQScreen('home'));
    document.getElementById('btnQStartSingle')?.addEventListener('click', () => {
      videoStage?.unlockAudio?.();
      window.gameAudio?.initAudio?.();
      startSingleQuoteGame();
    });

    // Lobby events
    document.getElementById('btnQCopyInvite')?.addEventListener('click', () => {
      if (!quoteRoom) return;
      const link = `${window.location.origin}?quote_room=${quoteRoom.code}`;
      navigator.clipboard.writeText(link).then(() => alert(`คัดลอกลิงก์ห้องแล้ว:\n${link}`));
    });

    document.getElementById('btnQToggleReady')?.addEventListener('click', () => {
      if (!quoteRoom) return;
      socket.emit('quote_toggle_ready', { roomCode: quoteRoom.code, playerId: quotePlayerId || socket.id });
    });

    document.getElementById('btnQLeaveRoom')?.addEventListener('click', () => {
      videoStage?.stop?.();
      stopQTimer();
      leaveMultiRoom();
      switchQScreen('home');
    });

    document.getElementById('btnQHostStart')?.addEventListener('click', () => {
      videoStage?.unlockAudio?.();
      window.gameAudio?.initAudio?.();
      if (!quoteRoom || !isQuoteHost) return;
      socket.emit('quote_start_game', { roomCode: quoteRoom.code, playerId: quotePlayerId || socket.id }, (res) => {
        if (res && !res.success) alert(res.message || 'ไม่สามารถเริ่มเกมได้');
      });
    });

    // Chat
    document.getElementById('btnQSendChat')?.addEventListener('click', sendQChat);
    document.getElementById('inputQChat')?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') sendQChat();
    });

    // Option Clicking
    document.querySelectorAll('.q-option-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const text = btn.querySelector('.opt-text')?.innerText || '';
        const choiceId = btn.getAttribute('data-choice-id') || null;
        handleQAnswer(btn, text, choiceId);
      });
    });

    // Rules & Report
    document.getElementById('btnQOpenRules')?.addEventListener('click', () => openQuoteModal('modalQHowToPlay'));
    document.getElementById('btnQReport')?.addEventListener('click', () => openQuoteModal('modalQReport'));
    document.getElementById('formQReport')?.addEventListener('submit', handleQReportSubmit);

    // Quit / Exit Game button from active game stage
    document.getElementById('btnQQuitGame')?.addEventListener('click', () => {
      if (confirm('คุณต้องการออกจากเกมและกลับสู่หน้าหลักใช่หรือไม่?')) {
        videoStage?.stop?.();
        stopQTimer();
        if (quoteMode === 'single') {
          abandonSingleGame();
        } else if (quoteMode === 'multi') {
          leaveMultiRoom();
        }
        document.body.classList.remove('quote-in-game');
        switchQScreen('home');
      }
    });

    // Results buttons
    document.getElementById('btnQPlayAgain')?.addEventListener('click', () => {
      videoStage?.unlockAudio?.();
      window.gameAudio?.initAudio?.();
      if (quoteMode === 'single') startSingleQuoteGame();
      else switchQScreen('lobby');
    });
    document.getElementById('btnQChangeCat')?.addEventListener('click', () => {
      abandonSingleGame();
      resetCategoryScreen();
      switchQScreen('category');
    });
    document.getElementById('btnQBackHome')?.addEventListener('click', () => {
      abandonSingleGame();
      leaveMultiRoom();
      switchQScreen('home');
    });
    document.getElementById('btnQShare')?.addEventListener('click', shareQuoteResult);

    // Volume Controls
    const qVolSlider = document.getElementById('qVolSlider');
    const qVolLabel = document.getElementById('qVolLabel');
    const btnQMute = document.getElementById('btnQMute');
    const btnQVolDown = document.getElementById('btnQVolDown');
    const btnQVolUp = document.getElementById('btnQVolUp');

    const updateVolUI = (vol) => {
      const pct = Math.round(vol * 100);
      if (qVolSlider) qVolSlider.value = vol;
      if (qVolLabel) qVolLabel.innerText = `${pct}%`;
      if (btnQMute) {
        if (vol === 0) btnQMute.innerText = '🔇';
        else if (vol < 0.5) btnQMute.innerText = '🔉';
        else btnQMute.innerText = '🔊';
      }
    };

    let prevVol = 1.0;
    if (videoStage) {
      updateVolUI(videoStage.getVolume());
    }

    qVolSlider?.addEventListener('input', (e) => {
      const v = parseFloat(e.target.value);
      if (videoStage) videoStage.setVolume(v);
      updateVolUI(v);
    });

    btnQMute?.addEventListener('click', () => {
      if (!videoStage) return;
      const cur = videoStage.getVolume();
      if (cur > 0) {
        prevVol = cur;
        videoStage.setVolume(0);
        updateVolUI(0);
      } else {
        const restore = prevVol > 0 ? prevVol : 1.0;
        videoStage.setVolume(restore);
        updateVolUI(restore);
      }
    });

    btnQVolDown?.addEventListener('click', () => {
      if (!videoStage) return;
      const cur = videoStage.getVolume();
      const next = Math.max(0, Math.round((cur - 0.1) * 100) / 100);
      videoStage.setVolume(next);
      updateVolUI(next);
    });

    btnQVolUp?.addEventListener('click', () => {
      if (!videoStage) return;
      const cur = videoStage.getVolume();
      const next = Math.min(1, Math.round((cur + 0.1) * 100) / 100);
      videoStage.setVolume(next);
      updateVolUI(next);
    });

    // Admin
    document.getElementById('btnOpenQAdmin')?.addEventListener('click', () => {
      loadQAdminQuestions();
      openQuoteModal('modalQAdmin');
    });
    setupQAdminControls();
  }

  function sendQChat() {
    const input = document.getElementById('inputQChat');
    const msg = input.value.trim();
    if (!msg || !quoteRoom) return;
    socket.emit('quote_send_chat', { roomCode: quoteRoom.code, message: msg });
    input.value = '';
  }

  function abandonSingleGame() {
    if (currentRoundId && currentUserId) {
      fetch('/api/quote/single/abandon', {
        method: 'POST',
        keepalive: true,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roundId: currentRoundId, userId: currentUserId })
      }).catch(() => {});
    }
    currentRoundId = null;
    document.body.classList.remove('quote-in-game');
  }

  function leaveMultiRoom() {
    if (quoteRoom) {
      socket.emit('quote_leave_room', { roomCode: quoteRoom.code, playerId: quotePlayerId || socket.id });
      sessionStorage.removeItem('quote_room_code');
      sessionStorage.removeItem('quote_player_id');
      sessionStorage.removeItem('quote_reconnect_token');
      quoteRoom = null;
      quotePlayerId = null;
      quoteReconnectToken = null;
    }
    document.body.classList.remove('quote-in-game');
  }

  // ── SINGLE PLAYER LOGIC ────────────────────────────────────
  async function startSingleQuoteGame() {
    // Client-side guard: verify category and difficulty are unlocked before making start request
    const curCat = cachedCategories.find(c => c.id === quoteCategory);
    if (quoteCategory !== 'all' && curCat && !curCat.isUnlocked) {
      alert(`หมวด "${curCat.name}" มีคำถามที่พร้อมเล่นจริงเพียง ${curCat.count} ข้อ (ต้องการอย่างน้อย 10 ข้อตามกติกา)\n\nระบบเปิดให้เล่นเฉพาะหมวดที่มีคำถามสมบูรณ์ครบ 10 ข้อเท่านั้น กรุณาเลือกหมวด "รวมทุกประเภท" เพื่อเริ่มเล่นครับ`);
      quoteCategory = 'all';
      resetCategoryScreen();
      return;
    }

    const curDiff = cachedDifficulties.find(d => d.id === quoteDifficulty);
    if (quoteDifficulty !== 'mixed' && curDiff && !curDiff.isUnlocked) {
      alert(`ระดับความยากนี้มีคำถามที่พร้อมเล่นจริงเพียง ${curDiff?.count || 0} ข้อ (ต้องการอย่างน้อย 10 ข้อตามกติกา)\n\nกรุณาเลือกระดับ "รวมระดับ" เพื่อเริ่มเล่นรอบ 10 ข้อครับ`);
      quoteDifficulty = 'mixed';
      resetCategoryScreen();
      return;
    }

    try {
      const username = window.currentUser?.username || '';
      const res = await fetch('/api/quote/single/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ category: quoteCategory, difficulty: quoteDifficulty, userId: username })
      });
      const data = await res.json();
      if (!data.success || !data.questions || data.questions.length === 0) {
        alert(data.message || 'ไม่พบคำถามพร้อมเล่นในหมวดนี้ (ต้องการอย่างน้อย 10 ข้อตามกติกา)');
        return;
      }

      currentRoundId = data.roundId;
      currentUserId = data.userId;
      quoteSingleQuestions = data.questions;
      quoteSingleIndex = 0;
      quoteSingleScore = 0;
      quoteSingleStreak = 0;
      quoteSingleMaxStreak = 0;
      quoteSingleCorrectCount = 0;
      quoteSingleWrongCount = 0;
      quoteSingleTotalCorrectTime = 0;
      quoteSingleHistory = [];

      document.body.classList.add('quote-in-game');
      switchQScreen('game');
      runSingleQ(0);
    } catch (err) {
      alert('เกิดข้อผิดพลาดในการโหลดคำถาม');
    }
  }

  function runSingleQ(index) {
    if (index >= quoteSingleQuestions.length || index >= 10) {
      finishSingleQuoteGame();
      return;
    }

    quoteSingleIndex = index;
    const q = quoteSingleQuestions[index];

    document.getElementById('qCounterText').innerText = `ข้อที่ ${index + 1}/10`;
    document.getElementById('qScoreText').innerText = `คะแนน: ${quoteSingleScore}`;
    document.getElementById('qRevealBanner').style.display = 'none';
    document.getElementById('qMultiStatusBar').style.display = 'none';

    const btns = document.querySelectorAll('.q-option-btn');
    const choices = q.choices || (q.options || []).map((opt, i) => ({ id: `opt_${i}`, text: opt }));

    btns.forEach((btn, i) => {
      btn.classList.remove('selected', 'correct', 'wrong');
      btn.disabled = true;
      const choice = choices[i];
      if (choice) {
        btn.setAttribute('data-choice-id', choice.id);
        const t = btn.querySelector('.opt-text');
        if (t) t.innerText = choice.text;
      }
    });

    const overlay = document.getElementById('qInterstitialOverlay');
    document.getElementById('qInterstitialNum').innerText = `ข้อที่ ${index + 1}/10`;
    document.getElementById('qInterstitialTitle').innerText = `เรื่อง: ${q.title}`;
    overlay.style.display = 'flex';
    window.gameAudio?.playWhoosh?.();

    setTimeout(() => {
      overlay.style.display = 'none';
      videoStage.loadQuestion(q, 'question', () => {
        btns.forEach(b => b.disabled = false);
        currentSingleDeadline = Date.now() + 15000;
        startQTimer(() => handleQAnswer(null, '', null));
      });
    }, 1500);
  }

  function startQTimer(onTimeout) {
    clearInterval(quoteTimer);
    quoteTimerSec = 15;
    quoteSingleStartTime = Date.now();

    const text = document.getElementById('qTimerText');
    const bar = document.getElementById('qTimerBarFill');
    text.innerText = '15s';
    bar.style.width = '100%';

    quoteTimer = setInterval(() => {
      quoteTimerSec--;
      text.innerText = `${quoteTimerSec}s`;
      bar.style.width = `${(quoteTimerSec / 15) * 100}%`;

      window.gameAudio?.playCountdownTick?.(quoteTimerSec <= 5);

      if (quoteTimerSec <= 0) {
        clearInterval(quoteTimer);
        if (typeof onTimeout === 'function') onTimeout();
      }
    }, 1000);
  }

  function stopQTimer() {
    clearInterval(quoteTimer);
    const bar = document.getElementById('qTimerBarFill');
    if (bar) bar.style.width = '0%';
  }

  function handleQAnswer(selectedBtn, text, choiceId) {
    if (quoteMode === 'single') {
      handleSingleQAnswer(selectedBtn, text, choiceId);
    } else {
      handleMultiQAnswer(selectedBtn, text, choiceId);
    }
  }

  async function handleSingleQAnswer(selectedBtn, text, choiceId) {
    stopQTimer();
    const btns = document.querySelectorAll('.q-option-btn');
    btns.forEach(b => b.disabled = true);
    if (selectedBtn) selectedBtn.classList.add('selected');

    const q = quoteSingleQuestions[quoteSingleIndex];
    const timeTaken = Math.min(15, Math.max(0.1, (Date.now() - quoteSingleStartTime) / 1000));
    const finalChoiceId = choiceId || selectedBtn?.getAttribute('data-choice-id') || null;

    try {
      const res = await fetch('/api/quote/single/answer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          roundId: currentRoundId,
          userId: currentUserId,
          questionId: q.id,
          choiceId: finalChoiceId,
          selectedOption: text,
          answerTimeMs: Math.round(timeTaken * 1000),
          clientDeadline: currentSingleDeadline
        })
      });
      const result = await res.json();

      if (result.isCorrect) {
        quoteSingleScore++;
        quoteSingleCorrectCount++;
        quoteSingleStreak++;
        quoteSingleTotalCorrectTime += timeTaken;
        if (quoteSingleStreak > quoteSingleMaxStreak) quoteSingleMaxStreak = quoteSingleStreak;
        if (selectedBtn) selectedBtn.classList.add('correct');
        window.gameAudio?.playDing?.();
      } else {
        quoteSingleWrongCount++;
        quoteSingleStreak = 0;
        if (selectedBtn) selectedBtn.classList.add('wrong');
        btns.forEach(b => {
          const bChoiceId = b.getAttribute('data-choice-id');
          const bText = b.querySelector('.opt-text')?.innerText;
          if (bChoiceId === result.choiceId || bText === result.correctAnswer) {
            b.classList.add('correct');
          }
        });
        window.gameAudio?.playBuzzer?.();
      }

      quoteSingleHistory.push({
        title: q.title,
        character: q.character,
        isCorrect: result.isCorrect,
        chosen: text || '(หมดเวลา)',
        correct: result.correctAnswer
      });

      const banner = document.getElementById('qRevealBanner');
      banner.className = `reveal-banner ${result.isCorrect ? 'correct' : 'wrong'}`;
      document.getElementById('qRevealHeading').innerText = result.isCorrect ? 'ถูกต้อง! 🎉' : 'ยังไม่ถูกต้อง! ❌';
      document.getElementById('qRevealQuote').innerText = `"${result.correctAnswer}"`;
      document.getElementById('qRevealExp').innerText = `${result.character} (${q.title}) - ${result.explanation || ''}`;
      banner.style.display = 'block';

      let nextRoundTriggered = false;
      let countdownSec = 9;
      let revealTimer = null;
      const countdownEl = document.getElementById('qRevealCountdown');
      const btnNext = document.getElementById('btnQNextQuestion');

      const goToNext = () => {
        if (nextRoundTriggered) return;
        nextRoundTriggered = true;
        if (revealTimer) clearInterval(revealTimer);
        videoStage.stop();
        runSingleQ(quoteSingleIndex + 1);
      };

      if (btnNext) {
        btnNext.onclick = () => goToNext();
      }

      const updateCountdown = () => {
        if (countdownEl) {
          countdownEl.innerText = `เปลี่ยนข้ออัตโนมัติใน ${countdownSec} วิ`;
        }
      };
      updateCountdown();

      revealTimer = setInterval(() => {
        countdownSec--;
        updateCountdown();
        if (countdownSec <= 0) {
          goToNext();
        }
      }, 1000);

      videoStage.loadQuestion({
        ...q,
        correctAnswer: result.correctAnswer,
        audioUrl: result.audioUrl || q.audioUrl || '',
        introAudioUrl: result.introAudioUrl || q.introAudioUrl || '',
        quoteAudioUrl: result.quoteAudioUrl || q.quoteAudioUrl || '',
        videoUrl: result.videoUrl || q.videoUrl || '',
        introVideoUrl: result.introVideoUrl || q.introVideoUrl || '',
        quoteVideoUrl: result.quoteVideoUrl || q.quoteVideoUrl || ''
      }, 'reveal', () => {
        if (countdownSec > 4) {
          countdownSec = 4;
          updateCountdown();
        }
      });

    } catch (err) {
      runSingleQ(quoteSingleIndex + 1);
    }
  }

  function finishSingleQuoteGame() {
    videoStage.stop();
    stopQTimer();

    const categoryBreakdown = {};
    for (let i = 0; i < quoteSingleHistory.length; i++) {
      const h = quoteSingleHistory[i];
      const q = quoteSingleQuestions[i];
      if (q) {
        const cat = q.category || q.mediaType || 'other';
        if (!categoryBreakdown[cat]) categoryBreakdown[cat] = { total: 0, correct: 0 };
        categoryBreakdown[cat].total++;
        if (h.isCorrect) categoryBreakdown[cat].correct++;
      }
    }

    if (currentRoundId) {
      fetch('/api/quote/single/finish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          roundId: currentRoundId,
          userId: currentUserId,
          score: quoteSingleScore,
          totalCorrectTimeMs: Math.round(quoteSingleTotalCorrectTime * 1000),
          categoryBreakdown
        })
      }).catch(() => {});
      currentRoundId = null;
    }

    document.body.classList.remove('quote-in-game');

    document.getElementById('qResultsScore').innerText = `${quoteSingleScore}/10`;
    document.getElementById('qStatCorrect').innerText = quoteSingleCorrectCount;
    document.getElementById('qStatWrong').innerText = quoteSingleWrongCount;
    document.getElementById('qStatStreak').innerText = quoteSingleMaxStreak;

    const verdicts = {
      0: 'ต้องกลับไปดูเพิ่มแล้ว! 🎬',
      1: 'ต้องกลับไปดูเพิ่มแล้ว! 🎬',
      2: 'ต้องกลับไปดูเพิ่มแล้ว! 🎬',
      3: 'เริ่มคุ้น ๆ อยู่บ้างนะ 👍',
      4: 'เริ่มคุ้น ๆ อยู่บ้างนะ 👍',
      5: 'ดูมาไม่น้อยนะเรา! 🍿',
      6: 'ดูมาไม่น้อยนะเรา! 🍿',
      7: 'ตัวจริงสายหนังและซีรีส์! 🌟',
      8: 'ตัวจริงสายหนังและซีรีส์! 🌟',
      9: 'เกือบเซียน ขาดอีกแค่ข้อเดียว! 🔥',
      10: 'เทพประโยคเด็ด จำได้ทุกเรื่อง! 👑'
    };
    document.getElementById('qResultsVerdict').innerText = verdicts[quoteSingleScore] || 'ยอดเยี่ยม!';

    const list = document.getElementById('qResultsReviewList');
    list.innerHTML = quoteSingleHistory.map((h, i) => `
      <div style="background:rgba(255,255,255,0.03); padding:0.5rem; border-radius:8px; font-size:0.85rem; border-left:3px solid ${h.isCorrect ? 'var(--accent-green)' : 'var(--accent-rose)'};">
        <b>ข้อที่ ${i + 1}: ${h.title} (${h.character})</b>
        <div style="color:#fde047;">ประโยคจริง: "${h.correct}"</div>
      </div>
    `).join('');

    document.getElementById('qMultiPodium').style.display = 'none';
    window.gameAudio?.playFanfare?.();
    switchQScreen('results');
  }

  // ── MULTIPLAYER LOGIC ──────────────────────────────────────
  function renderQLobby(room) {
    document.getElementById('displayQRoomCode').innerText = room.code;
    document.getElementById('qLobbyCount').innerText = room.players.length;

    const isSelfHost = (room.hostPlayerId === quotePlayerId) || (room.hostId === socket.id);
    isQuoteHost = isSelfHost;

    document.getElementById('btnQHostStart').style.display = isSelfHost ? 'inline-block' : 'none';

    const myPlayer = room.players.find(p => p.id === quotePlayerId || p.id === socket.id);
    const btnReady = document.getElementById('btnQToggleReady');
    if (myPlayer?.isHost) {
      btnReady.style.display = 'none';
    } else {
      btnReady.style.display = 'inline-block';
      btnReady.innerText = myPlayer?.isReady ? 'ยกเลิกพร้อม' : 'พร้อมแล้ว';
    }

    const listEl = document.getElementById('qLobbyPlayerList');
    listEl.innerHTML = room.players.map(p => `
      <div class="player-row">
        <div style="display:flex; align-items:center; gap:0.4rem;">
          <span>${p.isHost ? '👑' : '👤'}</span>
          <b>${escapeHtml(p.username)}</b>
          ${(p.id === quotePlayerId || p.id === socket.id) ? '<span style="font-size:0.75rem; color:var(--accent-cyan);">(คุณ)</span>' : ''}
        </div>
        <span class="${p.isReady || p.isHost ? 'player-badge-ready' : 'player-badge-waiting'}">
          ${p.isHost ? 'หัวหน้าห้อง' : (p.isReady ? '✓ พร้อมแล้ว' : 'รอพร้อม')}
        </span>
      </div>
    `).join('');
  }

  function handleMultiQAnswer(selectedBtn, text, choiceId) {
    stopQTimer();
    const btns = document.querySelectorAll('.q-option-btn');
    btns.forEach(b => b.disabled = true);
    if (selectedBtn) selectedBtn.classList.add('selected');

    const finalChoiceId = choiceId || selectedBtn?.getAttribute('data-choice-id') || null;
    const timeTaken = Math.min(15, Math.max(0.1, (Date.now() - multiplayerStartTime) / 1000));

    socket.emit('quote_submit_answer', {
      roomCode: quoteRoom.code,
      playerId: quotePlayerId || socket.id,
      choiceId: finalChoiceId,
      selectedOption: text,
      answerTimeMs: Math.round(timeTaken * 1000)
    });
  }

  function setupQuoteSocketListeners() {
    // Auto-reconnect handshake on socket connect
    socket.on('connect', () => {
      const savedCode = sessionStorage.getItem('quote_room_code');
      const savedPlayerId = sessionStorage.getItem('quote_player_id');
      const savedToken = sessionStorage.getItem('quote_reconnect_token');
      if (savedCode && savedPlayerId && savedToken) {
        socket.emit('quote_reconnect', {
          roomCode: savedCode,
          playerId: savedPlayerId,
          reconnectToken: savedToken
        }, (res) => {
          if (res && res.success) {
            quoteRoom = res.room;
            quotePlayerId = savedPlayerId;
            quoteReconnectToken = savedToken;
            if (res.snapshot) {
              handleReconnectSnapshot(res.snapshot);
            }
          } else {
            sessionStorage.removeItem('quote_room_code');
            sessionStorage.removeItem('quote_player_id');
            sessionStorage.removeItem('quote_reconnect_token');
          }
        });
      }
    });

    socket.on('room_update', (room) => {
      if (quoteRoom && room.code === quoteRoom.code) {
        quoteRoom = room;
        renderQLobby(room);
      }
    });

    socket.on('new_chat_message', (chat) => {
      const box = document.getElementById('qChatMessages');
      if (!box) return;
      const row = document.createElement('div');
      row.className = 'chat-row';
      row.innerHTML = `<b>${escapeHtml(chat.sender)}</b>: ${escapeHtml(chat.text)}`;
      box.appendChild(row);
      box.scrollTop = box.scrollHeight;
    });

    socket.on('game_countdown', (data) => {
      switchQScreen('game');
      document.body.classList.add('quote-in-game');
      document.getElementById('qRevealBanner').style.display = 'none';
      const overlay = document.getElementById('qInterstitialOverlay');
      document.getElementById('qInterstitialNum').innerText = `ข้อที่ ${data.questionSeq}/${data.totalQuestions}`;
      document.getElementById('qInterstitialTitle').innerText = `เรื่อง: ${data.title}`;
      overlay.style.display = 'flex';
      window.gameAudio?.playWhoosh?.();
    });

    // Support legacy and modern event names
    socket.on('game_interstitial', (data) => {
      switchQScreen('game');
      document.body.classList.add('quote-in-game');
      document.getElementById('qRevealBanner').style.display = 'none';
      const overlay = document.getElementById('qInterstitialOverlay');
      document.getElementById('qInterstitialNum').innerText = `ข้อที่ ${data.questionNumber || data.questionSeq}/${data.totalQuestions}`;
      document.getElementById('qInterstitialTitle').innerText = `เรื่อง: ${data.title}`;
      overlay.style.display = 'flex';
      window.gameAudio?.playWhoosh?.();
    });

    socket.on('game_intro', (data) => {
      document.getElementById('qInterstitialOverlay').style.display = 'none';
      document.getElementById('qCounterText').innerText = `ข้อที่ ${data.questionSeq}/${data.totalQuestions}`;
      document.getElementById('qMultiStatusBar').style.display = 'none';

      const btns = document.querySelectorAll('.q-option-btn');
      const choices = data.question.choices || (data.question.options || []).map((opt, i) => ({ id: `opt_${i}`, text: opt }));
      btns.forEach((btn, i) => {
        btn.classList.remove('selected', 'correct', 'wrong');
        btn.disabled = true;
        const choice = choices[i];
        if (choice) {
          btn.setAttribute('data-choice-id', choice.id);
          const t = btn.querySelector('.opt-text');
          if (t) t.innerText = choice.text;
        }
      });

      videoStage.loadQuestion(data.question, 'question');
    });

    socket.on('game_clip_start', (data) => {
      document.getElementById('qInterstitialOverlay').style.display = 'none';
      document.getElementById('qCounterText').innerText = `ข้อที่ ${data.questionNumber || data.questionSeq}/${data.totalQuestions}`;
      document.getElementById('qMultiStatusBar').style.display = 'none';

      const btns = document.querySelectorAll('.q-option-btn');
      const choices = data.question.choices || (data.question.options || []).map((opt, i) => ({ id: `opt_${i}`, text: opt }));
      btns.forEach((btn, i) => {
        btn.classList.remove('selected', 'correct', 'wrong');
        btn.disabled = true;
        const choice = choices[i];
        if (choice) {
          btn.setAttribute('data-choice-id', choice.id);
          const t = btn.querySelector('.opt-text');
          if (t) t.innerText = choice.text;
        }
      });

      videoStage.loadQuestion(data.question, 'question');
    });

    socket.on('game_answering', (data) => {
      const btns = document.querySelectorAll('.q-option-btn');
      btns.forEach(b => b.disabled = false);

      document.getElementById('qMultiStatusBar').style.display = 'block';
      document.getElementById('qMultiAnsweredCount').innerText = '0';
      document.getElementById('qMultiTotalCount').innerText = quoteRoom?.players?.length || 1;

      multiplayerStartTime = data.startAt || Date.now();
      multiplayerDeadline = data.deadline;
      startQTimer();
    });

    socket.on('game_question_start', (data) => {
      const btns = document.querySelectorAll('.q-option-btn');
      btns.forEach(b => b.disabled = false);

      document.getElementById('qMultiStatusBar').style.display = 'block';
      document.getElementById('qMultiAnsweredCount').innerText = '0';
      document.getElementById('qMultiTotalCount').innerText = quoteRoom?.players?.length || 1;

      multiplayerStartTime = data.startAt || Date.now();
      multiplayerDeadline = data.deadline;
      startQTimer();
    });

    socket.on('player_answered', () => {
      const el = document.getElementById('qMultiAnsweredCount');
      if (el) el.innerText = parseInt(el.innerText, 10) + 1;
    });

    socket.on('game_reveal', (data) => {
      stopQTimer();
      const btns = document.querySelectorAll('.q-option-btn');
      btns.forEach(b => b.disabled = true);

      const myResult = data.playersResults.find(p => p.id === quotePlayerId || p.socketId === socket.id || p.id === socket.id);
      const isCorrect = myResult?.isCorrect || false;

      btns.forEach(btn => {
        const btnChoiceId = btn.getAttribute('data-choice-id');
        const txt = btn.querySelector('.opt-text')?.innerText;
        if (btnChoiceId === data.choiceId || txt === data.correctAnswer) {
          btn.classList.add('correct');
        } else if ((btnChoiceId === myResult?.selectedChoiceId || txt === myResult?.selected) && !isCorrect) {
          btn.classList.add('wrong');
        }
      });

      if (isCorrect) window.gameAudio?.playDing?.();
      else window.gameAudio?.playBuzzer?.();

      const banner = document.getElementById('qRevealBanner');
      banner.className = `reveal-banner ${isCorrect ? 'correct' : 'wrong'}`;
      document.getElementById('qRevealHeading').innerText = isCorrect ? 'ถูกต้อง! 🎉' : 'ยังไม่ถูกต้อง! ❌';
      document.getElementById('qRevealQuote').innerText = `"${data.correctAnswer}"`;
      document.getElementById('qRevealExp').innerText = `${data.character} (${data.title}) - ${data.explanation || ''}`;
      banner.style.display = 'block';

      videoStage.loadQuestion({ ...data, clipDuration: data.quoteEnd || 8.0, muteStart: 99, muteEnd: 99 }, 'reveal');
    });

    socket.on('game_scoreboard', (data) => {
      renderQRoundLeaderboard(data.rankings, data.commentary);
      switchQScreen('leaderboard');
    });

    socket.on('game_finished', (data) => {
      videoStage.stop();
      stopQTimer();
      document.body.classList.remove('quote-in-game');

      sessionStorage.removeItem('quote_room_code');
      sessionStorage.removeItem('quote_player_id');
      sessionStorage.removeItem('quote_reconnect_token');

      const myRanking = data.rankings.find(p => p.id === quotePlayerId || p.id === socket.id);
      const myScore = myRanking ? myRanking.score : 0;

      document.getElementById('qResultsScore').innerText = `${myScore}/10`;
      document.getElementById('qStatCorrect').innerText = myScore;
      document.getElementById('qStatWrong').innerText = 10 - myScore;
      document.getElementById('qStatStreak').innerText = myRanking?.maxStreak || 0;

      const winner = data.winner;
      document.getElementById('qResultsVerdict').innerText = 
        (winner?.id === quotePlayerId || winner?.id === socket.id)
          ? '🎉 ยินดีด้วย! คุณคือผู้ชนะประจำห้อง!'
          : `ผู้ชนะคือ: ${winner?.username} (${winner?.score}/10 คะแนน)`;

      const podium = document.getElementById('qMultiPodium');
      podium.style.display = 'block';
      podium.innerHTML = data.rankings.map((p, idx) => `
        <div class="player-row" style="background:${idx === 0 ? 'rgba(245,158,11,0.2)' : 'rgba(255,255,255,0.04)'};">
          <div style="display:flex; align-items:center; gap:0.5rem;">
            <span>${idx === 0 ? '🥇' : (idx === 1 ? '🥈' : (idx === 2 ? '🥉' : `#${idx + 1}`))}</span>
            <b>${escapeHtml(p.username)}</b>
          </div>
          <span style="color:var(--accent-green); font-weight:800;">${p.score}/10 คะแนน (${p.totalCorrectTime}s)</span>
        </div>
      `).join('');

      window.gameAudio?.playFanfare?.();
      switchQScreen('results');
    });

    socket.on('session_superseded', (data) => {
      alert(data.message || 'มีการเชื่อมต่อใหม่จากอุปกรณ์หรือแท็บอื่น');
      videoStage?.stop?.();
      stopQTimer();
      document.body.classList.remove('quote-in-game');
      switchQScreen('home');
    });
  }

  function handleReconnectSnapshot(snapshot) {
    if (!snapshot) return;
    if (snapshot.phase === 'LOBBY') {
      switchQScreen('lobby');
    } else if (snapshot.phase === 'COUNTDOWN') {
      switchQScreen('game');
      document.body.classList.add('quote-in-game');
    } else if (snapshot.phase === 'INTRO' || snapshot.phase === 'ANSWERING') {
      switchQScreen('game');
      document.body.classList.add('quote-in-game');
      const btns = document.querySelectorAll('.q-option-btn');
      const choices = snapshot.options || [];
      btns.forEach((btn, i) => {
        const choice = choices[i];
        if (choice) {
          btn.setAttribute('data-choice-id', choice.id);
          const t = btn.querySelector('.opt-text');
          if (t) t.innerText = choice.text;
        }
        if (snapshot.answered) {
          btn.disabled = true;
          if (btn.getAttribute('data-choice-id') === snapshot.selectedChoiceId) {
            btn.classList.add('selected');
          }
        } else if (snapshot.phase === 'ANSWERING') {
          btn.disabled = false;
        }
      });
      if (snapshot.phase === 'ANSWERING' && !snapshot.answered) {
        startQTimer();
      }
    } else if (snapshot.phase === 'SCOREBOARD') {
      switchQScreen('leaderboard');
    } else if (snapshot.phase === 'FINISHED') {
      switchQScreen('results');
    }
  }

  function renderQRoundLeaderboard(rankings, commentary) {
    const box = document.getElementById('qLeaderboardCommentary');
    if (box) {
      box.innerHTML = commentary?.length ? commentary.join('<br>') : '';
      box.style.display = commentary?.length ? 'block' : 'none';
    }

    const list = document.getElementById('qRoundLeaderboardList');
    list.innerHTML = rankings.map((p, idx) => `
      <div class="player-row">
        <b>${idx + 1}. ${escapeHtml(p.username)}</b>
        <span style="color:var(--accent-green); font-weight:800;">${p.score} คะแนน (${p.totalCorrectTime}s)</span>
      </div>
    `).join('');
  }

  async function handleQReportSubmit(e) {
    e.preventDefault();
    const reason = document.getElementById('qReportReason').value;
    const details = document.getElementById('qReportDetails').value;
    const currentQ = quoteSingleQuestions[quoteSingleIndex];
    if (!currentQ) return;

    await fetch('/api/quote/report', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ questionId: currentQ.id, reason, details })
    });
    alert('ส่งรายงานปัญหาเรียบร้อยแล้ว ขอบคุณครับ!');
    closeQuoteModal('modalQReport');
  }

  function shareQuoteResult() {
    const score = document.getElementById('qResultsScore').innerText;
    const text = `🎬 ผมทายประโยคเด็ดในเกม "ประโยคนี้...พูดว่าอะไร?" ได้ ${score} คะแนน!\nมาเล่นกันได้ที่: ${window.location.href}`;
    navigator.clipboard.writeText(text).then(() => alert('คัดลอกข้อความผลคะแนนแล้ว!'));
  }

  function setupQAdminControls() {
    const fileInput = document.getElementById('qAddAudioFileInput');
    const btnBrowse = document.getElementById('btnBrowseQuoteAudio');
    const audioUrlInput = document.getElementById('qAddAudioUrl');
    const statusSpan = document.getElementById('qAddAudioStatus');

    btnBrowse?.addEventListener('click', () => fileInput?.click());

    fileInput?.addEventListener('change', async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      if (statusSpan) statusSpan.innerText = '⏳ กำลังอัปโหลดไฟล์เสียง...';

      const reader = new FileReader();
      reader.onload = async () => {
        try {
          const res = await fetch('/api/quote/admin/upload-audio', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ filename: file.name, fileBase64: reader.result })
          });
          const data = await res.json();
          if (data.success && data.audioUrl) {
            if (audioUrlInput) audioUrlInput.value = data.audioUrl;
            if (statusSpan) statusSpan.innerText = `✅ อัปโหลดสำเร็จ: ${file.name}`;
          } else {
            alert(data.message || 'อัปโหลดล้มเหลว');
            if (statusSpan) statusSpan.innerText = '❌ อัปโหลดไม่สำเร็จ';
          }
        } catch (err) {
          alert('เกิดข้อผิดพลาดในการอัปโหลดไฟล์เสียง');
          if (statusSpan) statusSpan.innerText = '❌ ผิดพลาด';
        }
      };
      reader.readAsDataURL(file);
    });

    document.getElementById('formQAddQuestion')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const payload = {
        title: document.getElementById('qAddTitle').value,
        mediaType: document.getElementById('qAddMediaType').value,
        character: document.getElementById('qAddCharacter').value,
        year: document.getElementById('qAddYear').value,
        difficulty: document.getElementById('qAddDifficulty').value,
        muteStart: document.getElementById('qAddMuteStart').value,
        muteEnd: document.getElementById('qAddMuteEnd').value,
        correctAnswer: document.getElementById('qAddAnswer').value,
        option2: document.getElementById('qAddOpt2').value,
        option3: document.getElementById('qAddOpt3').value,
        option4: document.getElementById('qAddOpt4').value,
        explanation: document.getElementById('qAddExp').value,
        audioUrl: document.getElementById('qAddAudioUrl')?.value || '',
        videoUrl: document.getElementById('qAddVideoUrl')?.value || ''
      };

      const res = await fetch('/api/quote/admin/questions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (data.success) {
        alert('เพิ่มคำถามใหม่สำเร็จ!');
        document.getElementById('formQAddQuestion').reset();
        if (statusSpan) statusSpan.innerText = 'รองรับ .mp3, .wav, .m4a';
        loadQAdminQuestions();
      }
    });
  }

  let previewAudio = null;
  window.playQuoteAudioPreview = function(url) {
    if (!url) return;
    if (previewAudio) {
      previewAudio.pause();
      previewAudio = null;
    }
    previewAudio = new Audio(url);
    previewAudio.play().catch(() => alert('ไม่สามารถเล่นเสียงนี้ได้'));
  };

  window.attachQuoteAudioPrompt = async function(id) {
    const url = prompt('ใส่ URL ลิงก์ไฟล์เสียงหนัง (.mp3 / .wav / .m4a):', '');
    if (!url || !url.trim()) return;
    const res = await fetch(`/api/quote/admin/questions/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ audioUrl: url.trim() })
    });
    const data = await res.json();
    if (data.success) {
      alert('บันทึกไฟล์เสียงหนังเรียบร้อย!');
      loadQAdminQuestions();
    }
  };

  async function loadQAdminQuestions() {
    const res = await fetch('/api/quote/admin/questions');
    const data = await res.json();
    if (data.success && data.questions) {
      const allQ = data.questions;
      const pubCount = allQ.filter(q => q.status === 'published').length;
      const draftCount = allQ.filter(q => q.status === 'draft').length;

      const titleEl = document.getElementById('qAdminListTitle');
      if (titleEl) {
        titleEl.innerText = `📚 คลังคำถาม (ทั้งหมด ${allQ.length} ข้อ: พร้อมเล่นจริง ${pubCount} ข้อ | ฉบับร่างรอคลิป ${draftCount} ข้อ)`;
      }

      document.getElementById('qAdminList').innerHTML = allQ.map(q => {
        const isPub = q.status === 'published';
        const hasMedia = q.introVideoUrl && q.quoteVideoUrl;
        const statusBadge = isPub && hasMedia
          ? `<span style="background:rgba(16,185,129,0.2); color:#34d399; font-size:0.72rem; padding:0.15rem 0.4rem; border-radius:4px; font-weight:600;">🟢 Published (${q.difficulty})</span>`
          : `<span style="background:rgba(234,179,8,0.2); color:#fde047; font-size:0.72rem; padding:0.15rem 0.4rem; border-radius:4px; font-weight:600;">📝 Draft (${q.difficulty} - รอคลิป)</span>`;

        return `
        <div style="background:rgba(255,255,255,0.04); padding:0.6rem 0.8rem; border-radius:8px; display:flex; justify-content:space-between; align-items:center; gap:0.5rem; border-left: 3px solid ${isPub ? '#10b981' : '#eab308'};">
          <div style="flex:1;">
            <div style="display:flex; align-items:center; gap:0.4rem; flex-wrap:wrap;">
              <b>${escapeHtml(q.title)}</b> (${escapeHtml(q.character)})
              ${statusBadge}
              ${q.introVideoUrl ? `<span style="background:rgba(56,189,248,0.2); color:#38bdf8; font-size:0.72rem; padding:0.15rem 0.4rem; border-radius:4px;">🎥 วิดีโอครบ</span>` : `<span style="background:rgba(239,68,68,0.15); color:#fca5a5; font-size:0.72rem; padding:0.15rem 0.4rem; border-radius:4px;">🔇 ไม่มีวิดีโอ</span>`}
            </div>
            <span style="font-size:0.78rem; color:var(--accent-gold); display:block; margin-top:0.15rem;">"${escapeHtml(q.correctAnswer)}"</span>
          </div>
          <div style="display:flex; gap:0.35rem; align-items:center;">
            ${q.quoteAudioUrl || q.audioUrl ? `<button style="background:none; border:1px solid #34d399; color:#34d399; border-radius:4px; padding:0.25rem 0.5rem; cursor:pointer; font-size:0.75rem;" onclick="playQuoteAudioPreview('${q.quoteAudioUrl || q.audioUrl}')">▶️ ฟัง</button>` : ''}
            <button style="background:none; border:1px solid var(--accent-cyan); color:var(--accent-cyan); border-radius:4px; padding:0.25rem 0.5rem; cursor:pointer; font-size:0.75rem;" onclick="attachQuoteAudioPrompt('${q.id}')">🎵 ลิงก์เสียง</button>
            <button style="background:none; border:1px solid var(--accent-rose); color:#fecdd3; border-radius:4px; padding:0.25rem 0.5rem; cursor:pointer; font-size:0.75rem;" onclick="deleteQAdminQuestion('${q.id}')">ลบ</button>
          </div>
        </div>
      `;
      }).join('');
    }
  }

  window.deleteQAdminQuestion = async function(id) {
    if (confirm('คุณแน่ใจว่าต้องการลบคำถามนี้?')) {
      await fetch(`/api/quote/admin/questions/${id}`, { method: 'DELETE' });
      loadQAdminQuestions();
    }
  };

  function escapeHtml(str) {
    return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  // Export
  window.initQuoteGame = initQuoteGame;
  window.switchQScreen = switchQScreen;
  window.stopQuoteGameSession = function() {
    videoStage?.stop?.();
    stopQTimer();
  };
})();
