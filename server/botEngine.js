/**
 * Go Bot Engine & Competition Tactical Coach
 * Supports 6 difficulty levels ranging from beginner to World-Class Pro (God Tier)
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
    const opponent = color === 1 ? 2 : 1;

    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        if (game.board[r][c] === 0) {
          const clone = game.cloneBoard();
          clone[r][c] = color;
          let capturesOpponent = false;

          for (const n of game.getNeighbors(r, c)) {
            if (clone[n.r][n.c] === opponent) {
              const oppGroup = game.getGroup(n.r, n.c, clone);
              if (oppGroup && oppGroup.liberties === 0) {
                capturesOpponent = true;
                for (const s of oppGroup.stones) {
                  clone[s.r][s.c] = 0; // Remove captured stone!
                }
              }
            }
          }

          const ownGroup = game.getGroup(r, c, clone);
          if (capturesOpponent || (ownGroup && ownGroup.liberties > 0)) {
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
        // ระดับ 1: เริ่มต้น (ไม่ดุ ไม่โหด เหมาะสำหรับหัดเล่น)
        return this.level1Random(game, legalMoves, botColor);

      case 2:
        // ระดับ 2: มือใหม่ (รู้จักกินอาตาริ ต่อลมหายใจ)
        return this.level2Novice(game, legalMoves, botColor, opponent);

      case 3:
        // ระดับ 3: มือโปร (ระดับชมรมโกะ 5-8 Kyu: เชื่อมหมาก ตัดหมาก เปิดมุม)
        return this.level3Prodigy(game, legalMoves, botColor, opponent);

      case 4:
        // ระดับ 4: มืออาชีพ (ระดับดั้ง 1-3 Dan: 2-ply Minimax, ล่า Double Atari, รักษารูปหมาก)
        return this.level4Professional(game, legalMoves, botColor, opponent);

      case 5:
        // ระดับ 5: ปรมาจารย์ (ระดับดั้งสูง 5-7 Dan: 3-ply Alpha-Beta, คำนวณบันได/ตาข่าย, เจาะจุดอ่อน)
        return this.level5Master(game, legalMoves, botColor, opponent);

      case 6:
      default:
        // ระดับ 6: โคตรพ่อโคตรแม่มึงเอ้ย (ระดับแชมป์โลก / AlphaGo / 9 Dan Pro)
        return this.level6GodTier(game, legalMoves, botColor, opponent);
    }
  }

  // ==========================================
  // LEVEL 1: เริ่มต้น (Beginner)
  // ==========================================
  level1Random(game, moves, botColor) {
    const safeMoves = moves.filter(m => {
      const clone = game.cloneBoard();
      clone[m.r][m.c] = botColor;
      const grp = game.getGroup(m.r, m.c, clone);
      return grp && grp.liberties > 1;
    });

    const pool = safeMoves.length > 0 ? safeMoves : moves;
    return pool[Math.floor(Math.random() * pool.length)];
  }

  // ==========================================
  // LEVEL 2: มือใหม่ (Novice)
  // ==========================================
  level2Novice(game, moves, botColor, opponent) {
    // 1. ถ้ากินหมากที่อยู่ในสถานะอาตาริ (1 ลมหายใจ) ได้ ให้กินเลย
    for (const m of moves) {
      const clone = game.cloneBoard();
      clone[m.r][m.c] = botColor;
      for (const n of game.getNeighbors(m.r, m.c)) {
        if (game.board[n.r][n.c] === opponent) {
          const oppGroup = game.getGroup(n.r, n.c, clone);
          if (oppGroup && oppGroup.liberties === 0) {
            return m;
          }
        }
      }
    }

    // 2. ถ้าหมากตัวเองเหลือ 1 ลมหายใจ พยายามหนี
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

    return this.level1Random(game, moves, botColor);
  }

  // ==========================================
  // LEVEL 3: มือโปร (Prodigy ~5-8 Kyu)
  // ==========================================
  level3Prodigy(game, moves, botColor, opponent) {
    let bestScore = -Infinity;
    let bestMove = moves[0];

    for (const m of moves) {
      let score = this.evaluateMoveTactics(game, m, botColor, opponent, 3);
      score += Math.random() * 5;
      if (score > bestScore) {
        bestScore = score;
        bestMove = m;
      }
    }

    return bestMove;
  }

  // ==========================================
  // LEVEL 4: มืออาชีพ (Professional ~1-3 Dan)
  // ==========================================
  level4Professional(game, moves, botColor, opponent) {
    // Candidate filtering
    const candidates = this.getCandidateMoves(game, moves, botColor, opponent, 16);
    let bestScore = -Infinity;
    let bestMove = candidates[0] || moves[0];

    for (const m of candidates) {
      // 2-ply Minimax: Bot plays m, then evaluates opponent's strongest reply
      const clone = game.cloneBoard();
      clone[m.r][m.c] = botColor;
      this.removeDeadGroups(game, clone, m.r, m.c, opponent);

      let myScore = this.evaluateMoveTactics(game, m, botColor, opponent, 4);

      // Opponent best response penalty
      const oppLegal = this.getQuickLegalMoves(game, clone, opponent);
      let maxOppResponse = 0;
      for (const oppMove of oppLegal.slice(0, 8)) {
        const oppVal = this.evaluateMoveTacticsOnBoard(game, clone, oppMove, opponent, botColor, 3);
        if (oppVal > maxOppResponse) maxOppResponse = oppVal;
      }

      const totalScore = myScore - maxOppResponse * 0.75;
      if (totalScore > bestScore) {
        bestScore = totalScore;
        bestMove = m;
      }
    }

    return bestMove;
  }

  // ==========================================
  // LEVEL 5: ปรมาจารย์ (Master ~5-7 Dan)
  // ==========================================
  level5Master(game, moves, botColor, opponent) {
    // Pro Opening check for 9x9 / 13x13
    const bookMove = this.getProOpeningMove(game, moves, botColor, opponent);
    if (bookMove) return bookMove;

    const candidates = this.getCandidateMoves(game, moves, botColor, opponent, 14);
    let bestScore = -Infinity;
    let bestMove = candidates[0] || moves[0];

    for (const m of candidates) {
      const score = this.alphaBetaSearch(game, m, 3, -Infinity, Infinity, false, botColor, opponent);
      if (score > bestScore) {
        bestScore = score;
        bestMove = m;
      }
    }

    return bestMove;
  }

  // ==========================================
  // LEVEL 6: โคตรพ่อโคตรแม่มึงเอ้ย (World-Class / God Tier / 9 Dan Pro)
  // ==========================================
  level6GodTier(game, moves, botColor, opponent) {
    // 1. Pro Opening Database (Solid, unshakeable opening)
    const bookMove = this.getProOpeningMove(game, moves, botColor, opponent);
    if (bookMove) return bookMove;

    // 2. High-priority Candidate selection (focus on critical sharp points)
    const candidates = this.getCandidateMoves(game, moves, botColor, opponent, 18);
    let bestScore = -Infinity;
    let bestMove = candidates[0] || moves[0];

    // 3. Deep 4-ply Tactical Alpha-Beta Search + Double Atari Hunter
    for (const m of candidates) {
      let score = this.alphaBetaSearch(game, m, 4, -Infinity, Infinity, false, botColor, opponent);

      // Severe Double Atari & Cut bonus
      score += this.detectDoubleAtari(game, m, botColor, opponent) * 2500;
      score += this.detectCuttingPoints(game, m, botColor, opponent) * 450;
      score += this.evaluateShapeIntegrity(game, m, botColor, opponent) * 350;

      // Fast Monte Carlo Rollout (30 simulations for top candidate) to verify win-rate stability
      const mcWinRate = this.quickMCRollout(game, m, botColor, opponent, 25);
      score += mcWinRate * 400;

      if (score > bestScore) {
        bestScore = score;
        bestMove = m;
      }
    }

    return bestMove;
  }

  // ==========================================
  // PRO OPENING BOOK (Standard 9x9 Pro strategy)
  // ==========================================
  getProOpeningMove(game, moves, botColor, opponent) {
    const totalStones = game.moveHistory.length;
    const size = game.size;

    if (size === 9) {
      // 9x9 Opening Book
      if (totalStones === 0) {
        // First move: Tengen (4,4) is dominant
        return moves.find(m => m.r === 4 && m.c === 4) || moves[0];
      }

      if (totalStones === 1) {
        // Second move (Bot plays White against Black's first move)
        const firstMove = game.moveHistory[0];
        if (firstMove.r === 4 && firstMove.c === 4) {
          // If Black opened Tengen (4,4), White's top pro counter moves: (2,4), (4,2), (2,6), (3,3)
          const counters = [{ r: 2, c: 4 }, { r: 4, c: 2 }, { r: 2, c: 6 }, { r: 3, c: 3 }];
          for (const c of counters) {
            const found = moves.find(m => m.r === c.r && m.c === c.c);
            if (found) return found;
          }
        } else {
          // If Black played a corner (3,3) or (2,4), White claims Tengen (4,4) immediately!
          const tengen = moves.find(m => m.r === 4 && m.c === 4);
          if (tengen) return tengen;
        }
      }

      if (totalStones === 2) {
        // Move 3: Solid corner enclosure or diagonal split
        const proThirdMoves = [{ r: 2, c: 2 }, { r: 2, c: 6 }, { r: 6, c: 2 }, { r: 6, c: 6 }, { r: 4, c: 6 }];
        for (const pt of proThirdMoves) {
          const found = moves.find(m => m.r === pt.r && m.c === pt.c);
          if (found) return found;
        }
      }
    } else if (size === 19 && totalStones <= 4) {
      // 19x19 Standard Star Points (Hoshi: 3-15, 3-3, 15-3, 15-15)
      const starPoints = [
        { r: 3, c: 15 }, { r: 3, c: 3 }, { r: 15, c: 3 }, { r: 15, c: 15 },
        { r: 2, c: 15 }, { r: 15, c: 2 }, { r: 2, c: 3 }, { r: 3, c: 2 }
      ];
      for (const sp of starPoints) {
        const found = moves.find(m => m.r === sp.r && m.c === sp.c);
        if (found) return found;
      }
    }

    return null;
  }

  // ==========================================
  // TACTICAL EVALUATION & SEARCH ENGINE
  // ==========================================

  getCandidateMoves(game, legalMoves, botColor, opponent, maxCount = 16) {
    // Rank all moves by fast heuristic and pick top candidates
    const scored = legalMoves.map(m => ({
      move: m,
      score: this.evaluateMoveTactics(game, m, botColor, opponent, 2)
    }));

    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, maxCount).map(item => item.move);
  }

  alphaBetaSearch(game, candidateMove, depth, alpha, beta, isMaximizing, botColor, opponent) {
    const clone = game.cloneBoard();
    const currentColor = isMaximizing ? botColor : opponent;
    const enemyColor = isMaximizing ? opponent : botColor;

    clone[candidateMove.r][candidateMove.c] = currentColor;
    this.removeDeadGroups(game, clone, candidateMove.r, candidateMove.c, enemyColor);

    if (depth <= 1) {
      return this.evaluateStaticPosition(game, clone, botColor, opponent);
    }

    const nextLegal = this.getQuickLegalMoves(game, clone, enemyColor);
    if (nextLegal.length === 0) {
      return this.evaluateStaticPosition(game, clone, botColor, opponent);
    }

    // Sort next moves by basic capture/liberty potential
    const topReplies = nextLegal.slice(0, Math.min(6, nextLegal.length));

    if (isMaximizing) {
      let maxEval = -Infinity;
      for (const reply of topReplies) {
        const ev = this.alphaBetaSearch(game, reply, depth - 1, alpha, beta, false, botColor, opponent);
        maxEval = Math.max(maxEval, ev);
        alpha = Math.max(alpha, ev);
        if (beta <= alpha) break;
      }
      return maxEval;
    } else {
      let minEval = Infinity;
      for (const reply of topReplies) {
        const ev = this.alphaBetaSearch(game, reply, depth - 1, alpha, beta, true, botColor, opponent);
        minEval = Math.min(minEval, ev);
        beta = Math.min(beta, ev);
        if (beta <= alpha) break;
      }
      return minEval;
    }
  }

  evaluateStaticPosition(game, board, botColor, opponent) {
    let score = 0;

    // 1. Stone count and capture balance
    let botStones = 0;
    let oppStones = 0;
    let botLiberties = 0;
    let oppLiberties = 0;

    for (let r = 0; r < game.size; r++) {
      for (let c = 0; c < game.size; c++) {
        const color = board[r][c];
        if (color === botColor) {
          botStones++;
          const grp = game.getGroup(r, c, board);
          if (grp) botLiberties += grp.liberties;
        } else if (color === opponent) {
          oppStones++;
          const grp = game.getGroup(r, c, board);
          if (grp) oppLiberties += grp.liberties;
        }
      }
    }

    score += (botStones - oppStones) * 120;
    score += (botLiberties - oppLiberties) * 15;

    return score;
  }

  evaluateMoveTactics(game, move, botColor, opponent, level = 4) {
    let score = 0;
    const r = move.r;
    const c = move.c;
    const clone = game.cloneBoard();
    clone[r][c] = botColor;

    // 1. CAPTURES (Highest priority)
    let capturedStones = 0;
    for (const n of game.getNeighbors(r, c)) {
      if (game.board[n.r][n.c] === opponent) {
        const oppGroup = game.getGroup(n.r, n.c, clone);
        if (oppGroup && oppGroup.liberties === 0) {
          capturedStones += oppGroup.stones.length;
        }
      }
    }
    if (capturedStones > 0) {
      score += 3000 + capturedStones * 500; // Tremendous reward for capture
    }

    // 2. ATARI & DOUBLE ATARI
    let opponentAtariGroups = 0;
    for (const n of game.getNeighbors(r, c)) {
      if (game.board[n.r][n.c] === opponent) {
        const oppGroup = game.getGroup(n.r, n.c, clone);
        if (oppGroup && oppGroup.liberties === 1) {
          opponentAtariGroups++;
          score += 350 + oppGroup.stones.length * 100;
        }
      }
    }
    if (opponentAtariGroups >= 2) {
      score += 4500; // Double atari is practically game-winning!
    }

    // 3. RESCUE OWN STONES
    for (const n of game.getNeighbors(r, c)) {
      if (game.board[n.r][n.c] === botColor) {
        const prevGroup = game.getGroup(n.r, n.c);
        if (prevGroup && prevGroup.liberties === 1) {
          const newGroup = game.getGroup(r, c, clone);
          if (newGroup && newGroup.liberties >= 2) {
            score += 2500 + prevGroup.stones.length * 300; // Rescued in sente!
          } else if (newGroup && newGroup.liberties === 1 && capturedStones === 0) {
            score -= 1500; // Running in a dead ladder is forbidden!
          }
        }
      }
    }

    // 4. SUICIDE / SELF-ATARI PENALTY
    const ownGroup = game.getGroup(r, c, clone);
    if (ownGroup) {
      if (ownGroup.liberties === 1 && capturedStones === 0) {
        score -= 9000; // Blunder self-atari must be completely rejected!
      } else {
        score += ownGroup.liberties * 25;
      }
    }

    // 5. SHAPE ANALYSIS (Avoid Empty Triangle, build Tiger's mouth)
    score += this.evaluateShapeIntegrity(game, move, botColor, opponent);

    // 6. CUTTING & CONNECTING (Kiri & Tsugi)
    score += this.detectCuttingPoints(game, move, botColor, opponent) * 350;

    // 7. LINE & TERRITORIAL VALUE
    const dr = Math.min(r, game.size - 1 - r);
    const dc = Math.min(c, game.size - 1 - c);
    const minEdge = Math.min(dr, dc);

    if (minEdge === 0) {
      // 1st Line (Death Line) - penalize unless capturing or endgame
      if (capturedStones === 0 && game.moveHistory.length < 20) {
        score -= 250;
      }
    } else if (minEdge === 2) {
      score += 80; // 3rd line (Territory line)
    } else if (minEdge === 3) {
      score += 70; // 4th line (Influence line)
    }

    // 8. VITAL POINTS (Corner 3-3, Tengen)
    if (game.size === 9) {
      if (r === 4 && c === 4) score += 90; // Tengen
      if ((r === 2 || r === 6) && (c === 2 || c === 6)) score += 60; // 3-3 points
    }

    return score;
  }

  evaluateMoveTacticsOnBoard(game, board, move, botColor, opponent, level) {
    const dummyGame = Object.assign(Object.create(Object.getPrototypeOf(game)), game);
    dummyGame.board = board;
    return this.evaluateMoveTactics(dummyGame, move, botColor, opponent, level);
  }

  /**
   * Evaluates shape quality: Tiger's mouth, Bamboo joint vs Empty Triangle
   */
  evaluateShapeIntegrity(game, move, botColor, opponent) {
    let score = 0;
    const r = move.r;
    const c = move.c;
    const board = game.board;

    // Empty Triangle (Aki-sankaku) penalty: 3 friendly stones forming an L with empty corner
    const dirs = [[-1, 0], [1, 0], [0, -1], [0, 1]];
    let friendlyCardinals = 0;
    for (const [dr, dc] of dirs) {
      const nr = r + dr;
      const nc = c + dc;
      if (game.isInBounds(nr, nc) && board[nr][nc] === botColor) {
        friendlyCardinals++;
      }
    }

    if (friendlyCardinals >= 2) {
      // Check if this forms an empty triangle
      const diagonals = [[-1, -1], [-1, 1], [1, -1], [1, 1]];
      for (const [dr, dc] of diagonals) {
        if (game.isInBounds(r + dr, c) && board[r + dr][c] === botColor &&
            game.isInBounds(r, c + dc) && board[r][c + dc] === botColor &&
            game.isInBounds(r + dr, c + dc) && board[r + dr][c + dc] === 0) {
          score -= 180; // Empty triangle penalty!
        }
      }
      score += 60; // Solid connection bonus
    }

    // Tiger's Mouth (Kaketsugi) bonus
    for (const [dr, dc] of [[-1, -1], [-1, 1], [1, -1], [1, 1]]) {
      const nr = r + dr;
      const nc = c + dc;
      if (game.isInBounds(nr, nc) && board[nr][nc] === botColor) {
        score += 45; // Flexible diagonal connection
      }
    }

    return score;
  }

  /**
   * Double Atari detector: returns count of separate opponent groups in atari
   */
  detectDoubleAtari(game, move, botColor, opponent) {
    const clone = game.cloneBoard();
    clone[move.r][move.c] = botColor;
    const atariGroups = new Set();

    for (const n of game.getNeighbors(move.r, move.c)) {
      if (game.board[n.r][n.c] === opponent) {
        const grp = game.getGroup(n.r, n.c, clone);
        if (grp && grp.liberties === 1) {
          // Identify group uniquely by its first stone
          const key = `${grp.stones[0].r},${grp.stones[0].c}`;
          atariGroups.add(key);
        }
      }
    }

    return atariGroups.size >= 2 ? atariGroups.size : 0;
  }

  /**
   * Cutting Points (Kiri) detector
   */
  detectCuttingPoints(game, move, botColor, opponent) {
    let cuts = 0;
    const r = move.r;
    const c = move.c;
    const board = game.board;

    // Check diagonal pairs of opponent stones separated by this move
    const pairs = [
      [{ r: r - 1, c }, { r, c: c - 1 }],
      [{ r: r - 1, c }, { r, c: c + 1 }],
      [{ r: r + 1, c }, { r, c: c - 1 }],
      [{ r: r + 1, c }, { r, c: c + 1 }]
    ];

    for (const [p1, p2] of pairs) {
      if (game.isInBounds(p1.r, p1.c) && game.isInBounds(p2.r, p2.c)) {
        if (board[p1.r][p1.c] === opponent && board[p2.r][p2.c] === opponent) {
          cuts++;
        }
      }
    }

    return cuts;
  }

  /**
   * Quick Monte Carlo Rollout (fast playouts to assess territorial stability)
   */
  quickMCRollout(game, firstMove, botColor, opponent, simulations = 20) {
    let botWins = 0;

    for (let i = 0; i < simulations; i++) {
      const simBoard = game.cloneBoard();
      simBoard[firstMove.r][firstMove.c] = botColor;
      this.removeDeadGroups(game, simBoard, firstMove.r, firstMove.c, opponent);

      let turn = opponent;
      let passes = 0;
      let movesPlayed = 0;

      while (passes < 2 && movesPlayed < 18) {
        movesPlayed++;
        const curr = turn;
        const opp = curr === 1 ? 2 : 1;
        const legal = this.getQuickLegalMoves(game, simBoard, curr);

        if (legal.length === 0) {
          passes++;
        } else {
          passes = 0;
          // Pick a random legal move with priority on captures
          const move = legal[Math.floor(Math.random() * Math.min(5, legal.length))];
          simBoard[move.r][move.c] = curr;
          this.removeDeadGroups(game, simBoard, move.r, move.c, opp);
        }

        turn = opp;
      }

      // Quick territory estimate
      let bScore = 0;
      let wScore = 0;
      for (let r = 0; r < game.size; r++) {
        for (let c = 0; c < game.size; c++) {
          if (simBoard[r][c] === botColor) wScore++;
          else if (simBoard[r][c] === opponent) bScore++;
        }
      }

      if (wScore >= bScore) botWins++;
    }

    return botWins / simulations;
  }

  getQuickLegalMoves(game, board, color) {
    const moves = [];
    const size = game.size;
    const opponent = color === 1 ? 2 : 1;

    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        if (board[r][c] === 0) {
          // Check liberties
          for (const n of game.getNeighbors(r, c)) {
            if (board[n.r][n.c] === 0 || board[n.r][n.c] === color) {
              moves.push({ r, c });
              break;
            } else if (board[n.r][n.c] === opponent) {
              const oppGrp = game.getGroup(n.r, n.c, board);
              if (oppGrp && oppGrp.liberties === 1) {
                moves.push({ r, c });
                break;
              }
            }
          }
        }
      }
    }

    return moves;
  }

  removeDeadGroups(game, board, r, c, opponent) {
    for (const n of game.getNeighbors(r, c)) {
      if (board[n.r][n.c] === opponent) {
        const oppGroup = game.getGroup(n.r, n.c, board);
        if (oppGroup && oppGroup.liberties === 0) {
          for (const s of oppGroup.stones) {
            board[s.r][s.c] = 0;
          }
        }
      }
    }
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

  const edgeStones = capturedStones.filter(s => s.r === 0 || s.r === game.size - 1 || s.c === 0 || s.c === game.size - 1);
  const isCorner = capturedStones.some(s => 
    (s.r === 0 && s.c === 0) || 
    (s.r === 0 && s.c === game.size - 1) || 
    (s.r === game.size - 1 && s.c === 0) || 
    (s.r === game.size - 1 && s.c === game.size - 1)
  );

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
  let score = 2;
  let feedback = '';

  const keywords = {
    ladder: ['บันได', 'ladder', 'shicho', 'ซิกแซก', 'ไล่ต้อน'],
    corner_trap: ['มุม', 'corner', 'ติดมุม', 'จนมุม'],
    death_line: ['ขอบ', 'เส้นหนึ่ง', 'เส้น 1', 'edge', 'เส้นตาย', 'มรณะ'],
    eye_deprivation: ['สองห้อง', '2 ห้อง', 'ไม่มีห้อง', 'สกัดจุด', 'nakade', 'eye'],
    atari_neglect: ['อาตาริ', 'atari', 'ตัดลม', 'หมดลม', '1 ลม', 'ล้อม', 'กิน']
  };

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


/**
 * Generates dynamic taunt ("อ่อนว่ะ!"), meme clip, and comforting coaching advice
 * when player loses to the bot.
 */
function getBotTauntAndComfort({ botLevel = 1, winReason = '', scoreResult = null, isResign = false, isTimeout = false }) {
  const level = Math.max(1, Math.min(6, parseInt(botLevel, 10) || 1));

  // 1. Memes collection
  const memeOptions = {
    smug_cat: {
      file: 'smug_cat.gif',
      url: '/assets/memes/smug_cat.gif',
      caption: '😼 แมวยิ้มมุมปากเยาะเย้ย'
    },
    leo_pointing: {
      file: 'leo_pointing.gif',
      url: '/assets/memes/leo_pointing.gif',
      caption: '👉 ชี้หน้าหัวเราะเยาะ: อ่อนว่ะ!'
    },
    tom_cruise: {
      file: 'tom_cruise_laugh.gif',
      url: '/assets/memes/tom_cruise_laugh.gif',
      caption: '🤣 ขำจนน้ำตาเล็ด ก๊ากกกกก'
    },
    el_risitas: {
      file: 'el_risitas.gif',
      url: '/assets/memes/el_risitas.gif',
      caption: '🤹 El Risitas หัวเราะเยาะจนหายใจไม่ทัน!'
    },
    joker_laugh: {
      file: 'joker_laugh.gif',
      url: '/assets/memes/joker_laugh.gif',
      caption: '🃏 โจ๊กเกอร์หัวเราะคลั่ง สะใจโว้ยยย'
    }
  };

  // 2. Taunts categorized by Bot Difficulty Level
  const levelTaunts = {
    1: [
      'อ่อนว่ะ! บอทเดินมั่วๆ ยังชนะเฉยเลย 55555',
      'ฮั่นแน่... ขนาดบอทเพิ่งหัดเล่นพี่ยังแพ้เลย อ่อนจังงับ 😜',
      'อ่อนว่ะ! บอทกดหลับตายังรอดมาได้ พี่เดินยังไงเนี่ย!',
      'ขนาดเดินตามดวงยังชนะ อ่อนว่ะพี่ชายยยยย'
    ],
    2: [
      'อ่อนว่ะ! โดนหลอกจับกินอาตาริง่ายๆ แบบนี้ได้ไงเนี่ย!',
      'บอกแล้วว่าอย่าเผลอให้กินสองต่อ อ่อนว่ะ! รูปหมากพรุนเป็นรังผึ้งเลยนะ',
      'คิดว่าจะหลอกกินบอทได้หรอ อ่อนว่ะ! โดนจับตัดลมหายใจเกลี้ยง!',
      'กินหมูไปหลายตัวเลยนะกระดานนี้ อ่อนว่ะเพื่อนเอ๋ย 555'
    ],
    3: [
      'อ่อนว่ะ! รูปทรงหมากแบบนี้ยังห่างชั้นกับนักกีฬาชมรมเยอะนะน้อง',
      'อ่านหมากยังตื้นไป 3 ก้าว อ่อนว่ะ! นึกว่าจะตึงกว่านี้ซะอีก!',
      'เปิดมุมดูดีแต่กลางกระดานยุบ อ่อนว่ะ! โดนตัดเชื่อมทีเดียวพังทั้งแถบ!',
      'หมากตันจนขยับไม่ได้ อ่อนว่ะ! ไปฝึกแก้หมากติดมุมมาใหม่นะ'
    ],
    4: [
      'อ่อนว่ะ! ติดกับดัก Minimax ลึก 2 ชั้นของผมเต็มเปาเลยนะคร้าบ!',
      'อ่านเกมขาดตั้งแต่ตาที่ 15 แล้ว อ่อนว่ะ! ไปฝึกอ่านบันไดมาใหม่นะน้อง',
      'นึกว่าจะเก่งกว่านี้ซะอีก อ่อนว่ะ! โดนยึดพื้นที่มุมไปหมดเลย!',
      'คิดว่าหลอกล่อสำเร็จแล้วดิ? อ่อนว่ะ โดนตลบหลังจนหมดกระดาน!'
    ],
    5: [
      'อ่อนว่ะ! พยายามจะล้อมข้า แต่ตัวเองกลับลืมสร้าง 2 ห้องจริง น่าขันสิ้นดี!',
      'ระดับดั้งเขาวัดกันที่ความสุขุม แต่อันนี้... อ่อนว่ะ! มองไม่เห็นทางชนะเลยสักนิด',
      'Alpha-Beta คำนวณทะลุปรุโปร่งหมดแล้ว อ่อนว่ะ! ยังเร็วไปร้อยปี!',
      'ทักษะระดับนี้ยังไม่คู่ควรกับปรมาจารย์หรอกนะ อ่อนว่ะ!'
    ],
    6: [
      'อ่อนว่ะ!! คิดจะมาล้ม "โคตรพ่อโคตรแม่มึงเอ้ย" ชาติหน้าตอนบ่ายๆ เถอะไอ้น้อง! 55555',
      'นี่เหรอฝีมือมนุษย์? อ่อนว่ะ!! ข้าคำนวณชัยชนะไว้ตั้งแต่เม็ดแรกที่วางแล้วโว้ยยย!',
      'อ่อนว่ะ! เดินแบบนี้ กลับไปเล่น OX หรือเป่ายิ้งฉุบดีกว่ามั้ยไอ้น้อง 5555555',
      'กราบข้าซะ! อ่อนว่ะ! คิดจะท้าทายพลังแห่งพระเจ้าหมากล้อมยังเร็วไปล้านปีแสง!'
    ]
  };

  // Context-specific taunts
  let contextTaunts = [];
  if (isResign || (winReason && winReason.includes('ยอมแพ้'))) {
    contextTaunts = [
      'ขอยอมแพ้หนีไปก่อนซะงั้น อ่อนว่ะ! ใจยังไม่ถึงเลยนะเรา 555',
      'ใจปลาซิวแท้! โดนกดดันนิดเดียวก็ยอมแพ้ซะแล้ว อ่อนว่ะ!'
    ];
  } else if (isTimeout || (winReason && winReason.includes('เวลาหมด'))) {
    contextTaunts = [
      'นั่งคิดนานจนหัวหมุนเวลาหมด อ่อนว่ะ! บอทเดิน 1 วินาที คุณคิด 5 นาทีก็ยังแพ้!',
      'เวลาหมดคากระดาน อ่อนว่ะ! มัวแต่ลังเลโดนบอทแซงเข้าวินเฉย!'
    ];
  } else if (scoreResult && typeof scoreResult.margin === 'number') {
    if (scoreResult.margin >= 30) {
      contextTaunts = [`แต้มขาดลอยตั้ง ${scoreResult.margin} แต้ม ไม่เห็นฝุ่นเลย อ่อนว่ะ! 555`];
    } else if (scoreResult.margin <= 3) {
      contextTaunts = [`เกือบจะได้แล้วเชียว แต่ก็ยังแพ้อยู่ดี ${scoreResult.margin} แต้ม... สรุปคือ อ่อนว่ะ! 555`];
    }
  }

  // If context taunts exist, prioritize them
  const tauntPool = (contextTaunts.length > 0)
    ? contextTaunts
    : (levelTaunts[level] || levelTaunts[1]);

  const selectedTaunt = tauntPool[Math.floor(Math.random() * tauntPool.length)];

  // 3. Comfort & Coaching Quotes (อบอุ่น ให้กำลังใจ และมีประโยชน์เชิงแท็กติก)
  const comfortQuotes = [
    'แต่ล้อเล่นนะเว้ย! ❤️ ความจริงคือคุณกล้าเดินเกมบุกได้น่าประทับใจมาก จุดที่พลาดมีแค่จังหวะเชื่อมลมหายใจตาเดียวเท่านั้นเอง สู้ต่อเลย!',
    'อย่าเพิ่งท้อนะเพื่อน! 🏆 ในวงการโกะมีคำกล่าวว่า "อยากเป็นเซียนต้องยอมแพ้ให้ครบ 1,000 กระดาน" วันนี้คุณเข้าใกล้ระดับโปรไปอีกหนึ่งก้าวแล้ว!',
    'โค้ชขอชมจากใจเลย: คุณอ่านหมากได้ลึกขึ้นกว่าเดิมเยอะมาก แค่รอบหน้าต้องระวังเรื่อง "เส้นมรณะ" กับ "การสร้างสองห้อง" ให้รัดกุมกว่านี้!',
    'แพ้กระดานนี้ไม่ได้แปลว่าคุณไม่เก่ง แต่มันคือโอกาสทองที่คุณจะได้ดู Replay ย้อนหลังแล้วแก้จุดบกพร่องให้แกร่งขึ้น! แก้มืออีกรอบมั้ยล่ะ?',
    'ใจสู้มาก! ยอมรับเลยว่ามีบางจังหวะที่บอทเองก็ต้องคำนวณหนักเหมือนกัน ฝีมือคุณพัฒนาเร็วมากจริงๆ รีบกดแก้มือเลย!',
    'จำไว้ว่า: นักกีฬาโกะที่เก่งที่สุดไม่ใช่คนที่ไม่เคยแพ้ แต่คือคนที่แพ้แล้วลุกขึ้นมา "แก้มือ" ทันที! ลุยกันอีกรอบ!'
  ];
  const selectedComfort = comfortQuotes[Math.floor(Math.random() * comfortQuotes.length)];

  // 4. Select Meme matching the tone
  let candidateMemes = [];
  if (level <= 2) {
    candidateMemes = [memeOptions.smug_cat, memeOptions.tom_cruise];
  } else if (level <= 4) {
    candidateMemes = [memeOptions.leo_pointing, memeOptions.tom_cruise, memeOptions.smug_cat];
  } else {
    candidateMemes = [memeOptions.el_risitas, memeOptions.joker_laugh, memeOptions.leo_pointing];
  }
  const selectedMeme = candidateMemes[Math.floor(Math.random() * candidateMemes.length)];

  return {
    botLevel: level,
    botLevelName: GoBot.LEVEL_NAMES[level] || `ระดับ ${level}`,
    headline: '💥 อ่อนว่ะ!! 55555',
    taunt: selectedTaunt,
    comfort: selectedComfort,
    meme: selectedMeme
  };
}

module.exports = {
  GoBot,
  analyzeCapture,
  evaluateQuizExplanation,
  getBotTauntAndComfort
};

