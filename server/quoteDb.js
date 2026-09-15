/**
 * Persistent Database & Question Engine for Thai Quote Game
 * Integrated into Online Go Hub
 */
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const QUESTIONS_FILE = path.join(DATA_DIR, 'quote_questions.json');
const REPORTS_FILE = path.join(DATA_DIR, 'quote_reports.json');

function loadJSON(filePath, fallback) {
  try {
    if (!fs.existsSync(filePath)) {
      fs.writeFileSync(filePath, JSON.stringify(fallback, null, 2), 'utf-8');
      return fallback;
    }
    const data = fs.readFileSync(filePath, 'utf-8').trim();
    if (!data) return fallback;
    return JSON.parse(data);
  } catch (err) {
    console.error('Error loading ' + filePath, err);
    return fallback;
  }
}

function saveJSON(filePath, data) {
  try {
    const tempFile = filePath + '.tmp.' + Date.now();
    fs.writeFileSync(tempFile, JSON.stringify(data, null, 2), 'utf-8');
    fs.renameSync(tempFile, filePath);
  } catch (err) {
    console.error('Error saving ' + filePath, err);
  }
}

let questions = loadJSON(QUESTIONS_FILE, []);
let reports = loadJSON(REPORTS_FILE, []);
let totalRoundsPlayed = 0;

const PUBLIC_DIR = path.join(__dirname, '..', 'public');

class QuoteDatabase {
  static isQuestionPlayable(q) {
    if (!q || q.status !== 'published') return false;
    if (!q.introVideoUrl || !q.quoteVideoUrl || !q.quoteAudioUrl) return false;
    try {
      const iv = path.join(PUBLIC_DIR, q.introVideoUrl);
      const qv = path.join(PUBLIC_DIR, q.quoteVideoUrl);
      const qa = path.join(PUBLIC_DIR, q.quoteAudioUrl);
      const ia = path.join(PUBLIC_DIR, q.introAudioUrl || q.audioUrl || '');
      return fs.existsSync(iv) && fs.existsSync(qv) && fs.existsSync(qa) && fs.existsSync(ia);
    } catch (e) {
      return false;
    }
  }

  static getPlayableQuestions() {
    return questions.filter(q => this.isQuestionPlayable(q));
  }

  static getAllQuestions() {
    return questions;
  }

  static getQuestionById(id) {
    return questions.find(q => q.id === id);
  }

  static getCategoryList() {
    const playable = this.getPlayableQuestions();
    const all = questions;
    const catDefs = [
      { id: 'all', name: 'รวมทุกประเภท', icon: '🌟' },
      { id: 'movie', name: 'ภาพยนตร์ไทย', icon: '🎬', filter: q => q.mediaType === 'movie' },
      { id: 'drama', name: 'ละครไทย', icon: '📺', filter: q => q.mediaType === 'drama' },
      { id: 'series', name: 'ซีรีส์ไทย', icon: '🍿', filter: q => q.mediaType === 'series' },
      { id: 'y_series', name: 'ซีรีส์วายไทย', icon: '👬', filter: q => q.mediaType === 'y_series' },
      { id: 'sitcom', name: 'ซิตคอมไทย', icon: '🎭', filter: q => q.mediaType === 'sitcom' },
      { id: 'legendary', name: 'ประโยคระดับตำนาน', icon: '👑', filter: q => (q.categories || []).includes('legendary') },
      { id: 'trending', name: 'เรื่องกระแสฮิต', icon: '🔥', filter: q => (q.categories || []).includes('trending') },
      { id: 'comedy', name: 'ตลก/ฮา', icon: '🤣', filter: q => (q.categories || []).includes('comedy') },
      { id: 'romantic', name: 'โรแมนติก', icon: '💖', filter: q => (q.categories || []).includes('romantic') },
      { id: 'drama_genre', name: 'ดราม่าเข้มข้น', icon: '😭', filter: q => (q.categories || []).includes('drama') }
    ];

    return catDefs.map(def => {
      const playableMatching = def.id === 'all'
        ? playable
        : playable.filter(def.filter);
      const totalMatching = def.id === 'all'
        ? all
        : all.filter(def.filter);
      const playableCount = playableMatching.length;
      const totalCount = totalMatching.length;
      const isUnlocked = playableCount >= 10;
      return {
        id: def.id,
        name: def.name,
        icon: def.icon,
        count: playableCount,
        totalCount: totalCount,
        draftCount: totalCount - playableCount,
        minRequired: 10,
        isUnlocked,
        statusText: isUnlocked
          ? `${playableCount} ข้อ (เปิดให้เล่นได้ 🎉)`
          : `🔒 ${playableCount}/10 ข้อ (รอคลิปเพิ่ม)`
      };
    });
  }

  static getMixedRatio(playablePool = null) {
    const pool = playablePool || this.getPlayableQuestions();
    const hardCount = pool.filter(q => q.difficulty === 'hard').length;
    if (hardCount >= 2) {
      return {
        easy: 4,
        medium: 4,
        hard: 2,
        label: 'รวมระดับ (4 ง่าย : 4 กลาง : 2 ยาก)'
      };
    } else {
      return {
        easy: 5,
        medium: 4,
        hard: 1,
        label: 'รวมระดับ (5 ง่าย : 4 กลาง : 1 ยาก)'
      };
    }
  }

  static getDifficultyList() {
    const playable = this.getPlayableQuestions();
    const mixedRatio = this.getMixedRatio(playable);

    const diffDefs = [
      {
        id: 'mixed',
        name: mixedRatio.label,
        filter: () => true,
        ratio: { easy: mixedRatio.easy, medium: mixedRatio.medium, hard: mixedRatio.hard }
      },
      { id: 'easy', name: 'ง่าย (ประโยคฮิตติดหู)', filter: q => q.difficulty === 'easy' },
      { id: 'medium', name: 'ปานกลาง (ต้องจำบริบทได้)', filter: q => q.difficulty === 'medium' },
      { id: 'hard', name: 'ยาก (เซียนหนังตัวจริง)', filter: q => q.difficulty === 'hard' }
    ];

    return diffDefs.map(def => {
      const playableMatching = playable.filter(def.filter);
      const count = playableMatching.length;
      const isUnlocked = def.id === 'mixed' ? (playable.length >= 10) : (count >= 10);
      return {
        id: def.id,
        name: def.name,
        count,
        minRequired: 10,
        isUnlocked,
        ratio: def.ratio || null,
        statusText: isUnlocked
          ? `${def.name}`
          : `🔒 ${def.name} (${count}/10 ข้อ)`
      };
    });
  }

  static selectRoundQuestions(category = 'all', difficulty = 'mixed', excludeIds = []) {
    // Only select from published questions with valid media on disk
    const playable = this.getPlayableQuestions().filter(q => !excludeIds.includes(q.id));

    let pool = playable;
    if (category && category !== 'all') {
      const catMatching = playable.filter(q => (q.categories || []).includes(category) || q.mediaType === category);
      if (catMatching.length < 10) {
        // Strict rule: category must not be played if published count < 10
        return [];
      }
      pool = catMatching;
    }

    if (difficulty && difficulty !== 'mixed') {
      const diffMatching = pool.filter(q => q.difficulty === difficulty);
      if (diffMatching.length < 10) {
        return [];
      }
      pool = diffMatching;
    }

    const shuffled = [...pool].sort(() => 0.5 - Math.random());
    let selected = [];
    const usedTitles = new Set();

    if (difficulty === 'mixed') {
      const ratio = this.getMixedRatio(pool);
      const easyPool = shuffled.filter(q => q.difficulty === 'easy');
      const medPool  = shuffled.filter(q => q.difficulty === 'medium');
      const hardPool = shuffled.filter(q => q.difficulty === 'hard');

      const pickFrom = (subPool, targetCount) => {
        let picked = 0;
        for (const q of subPool) {
          if (picked >= targetCount) break;
          if (!usedTitles.has(q.title) && !selected.some(s => s.id === q.id)) {
            selected.push(q);
            usedTitles.add(q.title);
            picked++;
          }
        }
        return picked;
      };

      const pickedEasy = pickFrom(easyPool, ratio.easy);
      const pickedMed  = pickFrom(medPool, ratio.medium);
      const pickedHard = pickFrom(hardPool, ratio.hard);

      // Strict check: if cannot strictly satisfy the advertised ratio without duplicate titles, return []
      if (pickedEasy !== ratio.easy || pickedMed !== ratio.medium || pickedHard !== ratio.hard) {
        return [];
      }
    } else {
      for (const q of shuffled) {
        if (selected.length >= 10) break;
        if (!usedTitles.has(q.title) && !selected.some(s => s.id === q.id)) {
          selected.push(q);
          usedTitles.add(q.title);
        }
      }
    }

    return selected.slice(0, 10);
  }

  static formatQuestionForClient(q, shuffleOptions = true) {
    if (!q) return null;
    let opts = [...(q.options || [])];
    if (shuffleOptions) {
      opts.sort(() => 0.5 - Math.random());
    }
    return {
      id: q.id,
      title: q.title,
      mediaType: q.mediaType,
      year: q.year,
      character: q.character,
      clipDuration: q.clipDuration,
      muteStart: q.muteStart,
      muteEnd: q.muteEnd,
      quoteStart: q.quoteStart || q.muteStart,
      quoteEnd: q.quoteEnd || q.muteEnd,
      contextDialogue: q.contextDialogue,
      audioUrl: q.audioUrl || (q.introAudioUrl || ''),
      introAudioUrl: q.introAudioUrl || q.audioUrl || '',
      quoteAudioUrl: q.quoteAudioUrl || '',
      videoUrl: q.videoUrl || '',
      introVideoUrl: q.introVideoUrl || '',
      quoteVideoUrl: q.quoteVideoUrl || '',
      options: opts
    };
  }

  static verifyAnswer(questionId, selectedOption) {
    const q = this.getQuestionById(questionId);
    if (!q) return { success: false, message: 'Question not found' };

    const isCorrect = (selectedOption || '').trim() === (q.correctAnswer || '').trim();

    if (!q.stats) q.stats = { playedCount: 0, correctCount: 0 };
    q.stats.playedCount++;
    if (isCorrect) q.stats.correctCount++;
    saveJSON(QUESTIONS_FILE, questions);

    return {
      success: true,
      isCorrect,
      correctAnswer: q.correctAnswer,
      character: q.character,
      title: q.title,
      mediaType: q.mediaType,
      explanation: q.explanation,
      quoteStart: q.quoteStart || q.muteStart,
      quoteEnd: q.quoteEnd || q.muteEnd,
      audioUrl: q.audioUrl || (q.quoteAudioUrl || ''),
      introAudioUrl: q.introAudioUrl || '',
      quoteAudioUrl: q.quoteAudioUrl || q.audioUrl || '',
      videoUrl: q.videoUrl || '',
      introVideoUrl: q.introVideoUrl || '',
      quoteVideoUrl: q.quoteVideoUrl || ''
    };
  }

  static recordRoundCompleted() {
    totalRoundsPlayed++;
  }

  static addQuestion(data) {
    const id = 'q_' + Date.now().toString(36) + Math.random().toString(36).substr(2, 4);
    const newQ = {
      id,
      title: (data.title || '').trim(),
      mediaType: data.mediaType || 'movie',
      year: parseInt(data.year, 10) || new Date().getFullYear(),
      categories: Array.isArray(data.categories) ? data.categories : ['all', data.mediaType],
      difficulty: data.difficulty || 'medium',
      character: (data.character || '').trim(),
      clipDuration: parseFloat(data.clipDuration) || 12,
      muteStart: parseFloat(data.muteStart) || 4.5,
      muteEnd: parseFloat(data.muteEnd) || 8.0,
      quoteStart: parseFloat(data.quoteStart || data.muteStart) || 4.5,
      quoteEnd: parseFloat(data.quoteEnd || data.muteEnd) || 8.0,
      contextDialogue: (data.contextDialogue || '').trim(),
      correctAnswer: (data.correctAnswer || '').trim(),
      options: Array.isArray(data.options) ? data.options : [data.correctAnswer, data.option2, data.option3, data.option4],
      explanation: (data.explanation || '').trim(),
      audioUrl: (data.audioUrl || '').trim(),
      videoUrl: (data.videoUrl || '').trim(),
      stats: { playedCount: 0, correctCount: 0 }
    };
    questions.unshift(newQ);
    saveJSON(QUESTIONS_FILE, questions);
    return newQ;
  }

  static updateQuestion(id, patch) {
    const idx = questions.findIndex(q => q.id === id);
    if (idx === -1) return null;
    questions[idx] = { ...questions[idx], ...patch };
    saveJSON(QUESTIONS_FILE, questions);
    return questions[idx];
  }

  static deleteQuestion(id) {
    const idx = questions.findIndex(q => q.id === id);
    if (idx === -1) return false;
    questions.splice(idx, 1);
    saveJSON(QUESTIONS_FILE, questions);
    return true;
  }

  static addReport(report) {
    const newReport = {
      id: 'rep_' + Date.now().toString(36),
      questionId: report.questionId,
      reason: report.reason,
      details: report.details || '',
      createdAt: new Date().toISOString()
    };
    reports.unshift(newReport);
    saveJSON(REPORTS_FILE, reports);
    return newReport;
  }

  static getReports() {
    return reports;
  }

  static getStats() {
    return {
      totalQuestions: questions.length,
      totalReports: reports.length,
      totalRoundsPlayed
    };
  }
}

module.exports = QuoteDatabase;
