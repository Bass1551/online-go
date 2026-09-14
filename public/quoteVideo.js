/**
 * Cinematic Game Show Video & Dialogue Stage Controller
 * 100% Copyright-safe dynamic stage rendering with mute intervals,
 * audio waveforms, character dialogue simulation, and HTML5 video support
 */

class VideoStageController {
  constructor(canvasId, videoId) {
    this.canvas = document.getElementById(canvasId);
    this.ctx = this.canvas ? this.canvas.getContext('2d') : null;
    this.videoEl = document.getElementById(videoId);
    this.currentQuestion = null;
    this.isPlaying = false;
    this.isMutedInterval = false;
    this.currentTime = 0;
    this.duration = 12;
    this.animFrame = null;
    this.onEndedCallback = null;
    this.onMuteStateChangeCallback = null;
    this.mode = 'question'; // 'question' or 'reveal'
    this.synthUtterance = null;
    this.waveformOffset = 0;
  }

  loadQuestion(question, mode = 'question', onEnded) {
    this.stop();
    this.currentQuestion = question;
    this.mode = mode;
    this.onEndedCallback = onEnded;
    this.currentTime = mode === 'reveal' ? (question.quoteStart || 4.5) : 0;
    this.duration = mode === 'reveal' ? (question.quoteEnd || 8.0) : (question.muteEnd || 8.0);
    this.isMutedInterval = false;

    // If custom MP4 video URL provided
    if (question.videoUrl && this.videoEl) {
      this.videoEl.src = question.videoUrl;
      this.videoEl.style.display = 'block';
      if (this.canvas) this.canvas.style.display = 'none';
      this.playRealVideo();
      return;
    }

    if (this.videoEl) this.videoEl.style.display = 'none';
    if (this.canvas) this.canvas.style.display = 'block';

    this.playCanvasStage();
  }

  playCanvasStage() {
    this.isPlaying = true;
    const startTime = performance.now();
    const initialStageTime = this.currentTime;

    // Trigger spoken dialogue if speech synthesis is supported
    this.triggerDialogueAudio();

    const loop = (now) => {
      if (!this.isPlaying) return;
      const elapsed = (now - startTime) / 1000;
      this.currentTime = initialStageTime + elapsed;

      // Check Mute Interval
      const muteStart = this.currentQuestion.muteStart || 4.5;
      const muteEnd = this.currentQuestion.muteEnd || 8.0;

      if (this.mode === 'question') {
        const inMute = this.currentTime >= muteStart && this.currentTime <= muteEnd;
        if (inMute !== this.isMutedInterval) {
          this.isMutedInterval = inMute;
          if (inMute) {
            window.gameAudio?.playMuteIndicator?.();
            this.silenceSpeech();
          }
          if (typeof this.onMuteStateChangeCallback === 'function') {
            this.onMuteStateChangeCallback(inMute);
          }
        }

        // Auto pause when mute interval ends
        if (this.currentTime >= this.duration) {
          this.isPlaying = false;
          this.silenceSpeech();
          this.renderStage();
          if (typeof this.onEndedCallback === 'function') {
            this.onEndedCallback();
          }
          return;
        }
      } else if (this.mode === 'reveal') {
        // Reveal mode: plays until quoteEnd
        if (this.currentTime >= (this.currentQuestion.quoteEnd || 8.0)) {
          this.isPlaying = false;
          this.silenceSpeech();
          this.renderStage();
          if (typeof this.onEndedCallback === 'function') {
            this.onEndedCallback();
          }
          return;
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

    // 4. Title Header
    this.ctx.font = 'bold 22px "Prompt", "Kanit", sans-serif';
    this.ctx.fillStyle = '#ffffff';
    this.ctx.textAlign = 'center';
    this.ctx.fillText(`เรื่อง: ${q.title}`, w / 2, 45);

    // 5. Center Character Avatar / Silhouette Card
    const cardW = 280;
    const cardH = 130;
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
    this.ctx.fillText('ตัวละครที่กำลังพูด:', w / 2, cardY + 30);

    this.ctx.font = 'bold 22px "Prompt", "Kanit", sans-serif';
    this.ctx.fillStyle = '#fde047';
    this.ctx.fillText(`👤 "${q.character}"`, w / 2, cardY + 62);

    // Context Dialogue snippet (during intro)
    if (!this.isMutedInterval && this.mode === 'question') {
      this.ctx.font = '12px "Prompt", "Kanit", sans-serif';
      this.ctx.fillStyle = '#cbd5e1';
      this.ctx.fillText('🎙️ กำลังเปิดฉากและบทสนทนา...', w / 2, cardY + 95);
    } else if (this.isMutedInterval) {
      this.ctx.font = 'bold 13px "Prompt", "Kanit", sans-serif';
      this.ctx.fillStyle = '#f43f5e';
      this.ctx.fillText('🔇 [ ปิดเสียงประโยคคำถาม ]', w / 2, cardY + 95);
    } else if (this.mode === 'reveal') {
      this.ctx.font = 'bold 14px "Prompt", "Kanit", sans-serif';
      this.ctx.fillStyle = '#4ade80';
      this.ctx.fillText('✨ เฉลยพร้อมเสียงจริง!', w / 2, cardY + 95);
    }

    // 6. Dynamic Audio Waveform Visualizer
    const waveY = 230;
    const waveWidth = 320;
    const waveX = (w - waveWidth) / 2;

    this.ctx.lineWidth = 3;
    this.ctx.strokeStyle = this.isMutedInterval ? '#f43f5e' : (this.mode === 'reveal' ? '#4ade80' : '#38bdf8');
    this.ctx.beginPath();
    for (let x = 0; x < waveWidth; x += 6) {
      const amp = this.isMutedInterval ? 2 : 12;
      const y = waveY + Math.sin((x * 0.08) + this.waveformOffset) * Math.cos(x * 0.05) * amp;
      if (x === 0) this.ctx.moveTo(waveX + x, y);
      else this.ctx.lineTo(waveX + x, y);
    }
    this.ctx.stroke();

    // 7. MUTE INDICATOR OVERLAY (During Quote Interval)
    if (this.isMutedInterval) {
      this.ctx.fillStyle = 'rgba(236, 72, 153, 0.15)';
      this.ctx.fillRect(0, 0, w, h);

      // Glowing Mute Badge
      const pulse = 1 + Math.sin(this.waveformOffset * 3) * 0.06;
      this.ctx.save();
      this.ctx.translate(w / 2, 280);
      this.ctx.scale(pulse, pulse);

      this.ctx.fillStyle = 'rgba(225, 29, 72, 0.9)';
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
      // Reveal Quote Highlight
      this.ctx.save();
      this.ctx.translate(w / 2, 280);
      this.ctx.fillStyle = 'rgba(22, 101, 52, 0.9)';
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

  triggerDialogueAudio() {
    if (!('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();

    const q = this.currentQuestion;
    if (!q) return;

    if (this.mode === 'question') {
      // Speak intro context dialogue before mute
      const introText = `${q.character} ในเรื่อง ${q.title}`;
      const utter = new SpeechSynthesisUtterance(introText);
      utter.lang = 'th-TH';
      utter.rate = 1.05;
      window.speechSynthesis.speak(utter);
      this.synthUtterance = utter;
    } else if (this.mode === 'reveal') {
      // Speak the real quote loudly with high energy
      const revealText = `${q.character} พูดว่า: ${q.correctAnswer}`;
      const utter = new SpeechSynthesisUtterance(revealText);
      utter.lang = 'th-TH';
      utter.rate = 0.95;
      window.speechSynthesis.speak(utter);
      this.synthUtterance = utter;
    }
  }

  silenceSpeech() {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
  }

  stop() {
    this.isPlaying = false;
    this.isMutedInterval = false;
    this.silenceSpeech();
    if (this.animFrame) cancelAnimationFrame(this.animFrame);
    if (this.videoEl) {
      this.videoEl.pause();
      this.videoEl.currentTime = 0;
    }
  }
}

window.VideoStageController = VideoStageController;
