/**
 * Persistent Storage & Analytics Engine for Thai Quote Game
 * Supports PostgreSQL (via DATABASE_URL on Render/Cloud) with an ACID Transactional File Engine fallback.
 * Strictly separates game statistics from users.json.
 */

const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const STATS_FILE = path.join(DATA_DIR, 'quote_stats.json');

let pgPool = null;
let usePostgres = false;

// In-memory transaction lock for file engine
let fileLock = Promise.resolve();

function withFileLock(fn) {
  const next = fileLock.then(fn, fn);
  fileLock = next.catch(() => {});
  return next;
}

function loadFileData() {
  try {
    if (!fs.existsSync(STATS_FILE)) {
      const initial = {
        migrations: [],
        rounds: {},
        answers: {},
        user_stats: {},
        category_stats: {}
      };
      fs.writeFileSync(STATS_FILE, JSON.stringify(initial, null, 2), 'utf8');
      return initial;
    }
    const raw = fs.readFileSync(STATS_FILE, 'utf8');
    return JSON.parse(raw);
  } catch (err) {
    console.error('Error loading quote_stats.json:', err);
    return { migrations: [], rounds: {}, answers: {}, user_stats: {}, category_stats: {} };
  }
}

function saveFileData(data) {
  const tmp = `${STATS_FILE}.tmp.${Date.now()}`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8');
  fs.renameSync(tmp, STATS_FILE);
}

class QuoteStatsDb {
  static async init() {
    if (process.env.DATABASE_URL) {
      try {
        const { Pool } = require('pg');
        pgPool = new Pool({
          connectionString: process.env.DATABASE_URL,
          ssl: process.env.DATABASE_URL.includes('localhost') ? false : { rejectUnauthorized: false }
        });
        const client = await pgPool.connect();
        try {
          await client.query('SELECT 1');
          usePostgres = true;
          console.log('[QuoteStatsDb] Connected to PostgreSQL successfully.');
          await this.runMigrationsPg(client);
          return;
        } finally {
          client.release();
        }
      } catch (err) {
        console.warn('[QuoteStatsDb] PostgreSQL connection failed, falling back to ACID File Engine:', err.message);
        usePostgres = false;
      }
    }

    // Fallback: Local transactional file engine
    await withFileLock(async () => {
      const data = loadFileData();
      if (!data.migrations.some(m => m.version === 1)) {
        data.migrations.push({
          version: 1,
          name: '001_initial_quote_stats',
          applied_at: Date.now()
        });
        saveFileData(data);
        console.log('[QuoteStatsDb] Applied migration 001 on local File Engine.');
      }
    });
  }

  static async runMigrationsPg(client) {
    const migrationSql = fs.readFileSync(
      path.join(__dirname, 'migrations', '001_initial_quote_stats.sql'),
      'utf8'
    );
    await client.query(migrationSql);
    await client.query(`
      INSERT INTO quote_schema_migrations (version, name, applied_at)
      VALUES (1, '001_initial_quote_stats', $1)
      ON CONFLICT (version) DO NOTHING;
    `, [Date.now()]);
    console.log('[QuoteStatsDb] Applied PostgreSQL migration 001.');
  }

  static isPostgres() {
    return usePostgres;
  }

  /**
   * Create a new round entry (status: in_progress)
   */
  static async createRound({ roundId, userId, username, mode = 'single', category = 'all', difficulty = 'mixed', totalQuestions = 10, startedAt = Date.now() }) {
    if (usePostgres) {
      await pgPool.query(`
        INSERT INTO quote_game_rounds
        (round_id, user_id, username, mode, category, difficulty, score, total_questions, status, started_at)
        VALUES ($1, $2, $3, $4, $5, $6, 0, $7, 'in_progress', $8)
        ON CONFLICT (round_id) DO NOTHING;
      `, [roundId, userId, username, mode, category, difficulty, totalQuestions, startedAt]);
      return { roundId, userId, username, mode, category, difficulty, status: 'in_progress', startedAt };
    }

    return withFileLock(async () => {
      const data = loadFileData();
      if (!data.rounds[roundId]) {
        data.rounds[roundId] = {
          round_id: roundId,
          user_id: userId,
          username,
          mode,
          category,
          difficulty,
          score: 0,
          total_questions: totalQuestions,
          status: 'in_progress',
          rank: null,
          total_players: 1,
          total_correct_time_ms: 0,
          started_at: startedAt,
          finished_at: null
        };
        saveFileData(data);
      }
      return data.rounds[roundId];
    });
  }

  /**
   * Record an answer with strict UNIQUE constraint on (round_id, user_id, question_id)
   * Returns { recorded: boolean, isDuplicate: boolean, answer: object }
   */
  static async recordAnswer({ roundId, userId, questionId, choiceId, isCorrect, responseTimeMs, serverTimestamp = Date.now(), isLate = false }) {
    const id = `${roundId}_${userId}_${questionId}`;

    if (usePostgres) {
      try {
        const res = await pgPool.query(`
          INSERT INTO quote_game_answers
          (id, round_id, user_id, question_id, choice_id, is_correct, response_time_ms, server_timestamp, is_late)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
          ON CONFLICT ON CONSTRAINT uq_round_user_question DO NOTHING
          RETURNING *;
        `, [id, roundId, userId, questionId, choiceId, isCorrect, responseTimeMs, serverTimestamp, isLate]);

        if (res.rows.length === 0) {
          // Duplicate answer detected!
          const existing = await pgPool.query(
            'SELECT * FROM quote_game_answers WHERE round_id = $1 AND user_id = $2 AND question_id = $3',
            [roundId, userId, questionId]
          );
          return { recorded: false, isDuplicate: true, answer: existing.rows[0] };
        }
        return { recorded: true, isDuplicate: false, answer: res.rows[0] };
      } catch (err) {
        console.error('Error recording answer in PG:', err);
        throw err;
      }
    }

    return withFileLock(async () => {
      const data = loadFileData();
      const uniqueKey = `${roundId}::${userId}::${questionId}`;
      if (data.answers[uniqueKey]) {
        return { recorded: false, isDuplicate: true, answer: data.answers[uniqueKey] };
      }

      const newAnswer = {
        id,
        round_id: roundId,
        user_id: userId,
        question_id: questionId,
        choice_id: choiceId,
        is_correct: !!isCorrect,
        response_time_ms: responseTimeMs,
        server_timestamp: serverTimestamp,
        is_late: !!isLate
      };

      data.answers[uniqueKey] = newAnswer;
      saveFileData(data);
      return { recorded: true, isDuplicate: false, answer: newAnswer };
    });
  }

  /**
   * Atomically finish a round and update user stats & category stats
   * Idempotent: If round is already finished, returns without double counting.
   */
  static async finishRound({ roundId, userId, username, score, totalCorrectTimeMs = 0, status = 'completed', rank = 1, totalPlayers = 1, finishedAt = Date.now(), categoryBreakdown = {} }) {
    if (usePostgres) {
      const client = await pgPool.connect();
      try {
        await client.query('BEGIN');

        // 1. Check current round status
        const roundRes = await client.query(
          'SELECT * FROM quote_game_rounds WHERE round_id = $1 FOR UPDATE',
          [roundId]
        );

        if (roundRes.rows.length === 0) {
          await client.query('ROLLBACK');
          return { success: false, message: 'Round not found' };
        }

        const currentRound = roundRes.rows[0];
        if (currentRound.status === 'completed' || currentRound.status === 'abandoned') {
          // Already finished - idempotent return
          await client.query('COMMIT');
          return { success: true, alreadyFinished: true, round: currentRound };
        }

        // 2. Update round
        await client.query(`
          UPDATE quote_game_rounds
          SET score = $1, total_correct_time_ms = $2, status = $3, rank = $4, total_players = $5, finished_at = $6
          WHERE round_id = $7
        `, [score, totalCorrectTimeMs, status, rank, totalPlayers, finishedAt, roundId]);

        // 3. If completed, update quote_user_stats & quote_user_category_stats
        if (status === 'completed') {
          // Count answers for this round
          const ansCountRes = await client.query(`
            SELECT
              COUNT(*) AS total_answered,
              SUM(CASE WHEN is_correct AND NOT is_late THEN 1 ELSE 0 END) AS total_correct
            FROM quote_game_answers
            WHERE round_id = $1 AND user_id = $2
          `, [roundId, userId]);

          const totalAnswered = parseInt(ansCountRes.rows[0]?.total_answered || '0', 10);
          const totalCorrect = parseInt(ansCountRes.rows[0]?.total_correct || '0', 10);

          const isMpWin = (currentRound.mode === 'multi' && rank === 1 && totalPlayers > 1) ? 1 : 0;
          const isFirst = (currentRound.mode === 'multi' && rank === 1) ? 1 : 0;
          const isSecond = (currentRound.mode === 'multi' && rank === 2) ? 1 : 0;
          const isThird = (currentRound.mode === 'multi' && rank === 3) ? 1 : 0;

          await client.query(`
            INSERT INTO quote_user_stats
            (user_id, username, completed_rounds, high_score, total_score, total_questions, total_correct, total_correct_time_ms, mp_wins, mp_first, mp_second, mp_third, updated_at)
            VALUES ($1, $2, 1, $3, $3, $4, $5, $6, $7, $8, $9, $10, $11)
            ON CONFLICT (user_id) DO UPDATE SET
              username = EXCLUDED.username,
              completed_rounds = quote_user_stats.completed_rounds + 1,
              high_score = GREATEST(quote_user_stats.high_score, EXCLUDED.high_score),
              total_score = quote_user_stats.total_score + EXCLUDED.total_score,
              total_questions = quote_user_stats.total_questions + EXCLUDED.total_questions,
              total_correct = quote_user_stats.total_correct + EXCLUDED.total_correct,
              total_correct_time_ms = quote_user_stats.total_correct_time_ms + EXCLUDED.total_correct_time_ms,
              mp_wins = quote_user_stats.mp_wins + EXCLUDED.mp_wins,
              mp_first = quote_user_stats.mp_first + EXCLUDED.mp_first,
              mp_second = quote_user_stats.mp_second + EXCLUDED.mp_second,
              mp_third = quote_user_stats.mp_third + EXCLUDED.mp_third,
              updated_at = EXCLUDED.updated_at;
          `, [userId, username || currentRound.username, score, totalAnswered, totalCorrect, totalCorrectTimeMs, isMpWin, isFirst, isSecond, isThird, finishedAt]);

          // Update category breakdown
          for (const [cat, counts] of Object.entries(categoryBreakdown)) {
            const catId = `${userId}_${cat}`;
            await client.query(`
              INSERT INTO quote_user_category_stats
              (id, user_id, category, total_questions, total_correct, updated_at)
              VALUES ($1, $2, $3, $4, $5, $6)
              ON CONFLICT (user_id, category) DO UPDATE SET
                total_questions = quote_user_category_stats.total_questions + EXCLUDED.total_questions,
                total_correct = quote_user_category_stats.total_correct + EXCLUDED.total_correct,
                updated_at = EXCLUDED.updated_at;
            `, [catId, userId, cat, counts.total || 0, counts.correct || 0, finishedAt]);
          }
        }

        await client.query('COMMIT');
        return { success: true, alreadyFinished: false };
      } catch (err) {
        await client.query('ROLLBACK');
        console.error('Error in finishRound PG transaction:', err);
        throw err;
      } finally {
        client.release();
      }
    }

    // Fallback: Local transactional file engine
    return withFileLock(async () => {
      const data = loadFileData();
      const currentRound = data.rounds[roundId];
      if (!currentRound) {
        return { success: false, message: 'Round not found' };
      }

      if (currentRound.status === 'completed' || currentRound.status === 'abandoned') {
        return { success: true, alreadyFinished: true, round: currentRound };
      }

      // Update round
      currentRound.score = score;
      currentRound.total_correct_time_ms = totalCorrectTimeMs;
      currentRound.status = status;
      currentRound.rank = rank;
      currentRound.total_players = totalPlayers;
      currentRound.finished_at = finishedAt;

      if (status === 'completed') {
        // Count answers
        let totalAnswered = 0;
        let totalCorrect = 0;
        for (const ans of Object.values(data.answers)) {
          if (ans.round_id === roundId && ans.user_id === userId) {
            totalAnswered++;
            if (ans.is_correct && !ans.is_late) totalCorrect++;
          }
        }

        const isMpWin = (currentRound.mode === 'multi' && rank === 1 && totalPlayers > 1) ? 1 : 0;
        const isFirst = (currentRound.mode === 'multi' && rank === 1) ? 1 : 0;
        const isSecond = (currentRound.mode === 'multi' && rank === 2) ? 1 : 0;
        const isThird = (currentRound.mode === 'multi' && rank === 3) ? 1 : 0;

        if (!data.user_stats[userId]) {
          data.user_stats[userId] = {
            user_id: userId,
            username: username || currentRound.username,
            completed_rounds: 0,
            high_score: 0,
            total_score: 0,
            total_questions: 0,
            total_correct: 0,
            total_correct_time_ms: 0,
            mp_wins: 0,
            mp_first: 0,
            mp_second: 0,
            mp_third: 0,
            updated_at: finishedAt
          };
        }

        const uStats = data.user_stats[userId];
        uStats.completed_rounds++;
        uStats.high_score = Math.max(uStats.high_score, score);
        uStats.total_score += score;
        uStats.total_questions += totalAnswered;
        uStats.total_correct += totalCorrect;
        uStats.total_correct_time_ms += totalCorrectTimeMs;
        uStats.mp_wins += isMpWin;
        uStats.mp_first += isFirst;
        uStats.mp_second += isSecond;
        uStats.mp_third += isThird;
        uStats.updated_at = finishedAt;

        // Update category stats
        for (const [cat, counts] of Object.entries(categoryBreakdown)) {
          const catKey = `${userId}::${cat}`;
          if (!data.category_stats[catKey]) {
            data.category_stats[catKey] = {
              id: `${userId}_${cat}`,
              user_id: userId,
              category: cat,
              total_questions: 0,
              total_correct: 0,
              updated_at: finishedAt
            };
          }
          data.category_stats[catKey].total_questions += (counts.total || 0);
          data.category_stats[catKey].total_correct += (counts.correct || 0);
          data.category_stats[catKey].updated_at = finishedAt;
        }
      }

      saveFileData(data);
      return { success: true, alreadyFinished: false };
    });
  }

  /**
   * Mark a round as abandoned (disconnected or exited mid-game)
   */
  static async abandonRound(roundId, userId) {
    if (usePostgres) {
      await pgPool.query(`
        UPDATE quote_game_rounds
        SET status = 'abandoned', finished_at = $1
        WHERE round_id = $2 AND status = 'in_progress';
      `, [Date.now(), roundId]);
      return;
    }

    return withFileLock(async () => {
      const data = loadFileData();
      if (data.rounds[roundId] && data.rounds[roundId].status === 'in_progress') {
        data.rounds[roundId].status = 'abandoned';
        data.rounds[roundId].finished_at = Date.now();
        saveFileData(data);
      }
    });
  }

  /**
   * Retrieve "My Stats" analytics for a user
   */
  static async getUserStats(userId) {
    if (usePostgres) {
      const statsRes = await pgPool.query(
        'SELECT * FROM quote_user_stats WHERE user_id = $1',
        [userId]
      );
      const catRes = await pgPool.query(
        'SELECT * FROM quote_user_category_stats WHERE user_id = $1',
        [userId]
      );

      const s = statsRes.rows[0] || {};
      const completedRounds = parseInt(s.completed_rounds || '0', 10);
      const highScore = parseInt(s.high_score || '0', 10);
      const totalScore = parseInt(s.total_score || '0', 10);
      const avgScore = completedRounds > 0 ? Math.round((totalScore / completedRounds) * 10) / 10 : 0;
      const totalAnswered = parseInt(s.total_questions || '0', 10);
      const totalCorrect = parseInt(s.total_correct || '0', 10);
      const totalCorrectTimeMs = parseInt(s.total_correct_time_ms || '0', 10);
      const avgAnswerTime = totalCorrect > 0
        ? Math.round((totalCorrectTimeMs / totalCorrect) / 100) / 10
        : 0;

      // Best category: must have >= 10 questions
      let bestCategory = null;
      let highestAccuracy = -1;
      for (const row of catRes.rows) {
        const qCount = parseInt(row.total_questions || '0', 10);
        const cCount = parseInt(row.total_correct || '0', 10);
        if (qCount >= 10) {
          const acc = Math.round((cCount / qCount) * 1000) / 10;
          if (acc > highestAccuracy) {
            highestAccuracy = acc;
            bestCategory = {
              category: row.category,
              totalQuestions: qCount,
              totalCorrect: cCount,
              accuracy: acc
            };
          }
        }
      }

      return {
        completedRounds,
        highScore,
        avgScore,
        totalAnswered,
        totalCorrect,
        totalCorrectTime: Math.round(totalCorrectTimeMs / 1000), // in seconds
        avgAnswerTime, // in seconds
        bestCategory, // null if < 10 questions in all categories
        multiplayerWins: parseInt(s.mp_wins || '0', 10),
        podiumFirst: parseInt(s.mp_first || '0', 10),
        podiumSecond: parseInt(s.mp_second || '0', 10),
        podiumThird: parseInt(s.mp_third || '0', 10)
      };
    }

    // Local transactional file engine
    return withFileLock(async () => {
      const data = loadFileData();
      const s = data.user_stats[userId] || {};

      const completedRounds = s.completed_rounds || 0;
      const highScore = s.high_score || 0;
      const totalScore = s.total_score || 0;
      const avgScore = completedRounds > 0 ? Math.round((totalScore / completedRounds) * 10) / 10 : 0;
      const totalAnswered = s.total_questions || 0;
      const totalCorrect = s.total_correct || 0;
      const totalCorrectTimeMs = s.total_correct_time_ms || 0;
      const avgAnswerTime = totalCorrect > 0
        ? Math.round((totalCorrectTimeMs / totalCorrect) / 100) / 10
        : 0;

      let bestCategory = null;
      let highestAccuracy = -1;
      for (const [key, row] of Object.entries(data.category_stats)) {
        if (row.user_id === userId) {
          const qCount = row.total_questions || 0;
          const cCount = row.total_correct || 0;
          if (qCount >= 10) {
            const acc = Math.round((cCount / qCount) * 1000) / 10;
            if (acc > highestAccuracy) {
              highestAccuracy = acc;
              bestCategory = {
                category: row.category,
                totalQuestions: qCount,
                totalCorrect: cCount,
                accuracy: acc
              };
            }
          }
        }
      }

      return {
        completedRounds,
        highScore,
        avgScore,
        totalAnswered,
        totalCorrect,
        totalCorrectTime: Math.round(totalCorrectTimeMs / 1000),
        avgAnswerTime,
        bestCategory,
        multiplayerWins: s.mp_wins || 0,
        podiumFirst: s.mp_first || 0,
        podiumSecond: s.mp_second || 0,
        podiumThird: s.mp_third || 0
      };
    });
  }

  /**
   * Rollback migration for zero-impact undo
   */
  static async rollbackMigration(targetVersion = 0) {
    if (usePostgres) {
      const client = await pgPool.connect();
      try {
        await client.query('BEGIN');
        const downSql = fs.readFileSync(
          path.join(__dirname, 'migrations', '001_initial_quote_stats.down.sql'),
          'utf8'
        );
        await client.query(downSql);
        await client.query('COMMIT');
        console.log('[QuoteStatsDb] Rollback to version 0 executed on PostgreSQL.');
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }
      return;
    }

    return withFileLock(async () => {
      const data = loadFileData();
      data.migrations = data.migrations.filter(m => m.version <= targetVersion);
      if (targetVersion === 0) {
        data.rounds = {};
        data.answers = {};
        data.user_stats = {};
        data.category_stats = {};
      }
      saveFileData(data);
      console.log('[QuoteStatsDb] Rollback to version 0 executed on local File Engine.');
    });
  }
}

module.exports = QuoteStatsDb;
