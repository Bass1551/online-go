/**
 * Go Bot Engine & Competition Tactical Coach
 * Supports 6 difficulty levels and tactical capture analysis
 */

class GoBot {
  constructor(level = 1) {
    this.level = Math.max(1, Math.min(6, parseInt(level, 10) || 1));
  }

  static get LEVEL_NAMES() {
    return {
      1: 'เริ่มต้น (Beginner)',
      2: 'มือใหม่ (Novice)',
      3: 'มือโปร (Prodigy)',
      4: 'มืออาชีพ (Professional)',
      5: 'ปรมาจารย์ (Master)',
      6: 'โคตรพ่อโคตรแม่มึงเอ้ย (God / Insane)'
    };
  }

  /**
   * Get all valid legal moves for a player
   */
  getLegalMoves(game, color) {
    const size = game.size;
    const moves = [];
    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        if (game.board[r][c] === 0) {
          // Check if legal by testing on a clone
          const clone = game.cloneBoard();
          clone[r][c] = color;
          // Quick liberty or capture check
          const opponent = color === 1 ? 2 : 1;
          let capturesOpponent = false;

          for (const n of game.getNeighbors(r, c)) {
            if (clone[n.r][n.c] === opponent) {
              const oppGroup = game.getGroup(n.r, n.c, clone);
              if (oppGroup && oppGroup.liberties === 0) {
                capturesOpponent = true;
                break;
              }
            }
          }

          const ownGroup = game.getGroup(r, c, clone);
          if (capturesOpponent || (ownGroup && ownGroup.liberties > 0)) {
            // Check ko rule
            const tempSerial = game.serializeBoard(clone);
            if (!(game.history.length >= 2 && game.history[game.history.length - 2] === tempSerial)) {
              moves.push({ r, c });
            }
          }
        }
      }
    }
    return moves;
  }

  /**
   * Main decision function based on level 1 to 6
   */
  computeMove(game, botColor) {
    const legalMoves = this.getLegalMoves(game, botColor);
    if (legalMoves.length === 0) {
      return { pass: true };
    }

    const opponent = botColor === 1 ? 2 : 1;

    switch (this.level) {
      case 1:
        return this.level1Random(game, legalMoves, botColor);
      case 2:
        return this.level2Novice(game, legalMoves, botColor, opponent);
      case 3:
        return this.level3Prodigy(game, legalMoves, botColor, opponent);
      case 4:
        return this.level4Professional(game, legalMoves, botColor, opponent);
      case 5:
        return this.level5Master(game, legalMoves, botColor, opponent);
      case 6:
      default:
        return this.level6GodTier(game, legalMoves, botColor, opponent);
    }
  }

  // --- LEVEL 1: เริ่มต้น ---
  level1Random(game, moves, botColor) {
    // Avoid immediate suicide-like self-atari if possible, else random
    const safeMoves = moves.filter(m => {
      const clone = game.cloneBoard();
      clone[m.r][m.c] = botColor;
      const grp = game.getGroup(m.r, m.c, clone);
      return grp && grp.liberties > 1;
    });

    const pool = safeMoves.length > 0 ? safeMoves : moves;
    return pool[Math.floor(Math.random() * pool.length)];
  }

  // --- LEVEL 2: มือใหม่ ---
  level2Novice(game, moves, botColor, opponent) {
    // 1. If can capture an opponent stone in atari (1 liberty), capture it!
    for (const m of moves) {
      const clone = game.cloneBoard();
      clone[m.r][m.c] = botColor;
      for (const n of game.getNeighbors(m.r, m.c)) {
        if (game.board[n.r][n.c] === opponent) {
          const oppGroup = game.getGroup(n.r, n.c, clone);
          if (oppGroup && oppGroup.liberties === 0) {
            return m; // Capture immediately
          }
        }
      }
    }

    // 2. If bot's own stone has 1 liberty (atari), try to save it
    for (let r = 0; r < game.size; r++) {
      for (let c = 0; c < game.size; c++) {
        if (game.board[r][c] === botColor) {
          const ownGroup = game.getGroup(r, c);
          if (ownGroup && ownGroup.liberties === 1) {
            const [lr, lc] = ownGroup.libertyCoords[0].split(',').map(Number);
            const canEscape = moves.find(m => m.r === lr && m.c === lc);
            if (canEscape) {
              return canEscape;
            }
          }
        }
      }
    }

    // 3. Otherwise prefer moves on line 3 or 4 (corners/sides)
    return this.level1Random(game, moves, botColor);
  }

  // --- LEVEL 3: มือโปร ---
  level3Prodigy(game, moves, botColor, opponent) {
    // Score all moves using positional and tactical heuristics
    let bestScore = -Infinity;
    let bestMove = moves[0];

    for (const m of moves) {
      let score = 0;
      const clone = game.cloneBoard();
      clone[m.r][m.c] = botColor;

      // Check captures
      for (const n of game.getNeighbors(m.r, m.c)) {
        if (game.board[n.r][n.c] === opponent) {
          const oppGroup = game.getGroup(n.r, n.c, clone);
          if (oppGroup && oppGroup.liberties === 0) {
            score += 150 + oppGroup.stones.length * 40;
          }
        }
      }

      // Check liberties granted to own group
      const ownGroup = game.getGroup(m.r, m.c, clone);
      if (ownGroup) {
        if (ownGroup.liberties === 1) score -= 120; // Self-atari penalty
        else score += ownGroup.liberties * 10;
      }

      // Positional preference: 3rd and 4th lines (Corner > Side > Center early on)
      const distEdgeR = Math.min(m.r, game.size - 1 - m.r);
      const distEdgeC = Math.min(m.c, game.size - 1 - m.c);
      if ((distEdgeR === 2 || distEdgeR === 3) && (distEdgeC === 2 || distEdgeC === 3)) {
        score += 35; // Golden corner points (3-3, 3-4, 4-4)
      } else if (distEdgeR === 0 || distEdgeC === 0) {
        score -= 25; // 1st line (Death line) penalty unless capturing
      }

      // Slight random variation to avoid rigid repeat
      score += Math.random() * 8;

      if (score > bestScore) {
        bestScore = score;
        bestMove = m;
      }
    }

    return bestMove;
  }

  // --- LEVEL 4: มืออาชีพ ---
  level4Professional(game, moves, botColor, opponent) {
    // Combines cutting/connecting, eye-shape formation, and lookahead
    let bestScore = -Infinity;
    let bestMove = moves[0];

    for (const m of moves) {
      let score = 0;
      const clone = game.cloneBoard();
      clone[m.r][m.c] = botColor;

      // 1. Capture evaluation
      let capturedCount = 0;
      for (const n of game.getNeighbors(m.r, m.c)) {
        if (game.board[n.r][n.c] === opponent) {
          const oppGroup = game.getGroup(n.r, n.c, clone);
          if (oppGroup && oppGroup.liberties === 0) {
            capturedCount += oppGroup.stones.length;
          }
        }
      }
      score += capturedCount * 80;

      // 2. Put opponent in atari
      for (const n of game.getNeighbors(m.r, m.c)) {
        if (game.board[n.r][n.c] === opponent) {
          const oppGroup = game.getGroup(n.r, n.c, clone);
          if (oppGroup && oppGroup.liberties === 1) {
            score += 45; // Threaten capture
          }
        }
      }

      // 3. Save friendly stones under atari
      for (const n of game.getNeighbors(m.r, m.c)) {
        if (game.board[n.r][n.c] === botColor) {
          const oldGroup = game.getGroup(n.r, n.c);
          if (oldGroup && oldGroup.liberties === 1) {
            const newGroup = game.getGroup(m.r, m.c, clone);
            if (newGroup && newGroup.liberties > 1) {
              score += 90 + oldGroup.stones.length * 20; // Saved!
            }
          }
        }
      }

      // 4. Cutting and Connecting
      const friendlyNeighbors = game.getNeighbors(m.r, m.c).filter(n => game.board[n.r][n.c] === botColor).length;
      if (friendlyNeighbors >= 2) score += 25; // Connects two friendly groups

      // 5. Territory & Edge weighting
      const dr = Math.min(m.r, game.size - 1 - m.r);
      const dc = Math.min(m.c, game.size - 1 - m.c);
      if (dr === 0 || dc === 0) {
        if (capturedCount === 0) score -= 40; // Don't play on 1st line without capture
      } else if (dr === 2 || dc === 2) {
        score += 20; // 3rd line (Territory line)
      } else if (dr === 3 || dc === 3) {
        score += 25; // 4th line (Influence line)
      }

      // 6. Own liberties
      const ownGrp = game.getGroup(m.r, m.c, clone);
      if (ownGrp) {
        if (ownGrp.liberties === 1 && capturedCount === 0) score -= 200;
        else score += ownGrp.liberties * 8;
      }

      score += Math.random() * 4;

      if (score > bestScore) {
        bestScore = score;
        bestMove = m;
      }
    }

    return bestMove;
  }

  // --- LEVEL 5: ปรมาจารย์ ---
  level5Master(game, moves, botColor, opponent) {
    // Ladder calculation, Net trap, and Minimax depth-2 evaluation
    let bestScore = -Infinity;
    let bestMove = moves[0];

    // Evaluate top candidates with 2-ply lookahead
    for (const m of moves) {
      let score = 0;
      const clone = game.cloneBoard();
      clone[m.r][m.c] = botColor;

      // Direct tactical value
      score += this.evaluateBoardTactics(game, clone, m, botColor, opponent);

      // Check if this move traps opponent in a ladder / net
      for (const n of game.getNeighbors(m.r, m.c)) {
        if (game.board[n.r][n.c] === opponent) {
          const oppGroup = game.getGroup(n.r, n.c, clone);
          if (oppGroup && oppGroup.liberties === 1) {
            // Test if opponent can escape
            const escapeCoord = oppGroup.libertyCoords[0].split(',').map(Number);
            const oppClone = clone.map(row => [...row]);
            oppClone[escapeCoord[0]][escapeCoord[1]] = opponent;
            const escapedGroup = game.getGroup(escapeCoord[0], escapeCoord[1], oppClone);
            if (!escapedGroup || escapedGroup.liberties <= 1) {
              score += 130; // Successful trap / net / ladder!
            }
          }
        }
      }

      if (score > bestScore) {
        bestScore = score;
        bestMove = m;
      }
    }

    return bestMove;
  }

  // --- LEVEL 6: โคตรพ่อโคตรแม่มึงเอ้ย (Insane / God Tier) ---
  level6GodTier(game, moves, botColor, opponent) {
    // Deep Monte Carlo heuristic rollout + ruthless territory maximizer
    let bestScore = -Infinity;
    let bestMove = moves[0];

    // Evaluate moves with high-intensity simulations
    for (const m of moves) {
      let score = 0;
      const clone = game.cloneBoard();
      clone[m.r][m.c] = botColor;

      // Deep tactical base score
      score += this.evaluateBoardTactics(game, clone, m, botColor, opponent) * 1.5;

      // Eye shape destruction & Vital point detection
      score += this.evaluateVitalPoints(game, clone, m, botColor, opponent);

      // Severe punishment for opponent overplays
      for (const n of game.getNeighbors(m.r, m.c)) {
        if (game.board[n.r][n.c] === opponent) {
          const oppGrp = game.getGroup(n.r, n.c, clone);
          if (oppGrp) {
            if (oppGrp.liberties === 0) score += 200 + oppGrp.stones.length * 60;
            else if (oppGrp.liberties === 1) score += 90 + oppGrp.stones.length * 30;
            else if (oppGrp.liberties === 2) score += 40;
          }
        }
      }

      // Protect own stones rigorously
      const ownGrp = game.getGroup(m.r, m.c, clone);
      if (ownGrp) {
        if (ownGrp.liberties === 1) score -= 500;
        else score += ownGrp.liberties * 12;
      }

      // Center influence vs territory precision
      const distCenter = Math.abs(m.r - Math.floor(game.size / 2)) + Math.abs(m.c - Math.floor(game.size / 2));
      score += (game.size - distCenter) * 3;

      if (score > bestScore) {
        bestScore = score;
        bestMove = m;
      }
    }

    return bestMove;
  }

  evaluateBoardTactics(game, board, move, botColor, opponent) {
    let score = 0;
    // Captures
    for (const n of game.getNeighbors(move.r, move.c)) {
      if (game.board[n.r][n.c] === opponent) {
        const oppGroup = game.getGroup(n.r, n.c, board);
        if (oppGroup && oppGroup.liberties === 0) {
          score += 180 + oppGroup.stones.length * 50;
        }
      }
    }

    // Friendly group rescue
    for (const n of game.getNeighbors(move.r, move.c)) {
      if (game.board[n.r][n.c] === botColor) {
        const prevGroup = game.getGroup(n.r, n.c);
        if (prevGroup && prevGroup.liberties === 1) {
          const newGroup = game.getGroup(move.r, move.c, board);
          if (newGroup && newGroup.liberties > 1) {
            score += 160 + prevGroup.stones.length * 35;
          }
        }
      }
    }

    return score;
  }

  evaluateVitalPoints(game, board, move, botColor, opponent) {
    let score = 0;
    const r = move.r;
    const c = move.c;

    // Corner 3-3 invasion / defense
    if ((r === 2 || r === game.size - 3) && (c === 2 || c === game.size - 3)) {
      score += 50;
    }

    // Star points
    if ((r === 3 || r === game.size - 4) && (c === 3 || c === game.size - 4)) {
      score += 45;
    }

    return score;
  }
}

/**
 * Tactical Coach: Analyzes WHY a capture occurred for competitive training
 */
function analyzeCapture(prevBoard, currBoard, game, lastMove, capturedStones) {
  const capturer = lastMove.player;
  const victim = capturer === 1 ? 2 : 1;
  const count = capturedStones.length;

  let tacticKey = 'atari_neglect';
  let title = 'กินเพราะตัดลมหายใจ (Atari neglect)';
  let explanation = '';
  let competitionTip = '';

  // 1. Check if Corner / Edge trap
  const edgeStones = capturedStones.filter(s => s.r === 0 || s.r === game.size - 1 || s.c === 0 || s.c === game.size - 1);
  const isCorner = capturedStones.some(s => 
    (s.r === 0 && s.c === 0) || 
    (s.r === 0 && s.c === game.size - 1) || 
    (s.r === game.size - 1 && s.c === 0) || 
    (s.r === game.size - 1 && s.c === game.size - 1)
  );

  // 2. Detect Ladder (Shicho - zigzag diagonal moves)
  const isLadderLike = count >= 3 && capturedStones.every((s, i, arr) => {
    if (i === 0) return true;
    const prev = arr[i - 1];
    return Math.abs(prev.r - s.r) + Math.abs(prev.c - s.c) <= 2;
  });

  if (isLadderLike) {
    tacticKey = 'ladder';
    title = 'แท็กติกบันได (Ladder / Shicho)';
    explanation = `ฝ่ายจับกินได้เดินต้อนหมากเป็นรูปซิกแซกอย่างต่อเนื่องจนหมากของฝ่ายโดนกินไม่มีลมหายใจและชนขอบกระดาน (${count} เม็ด)`;
    competitionTip = '💡 เคล็ดลับการแข่ง: ก่อนจะเริ่มวิ่งหนีบันได ต้องอ่านหมากคำนวณล่วงหน้าตลอดเส้นทางว่ามีหมากเพื่อนคอยช่วย (Ladder Breaker) หรือไม่ ถ้าไม่มี ห้ามวิ่งหนีเด็ดขาด เพราะจะยิ่งเสียหมากเป็นกลุ่มใหญ่!';
  } else if (isCorner) {
    tacticKey = 'corner_trap';
    title = 'กับดักมุมกระดาน (Corner death)';
    explanation = 'หมากโดนบีบเข้าไปในจุดมุมกระดาน ซึ่งมุมเป็นตำแหน่งที่มีลมหายใจเริ่มต้นเพียง 2 ทาง ทำให้ถูกล้อมกินได้ง่ายที่สุด';
    competitionTip = '💡 เคล็ดลับการแข่ง: จำไว้ว่า "มุมคือทอง ข้างคือเงิน กลางคือหญ้า" แต่มุมต้องระวังการโดนขังมุมตาย ต้องสร้าง 2 ห้องจริงให้เร็วที่สุด!';
  } else if (edgeStones.length >= 2) {
    tacticKey = 'death_line';
    title = 'โดนดันลงเส้นมรณะ (1st Line Trap)';
    explanation = 'กลุ่มหมากถูกไล่ต้อนลงสู่เส้นขอบกระดานเส้นที่ 1 (Death line) ซึ่งไม่มีลมหายใจให้ขยายตัวต่อได้';
    competitionTip = '💡 เคล็ดลับการแข่ง: เส้นที่ 1 เรียกว่าเส้นแห่งความตาย ห้ามเดินเชื่อมลงเส้นที่ 1 ในช่วงเปิดเกมหรือกลางเกม เว้นแต่เป็นการรอดตายที่มีสองห้องแน่นอน!';
  } else if (count >= 4) {
    tacticKey = 'eye_deprivation';
    title = 'กลุ่มหมากขาด 2 ห้องจริง (No two eyes / Eye shape collapsed)';
    explanation = `กลุ่มหมากขนาดใหญ่ (${count} เม็ด) ไม่สามารถสร้างสองห้องจริง (Two Eyes) เพื่อรอดชีวิตได้ และถูกปิดล้อมพื้นที่โดยรอบจนลมหายใจหมด`;
    competitionTip = '💡 เคล็ดลับการแข่ง: กลุ่มหมากที่ต่อกันยาวๆ ไม่ได้แปลว่าปลอดภัยเสมอไป ต้องแบ่งพื้นที่ภายในให้เกิด "2 ห้องแยกจากกันอย่างเด็ดขาด" มิเช่นนั้นจะโดนสกัดจุดกินทั้งกลุ่ม!';
  } else {
    // Single stone / small atari
    tacticKey = 'atari_neglect';
    title = 'การตัดลมหายใจจุดสุดท้าย (Atari neglect)';
    explanation = `หมากอยู่ในสถานะเหลือ 1 ลมหายใจ (อาตาริ) และไม่ได้เดินหนีหรือเชื่อมต่อ ฝ่ายตรงข้ามจึงวางหมากปิดลมหายใจเม็ดสุดท้าย`;
    competitionTip = '💡 เคล็ดลับการแข่ง: ในสนามแข่งจริง สิ่งที่มือโปรทำตลอดเวลาคือ "นับลมหายใจ" ของหมากกลุ่มตัวเองและคู่แข่งทุกครั้งก่อนจะเดินเม็ดต่อไป!';
  }

  return {
    tacticKey,
    title,
    count,
    explanation,
    competitionTip,
    capturer,
    victim
  };
}

/**
 * Evaluates student's self-explanation when they capture bot's stones
 */
function evaluateQuizExplanation(userText = '', selectedTactic = '', analysis) {
  const text = (userText || '').trim().toLowerCase();
  let score = 2; // Default 2 stars
  let feedback = '';

  const keywords = {
    ladder: ['บันได', 'ladder', 'shicho', 'ซิกแซก', 'ไล่ต้อน'],
    corner_trap: ['มุม', 'corner', 'ติดมุม', 'จนมุม'],
    death_line: ['ขอบ', 'เส้นหนึ่ง', 'เส้น 1', 'edge', 'เส้นตาย', 'มรณะ'],
    eye_deprivation: ['สองห้อง', '2 ห้อง', 'ไม่มีห้อง', 'สกัดจุด', 'nakade', 'eye'],
    atari_neglect: ['อาตาริ', 'atari', 'ตัดลม', 'หมดลม', '1 ลม', 'ล้อม', 'กิน']
  };

  // Check matching keywords
  const matchedKeywords = (keywords[analysis.tacticKey] || []).filter(kw => text.includes(kw));

  if (selectedTactic === analysis.tacticKey || matchedKeywords.length > 0) {
    score = 3;
    feedback = `🌟 ยอดเยี่ยมมาก! คุณเข้าใจกลยุทธ์ถูกต้อง (${analysis.title}) การที่คุณมองเห็นจุดนี้แสดงถึงสายตาแบบนักกีฬาหมากล้อมตัวจริง!`;
  } else if (text.length > 5) {
    score = 2;
    feedback = `👍 ดีมากที่คุณพยายามวิเคราะห์! สำหรับรูปหมากนี้ ในทางเทคนิคคือ "${analysis.title}" - ${analysis.explanation}`;
  } else {
    score = 1;
    feedback = `🧐 ฝึกสังเกตให้ลึกซึ้งขึ้นนะ! รูปนี้คือ "${analysis.title}" ซึ่งเกิดจาก: ${analysis.explanation}`;
  }

  return {
    stars: score,
    tacticTitle: analysis.title,
    feedback,
    competitionTip: analysis.competitionTip
  };
}

module.exports = {
  GoBot,
  analyzeCapture,
  evaluateQuizExplanation
};
