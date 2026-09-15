/**
 * Cinematic Game Show Video & Dialogue Stage Controller
 * Real movie audio & video clip player with precision mute intervals,
 * audio waveforms, and zero robotic speech synthesis.
 */

class VideoStageController {
  constructor(canvasId, videoId) {
    this.canvas = document.getElementById(canvasId);
    this.ctx = this.canvas ? this.canvas.getContext('2d') : null;
    this.videoEl = document.getElementById(videoId);
    this.audioEl = new Audio();
    this.audioEl.preload = 'auto';
    this.currentQuestion = null;
    this.isPlaying = false;
    this.isMutedInterval = false;
    this.currentTime = 0;
    this.duration = 4.5;
    this.introDuration = 3.5;
    this.animFrame = null;
    this.onEndedCallback = null;
    this.onMuteStateChangeCallback = null;
    this.mode = 'question'; // 'question' or 'reveal'
    this.waveformOffset = 0;
    this.muteTimeout = null;
    this.fallbackTimeout = null;
    this.stallFallbackTimer = null;
    this.suspenseStartTime = 0;
    this.volume = 1.0;
    try {
      const savedVol = localStorage.getItem('quote_game_volume');
      if (savedVol !== null) {
        const v = parseFloat(savedVol);
        if (!isNaN(v) && v >= 0 && v <= 1) this.volume = v;
      }
    } catch (e) {}
  }

  setVolume(vol) {
    this.volume = Math.max(0, Math.min(1, parseFloat(vol)));
    if (this.audioEl) {
      this.audioEl.volume = this.volume;
    }
    if (this.videoEl) {
      this.videoEl.volume = this.volume;
    }
    try {
      localStorage.setItem('quote_game_volume', String(this.volume));
    } catch (e) {}
    if (window.gameAudio && typeof window.gameAudio.setMasterVolume === 'function') {
      window.gameAudio.setMasterVolume(this.volume);
    }
    return this.volume;
  }

  getVolume() {
    return this.volume;
  }

  unlockAudio() {
    if (this.audioEl) {
      try {
        const p = this.audioEl.play();
        if (p && typeof p.then === 'function') {
          p.then(() => {
            this.audioEl.pause();
          }).catch(() => {});
        }
      } catch (e) {}
    }
  }

  loadQuestion(question, mode = 'question', onEnded) {
    this.stop();
    this.currentQuestion = question;
    this.mode = mode;
    this.onEndedCallback = onEnded;
    this.isMutedInterval = false;
    this.suspenseStartTime = 0;

    // Check if video clip URL is provided for current mode
    const videoSrc = this.mode === 'reveal'
      ? (question.quoteVideoUrl || '')
      : (question.introVideoUrl || '');

    const audioSrc = this.mode === 'reveal'
      ? (question.quoteAudioUrl || question.audioUrl)
      : (question.introAudioUrl || question.audioUrl);

    if (videoSrc && this.videoEl) {
      this.playRealVideo(videoSrc, audioSrc);
      return;
    }

    this.playAudioAndCanvas(audioSrc);
  }

  playRealVideo(videoSrc, fallbackAudioSrc) {
    if (!this.videoEl) return;
    this.isPlaying = true;

    // Clear old handlers and timers to avoid residual callbacks from previous question
    this.videoEl.onended = null;
    this.videoEl.onerror = null;
    this.videoEl.oncanplay = null;
    this.videoEl.onstalled = null;
    this.videoEl.onwaiting = null;
    this.videoEl.pause();
    if (this.stallFallbackTimer) { clearTimeout(this.stallFallbackTimer); this.stallFallbackTimer = null; }

    // Set src & preload
    this.videoEl.src = videoSrc;
    this.videoEl.preload = 'auto';
    this.videoEl.style.display = 'block';
    if (this.canvas) this.canvas.style.display = 'none';
    this.videoEl.volume = this.volume;
    this.videoEl.currentTime = 0;
    this.videoEl.muted = false;

    let hasHandledEnded = false;
    const triggerEnded = () => {
      if (hasHandledEnded) return;
      hasHandledEnded = true;
      this.isPlaying = false;
      if (this.stallFallbackTimer) { clearTimeout(this.stallFallbackTimer); this.stallFallbackTimer = null; }
      if (typeof this.onEndedCallback === 'function') {
        const cb = this.onEndedCallback;
        this.onEndedCallback = null;
        cb();
      }
    };

    const doFreezeOrEnd = () => {
      if (this.mode === 'question') {
        this.videoEl.pause();
        this.isMutedInterval = true;
        this.suspenseStartTime = performance.now();
        window.gameAudio?.playMuteIndicator?.();
        if (typeof this.onMuteStateChangeCallback === 'function') {
          this.onMuteStateChangeCallback(true);
        }
        this.muteTimeout = setTimeout(() => { triggerEnded(); }, 1200);
      } else {
        this.muteTimeout = setTimeout(() => { triggerEnded(); }, 800);
      }
    };

    this.videoEl.onended = () => { doFreezeOrEnd(); };

    this.videoEl.onerror = () => {
      console.warn('Video playback error, falling back to audio/canvas:', videoSrc);
      if (this.stallFallbackTimer) { clearTimeout(this.stallFallbackTimer); this.stallFallbackTimer = null; }
      if (this.videoEl) this.videoEl.style.display = 'none';
      if (this.canvas) this.canvas.style.display = 'block';
      this.playAudioAndCanvas(fallbackAudioSrc);
    };

    // Stall detection: if video doesn't make progress within 8 seconds, fall back to audio
    const resetStallTimer = () => {
      if (this.stallFallbackTimer) clearTimeout(this.stallFallbackTimer);
      this.stallFallbackTimer = setTimeout(() => {
        console.warn('Video stall timeout, falling back to audio:', videoSrc);
        this.stallFallbackTimer = null;
        if (this.videoEl) this.videoEl.style.display = 'none';
        if (this.canvas) this.canvas.style.display = 'block';
        this.playAudioAndCanvas(fallbackAudioSrc);
      }, 8000);
    };

    this.videoEl.onstalled = () => { resetStallTimer(); };
    this.videoEl.onwaiting = () => { resetStallTimer(); };

    // Load & play; start stall timer from load attempt
    resetStallTimer();
    this.videoEl.load();

    const p = this.videoEl.play();
    if (p && typeof p.catch === 'function') {
      p.then(() => {
        // Playing OK — stall timer monitors ongoing
      }).catch(err => {
        console.warn('Video autoplay prevented:', err);
        if (this.stallFallbackTimer) { clearTimeout(this.stallFallbackTimer); this.stallFallbackTimer = null; }
        if (this.videoEl) this.videoEl.style.display = 'none';
        if (this.canvas) this.canvas.style.display = 'block';
        this.playAudioAndCanvas(fallbackAudioSrc);
      });
    }
  }

  playAudioAndCanvas(audioSrc) {
    if (this.videoEl) this.videoEl.style.display = 'none';
    if (this.canvas) this.canvas.style.display = 'block';

    this.currentTime = 0;
    this.introDuration = this.mode === 'reveal' ? 3.0 : 3.5;
    this.duration = this.mode === 'reveal' ? 3.0 : (this.introDuration + 1.2);

    let hasHandledEnded = false;
    const triggerEnded = () => {
      if (hasHandledEnded) return;
      hasHandledEnded = true;
      this.isPlaying = false;
      if (this.animFrame) cancelAnimationFrame(this.animFrame);
      this.renderStage();
      if (typeof this.onEndedCallback === 'function') {
        const cb = this.onEndedCallback;
        this.onEndedCallback = null;
        cb();
      }
    };

    if (audioSrc && this.audioEl) {
      try {
        this.audioEl.src = audioSrc;
        this.audioEl.muted = false;
        this.audioEl.volume = this.volume;

        const onMeta = () => {
          const d = this.audioEl.duration;
          if (d && !isNaN(d) && isFinite(d) && d > 0.5) {
            this.introDuration = d;
            this.duration = this.mode === 'question' ? (d + 1.2) : d;
          }
        };

        if (this.audioEl.readyState >= 1) {
          onMeta();
        } else {
          this.audioEl.addEventListener('loadedmetadata', onMeta, { once: true });
        }

        this.audioEl.onended = () => {
          if (this.mode === 'question') {
            this.isMutedInterval = true;
            this.suspenseStartTime = performance.now();
            window.gameAudio?.playMuteIndicator?.();
            if (typeof this.onMuteStateChangeCallback === 'function') {
              this.onMuteStateChangeCallback(true);
            }
            this.muteTimeout = setTimeout(() => {
              triggerEnded();
            }, 1200);
          } else {
            this.muteTimeout = setTimeout(() => {
              triggerEnded();
            }, 800);
          }
        };

        this.audioEl.onerror = () => {
          console.warn('Audio playback error, falling back');
          this.fallbackTimeout = setTimeout(() => {
            if (this.mode === 'question') {
              this.isMutedInterval = true;
              this.suspenseStartTime = performance.now();
              setTimeout(triggerEnded, 1200);
            } else {
              triggerEnded();
            }
          }, 3500);
        };

        const playPromise = this.audioEl.play();
        if (playPromise && typeof playPromise.catch === 'function') {
          playPromise.catch((err) => {
            console.warn('Autoplay prevented or audio play failed:', err);
            this.fallbackTimeout = setTimeout(() => {
              if (this.mode === 'question') {
                this.isMutedInterval = true;
                this.suspenseStartTime = performance.now();
                setTimeout(triggerEnded, 1200);
              } else {
                triggerEnded();
              }
            }, 3500);
          });
        }
      } catch (err) {
        console.warn('Audio setup error:', err);
      }
    } else {
      this.fallbackTimeout = setTimeout(() => {
        if (this.mode === 'question') {
          this.isMutedInterval = true;
          this.suspenseStartTime = performance.now();
          setTimeout(triggerEnded, 1200);
        } else {
          triggerEnded();
        }
      }, 3500);
    }

    this.playCanvasStage();
  }

  playCanvasStage() {
    this.isPlaying = true;

    const loop = (now) => {
      if (!this.isPlaying) return;

      if (!this.isMutedInterval) {
        if (this.audioEl && !isNaN(this.audioEl.currentTime)) {
          this.currentTime = this.audioEl.currentTime;
        }
      } else {
        if (this.suspenseStartTime > 0) {
          const muteElapsed = (now - this.suspenseStartTime) / 1000;
          this.currentTime = this.introDuration + Math.min(1.2, muteElapsed);
        }
      }

      this.waveformOffset += 0.12;
      this.renderStage();
      this.animFrame = requestAnimationFrame(loop);
    };

    this.animFrame = requestAnimationFrame(loop);
  }


  renderStage() {
    if (!this.ctx || !this.canvas) return;
    const w = this.canvas.width;
    const h = this.canvas.height;
    const q = this.currentQuestion;
    if (!q) return;

    // 1. Studio Background Gradient
    const bgGrad = this.ctx.createRadialGradient(w/2, h/2, 20, w/2, h/2, w);
    bgGrad.addColorStop(0, '#1e293b');
    bgGrad.addColorStop(1, '#090d16');
    this.ctx.fillStyle = bgGrad;
    this.ctx.fillRect(0, 0, w, h);

    // 2. Game Show Stage Light Beams
    this.ctx.save();
    this.ctx.globalAlpha = 0.15;
    const beamAngle = Math.sin(this.waveformOffset * 0.5) * 0.2;
    this.ctx.fillStyle = '#38bdf8';
    this.ctx.beginPath();
    this.ctx.moveTo(w * 0.1, 0);
    this.ctx.lineTo(w * 0.4 + Math.sin(beamAngle) * 50, h);
    this.ctx.lineTo(w * 0.2 + Math.sin(beamAngle) * 50, h);
    this.ctx.closePath();
    this.ctx.fill();

    this.ctx.fillStyle = '#ec4899';
    this.ctx.beginPath();
    this.ctx.moveTo(w * 0.9, 0);
    this.ctx.lineTo(w * 0.6 - Math.sin(beamAngle) * 50, h);
    this.ctx.lineTo(w * 0.8 - Math.sin(beamAngle) * 50, h);
    this.ctx.closePath();
    this.ctx.fill();
    this.ctx.restore();

    // 3. Media Tag Badge (top left)
    const mediaNames = {
      movie: '🎬 ภาพยนตร์ไทย',
      drama: '📺 ละครไทย',
      series: '🍿 ซีรีส์ไทย',
      y_series: '👬 ซีรีส์วายไทย',
      sitcom: '🎭 ซิตคอมไทย'
    };
    const mediaBadgeText = (mediaNames[q.mediaType] || '🎬 สื่อบันเทิง') + ` (${q.year})`;

    this.ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
    this.ctx.beginPath();
    this.ctx.roundRect(20, 20, 190, 36, 18);
    this.ctx.fill();
    this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
    this.ctx.lineWidth = 1;
    this.ctx.stroke();

    this.ctx.font = 'bold 13px "Prompt", "Kanit", sans-serif';
    this.ctx.fillStyle = '#fbbf24';
    this.ctx.fillText(mediaBadgeText, 32, 43);

    // Audio source badge (top right)
    if (q.audioUrl || q.introAudioUrl || q.quoteAudioUrl) {
      this.ctx.fillStyle = 'rgba(16, 185, 129, 0.2)';
      this.ctx.beginPath();
      this.ctx.roundRect(w - 180, 20, 160, 36, 18);
      this.ctx.fill();
      this.ctx.strokeStyle = '#10b981';
      this.ctx.lineWidth = 1;
      this.ctx.stroke();

      this.ctx.font = 'bold 12px "Prompt", "Kanit", sans-serif';
      this.ctx.fillStyle = '#34d399';
      this.ctx.textAlign = 'center';
      this.ctx.fillText('🔊 เสียงหนังจริง', w - 100, 43);
      this.ctx.textAlign = 'left';
    }

    // 4. Title Header
    this.ctx.font = 'bold 22px "Prompt", "Kanit", sans-serif';
    this.ctx.fillStyle = '#ffffff';
    this.ctx.textAlign = 'center';
    this.ctx.fillText(`เรื่อง: ${q.title}`, w / 2, 45);

    // 5. Center Character Card
    const cardW = 300;
    const cardH = 135;
    const cardX = (w - cardW) / 2;
    const cardY = 70;

    const cardGrad = this.ctx.createLinearGradient(cardX, cardY, cardX, cardY + cardH);
    cardGrad.addColorStop(0, 'rgba(30, 41, 59, 0.85)');
    cardGrad.addColorStop(1, 'rgba(15, 23, 42, 0.95)');
    this.ctx.fillStyle = cardGrad;
    this.ctx.beginPath();
    this.ctx.roundRect(cardX, cardY, cardW, cardH, 16);
    this.ctx.fill();
    this.ctx.strokeStyle = this.isMutedInterval ? '#ec4899' : '#38bdf8';
    this.ctx.lineWidth = 2;
    this.ctx.stroke();

    // Character Name
    this.ctx.font = 'bold 15px "Prompt", "Kanit", sans-serif';
    this.ctx.fillStyle = '#94a3b8';
    this.ctx.fillText('ตัวละครที่กำลังพูด:', w / 2, cardY + 32);

    this.ctx.font = 'bold 22px "Prompt", "Kanit", sans-serif';
    this.ctx.fillStyle = '#fde047';
    this.ctx.fillText(`👤 "${q.character}"`, w / 2, cardY + 64);

    // Context Dialogue snippet
    if (!this.isMutedInterval && this.mode === 'question') {
      this.ctx.font = '13px "Prompt", "Kanit", sans-serif';
      this.ctx.fillStyle = '#cbd5e1';
      const ctxText = q.contextDialogue ? `"${q.contextDialogue}"` : 'กำลังดูคลิปและฟังบทสนทนา...';
      this.ctx.fillText(ctxText, w / 2, cardY + 104);
    } else if (this.isMutedInterval) {
      this.ctx.font = 'bold 14px "Prompt", "Kanit", sans-serif';
      this.ctx.fillStyle = '#f43f5e';
      this.ctx.fillText('🔇 เสียงช่วงนี้ถูกปิดไว้! ทายซิพูดว่าอะไร?', w / 2, cardY + 104);
    }

    // 6. Dynamic Audio Waveform
    this.ctx.save();
    this.ctx.translate(w / 2, 230);
    const barCount = 36;
    const barWidth = 4;
    const gap = 3;
    const totalW = barCount * (barWidth + gap);
    const startX = -totalW / 2;

    for (let i = 0; i < barCount; i++) {
      let amp = 0;
      if (this.isMutedInterval) {
        amp = 2; // Flatline when muted
      } else {
        amp = Math.sin(this.waveformOffset + i * 0.4) * 14 + Math.cos(this.waveformOffset * 1.5 + i * 0.2) * 8 + 14;
      }
      this.ctx.fillStyle = this.isMutedInterval ? 'rgba(239, 68, 68, 0.4)' : (this.mode === 'reveal' ? '#4ade80' : '#38bdf8');
      this.ctx.fillRect(startX + i * (barWidth + gap), -amp / 2, barWidth, amp);
    }
    this.ctx.restore();

    // 7. Status Banner Overlays
    if (this.isMutedInterval && this.mode === 'question') {
      this.ctx.save();
      this.ctx.translate(w / 2, 280);
      const pulseScale = 1 + Math.sin(this.waveformOffset * 3) * 0.04;
      this.ctx.scale(pulseScale, pulseScale);

      this.ctx.fillStyle = 'rgba(225, 29, 72, 0.92)';
      this.ctx.beginPath();
      this.ctx.roundRect(-160, -26, 320, 52, 26);
      this.ctx.fill();
      this.ctx.strokeStyle = '#fff';
      this.ctx.lineWidth = 2;
      this.ctx.stroke();

      this.ctx.font = 'bold 16px "Prompt", "Kanit", sans-serif';
      this.ctx.fillStyle = '#ffffff';
      this.ctx.textAlign = 'center';
      this.ctx.fillText('🔇 ปิดเสียงประโยคนี้...', 0, 7);
      this.ctx.restore();
    } else if (this.mode === 'reveal') {
      this.ctx.save();
      this.ctx.translate(w / 2, 280);
      this.ctx.fillStyle = 'rgba(22, 101, 52, 0.92)';
      this.ctx.beginPath();
      this.ctx.roundRect(-180, -28, 360, 56, 28);
      this.ctx.fill();
      this.ctx.strokeStyle = '#86efac';
      this.ctx.lineWidth = 2;
      this.ctx.stroke();

      this.ctx.font = 'bold 18px "Prompt", "Kanit", sans-serif';
      this.ctx.fillStyle = '#ffffff';
      this.ctx.textAlign = 'center';
      this.ctx.fillText(`🗣️ "${q.correctAnswer}"`, 0, 7);
      this.ctx.restore();
    }

    // 8. Bottom Progress Bar
    const progress = Math.min(1, Math.max(0, this.currentTime / this.duration));
    this.ctx.fillStyle = 'rgba(255, 255, 255, 0.15)';
    this.ctx.fillRect(20, h - 14, w - 40, 6);

    const barGrad = this.ctx.createLinearGradient(20, 0, w - 20, 0);
    barGrad.addColorStop(0, '#38bdf8');
    barGrad.addColorStop(1, '#ec4899');
    this.ctx.fillStyle = barGrad;
    this.ctx.fillRect(20, h - 14, (w - 40) * progress, 6);

    this.ctx.textAlign = 'left';
  }

  stop() {
    this.isPlaying = false;
    this.isMutedInterval = false;
    this.onEndedCallback = null;
    if (this.muteTimeout) {
      clearTimeout(this.muteTimeout);
      this.muteTimeout = null;
    }
    if (this.fallbackTimeout) {
      clearTimeout(this.fallbackTimeout);
      this.fallbackTimeout = null;
    }
    if (this.stallFallbackTimer) {
      clearTimeout(this.stallFallbackTimer);
      this.stallFallbackTimer = null;
    }
    if (this.animFrame) {
      cancelAnimationFrame(this.animFrame);
      this.animFrame = null;
    }
    if (this.audioEl) {
      this.audioEl.pause();
      this.audioEl.onended = null;
      this.audioEl.onerror = null;
      try {
        if (this.audioEl.readyState > 0) {
          this.audioEl.currentTime = 0;
        }
      } catch (e) {}
    }
    if (this.videoEl) {
      this.videoEl.onended = null;
      this.videoEl.onerror = null;
      this.videoEl.onstalled = null;
      this.videoEl.onwaiting = null;
      this.videoEl.pause();
      try {
        if (this.videoEl.readyState > 0) {
          this.videoEl.currentTime = 0;
        }
      } catch (e) {}
      this.videoEl.style.display = 'none';
    }
    if (this.canvas) {
      this.canvas.style.display = 'none';
    }
  }
}

window.VideoStageController = VideoStageController;
