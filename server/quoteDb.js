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

class QuoteDatabase {
  static getAllQuestions() {
    return questions;
  }

  static getQuestionById(id) {
    return questions.find(q => q.id === id);
  }

  static selectRoundQuestions(category = 'all', difficulty = 'mixed', excludeIds = []) {
    const allPool = questions.filter(q => !excludeIds.includes(q.id));

    // Determine primary pool (category-filtered) and fallback pool
    let primaryPool = allPool;
    let paddingPool = [];
    if (category && category !== 'all') {
      const catFiltered = allPool.filter(q => (q.categories || []).includes(category) || q.mediaType === category);
      if (catFiltered.length > 0) {
        primaryPool = catFiltered;
        // Padding pool = other questions NOT in primary, to fill up to 10
        paddingPool = allPool.filter(q => !catFiltered.some(c => c.id === q.id));
      }
    }

    const shuffle = (arr) => [...arr].sort(() => 0.5 - Math.random());

    const shuffledPrimary = shuffle(primaryPool);
    const shuffledPadding = shuffle(paddingPool);

    let selected = [];
    const usedTitles = new Set();

    const pickFrom = (pool, count) => {
      for (const q of pool) {
        if (selected.length >= count) break;
        if (!usedTitles.has(q.title) && !selected.some(s => s.id === q.id)) {
          selected.push(q);
          usedTitles.add(q.title);
        }
      }
    };

    if (difficulty === 'mixed') {
      // Pick from primary pool first (respecting easy/med/hard ratio as much as possible)
      const pEasy = shuffledPrimary.filter(q => q.difficulty === 'easy');
      const pMed  = shuffledPrimary.filter(q => q.difficulty === 'medium');
      const pHard = shuffledPrimary.filter(q => q.difficulty === 'hard');

      // Try to get ratio from primary, don't exceed primary pool size
      const primaryCount = shuffledPrimary.length;
      const easyTarget = Math.min(4, Math.round(primaryCount * 0.4));
      const medTarget  = Math.min(4, Math.round(primaryCount * 0.4));
      const hardTarget = Math.min(2, Math.round(primaryCount * 0.2));

      pickFrom(pEasy, easyTarget);
      pickFrom(pMed,  selected.length + medTarget);
      pickFrom(pHard, selected.length + hardTarget);
      // Fill remaining primary slots (any difficulty)
      pickFrom(shuffledPrimary, 10);
      // Pad with other categories if still < 10
      pickFrom(shuffledPadding, 10);
    } else if (difficulty && difficulty !== 'mixed') {
      const pDiff = shuffledPrimary.filter(q => q.difficulty === difficulty);
      pickFrom(pDiff, 10);
      // If not enough of that difficulty in primary, try other primary questions
      pickFrom(shuffledPrimary, 10);
      // Pad with other categories
      const padDiff = shuffledPadding.filter(q => q.difficulty === difficulty);
      pickFrom(padDiff, 10);
      pickFrom(shuffledPadding, 10);
    } else {
      pickFrom(shuffledPrimary, 10);
      pickFrom(shuffledPadding, 10);
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
