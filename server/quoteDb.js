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
    let pool = questions.filter(q => !excludeIds.includes(q.id));
    if (category && category !== 'all') {
      const catFiltered = pool.filter(q => (q.categories || []).includes(category) || q.mediaType === category);
      if (catFiltered.length >= 10) {
        pool = catFiltered;
      }
    }

    if (pool.length < 10) {
      pool = [...questions];
    }

    const shuffled = [...pool].sort(() => 0.5 - Math.random());
    let selected = [];
    const usedTitles = new Set();

    if (difficulty === 'mixed') {
      const easyPool = shuffled.filter(q => q.difficulty === 'easy');
      const medPool = shuffled.filter(q => q.difficulty === 'medium');
      const hardPool = shuffled.filter(q => q.difficulty === 'hard');

      const pickFrom = (subPool, count) => {
        let picked = 0;
        for (const q of subPool) {
          if (picked >= count) break;
          if (!usedTitles.has(q.title) && !selected.some(s => s.id === q.id)) {
            selected.push(q);
            usedTitles.add(q.title);
            picked++;
          }
        }
      };

      pickFrom(easyPool, 4);
      pickFrom(medPool, 4);
      pickFrom(hardPool, 2);
    } else if (difficulty && difficulty !== 'mixed') {
      const diffPool = shuffled.filter(q => q.difficulty === difficulty);
      for (const q of diffPool) {
        if (selected.length >= 10) break;
        if (!usedTitles.has(q.title)) {
          selected.push(q);
          usedTitles.add(q.title);
        }
      }
    }

    for (const q of shuffled) {
      if (selected.length >= 10) break;
      if (!selected.some(s => s.id === q.id)) {
        selected.push(q);
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
      contextDialogue: q.contextDialogue,
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
      quoteStart: q.quoteStart,
      quoteEnd: q.quoteEnd
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
