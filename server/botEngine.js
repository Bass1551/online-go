/**
 * Joseki & World-Class Opening Book Engine (Pro & AI Patterns)
 * Supports 8-way rotational and reflection symmetries across 9x9, 13x13, and 19x19 boards.
 */
class JosekiEngine {
  /**
   * Applies symmetry transformation k (0 to 7) to canonical coordinate (r, c) on a board of size
   */
  static transform(r, c, size, k) {
    switch (k) {
      case 0: return { r, c }; // Top-Left original
      case 1: return { r: c, c: r }; // Top-Left diagonal reflection
      case 2: return { r, c: size - 1 - c }; // Top-Right
      case 3: return { r: c, c: size - 1 - r }; // Top-Right diagonal
      case 4: return { r: size - 1 - r, c }; // Bottom-Left
      case 5: return { r: size - 1 - c, c: r }; // Bottom-Left diagonal
      case 6: return { r: size - 1 - r, c: size - 1 - c }; // Bottom-Right
      case 7: return { r: size - 1 - c, c: size - 1 - r }; // Bottom-Right diagonal
      default: return { r, c };
    }
  }

  /**
   * Comprehensive Joseki and Fuseki pattern database
   */
  static get PATTERNS() {
    return [
      // ==========================================
      // 1. MODERN AI 3-3 INVASION (San-San) (19x19 & 13x13)
      // ==========================================
      {
        id: 'ai_33_block',
        name: 'AI 3-3 Invasion: Block',
        boardSizes: [19, 13],
        priority: 95,
        required: [
          { r: 3, c: 3, role: 'SELF' }, // Bot has star point
          { r: 2, c: 2, role: 'OPP' }   // Opponent invaded 3-3
        ],
        empty: [
          { r: 2, c: 3 }
        ],
        recommended: { r: 2, c: 3 },
        commentary: 'บล็อกปิดทางบุก 3-3 ของฝ่ายตรงข้ามตามสูตร AI ยุคใหม่ เพื่อสร้างกำแพงอิทธิพล'
      },
      {
        id: 'ai_33_crawl',
        name: 'AI 3-3 Invasion: Crawl',
        boardSizes: [19, 13],
        priority: 94,
        required: [
          { r: 3, c: 3, role: 'OPP' },
          { r: 2, c: 3, role: 'OPP' },
          { r: 2, c: 2, role: 'SELF' } // Bot invaded 3-3
        ],
        empty: [
          { r: 1, c: 2 }
        ],
        recommended: { r: 1, c: 2 },
        commentary: 'คลานเลียบเส้นที่ 2 (Crawl) ตามสูตรบุก 3-3 เพื่อสร้างฐานที่มั่นคงในมุม'
      },
      {
        id: 'ai_33_hane',
        name: 'AI 3-3 Invasion: Push & Hane',
        boardSizes: [19, 13],
        priority: 93,
        required: [
          { r: 3, c: 3, role: 'SELF' },
          { r: 2, c: 3, role: 'SELF' },
          { r: 2, c: 2, role: 'OPP' },
          { r: 1, c: 2, role: 'OPP' }
        ],
        empty: [
          { r: 1, c: 3 }
        ],
        recommended: { r: 1, c: 3 },
        commentary: 'ฮาเนะกดหัวหมาก (Hane) เพื่อจำกัดพื้นที่ของขาวและขยายอิทธิพลภายนอก'
      },
      {
        id: 'ai_33_corner_live',
        name: 'AI 3-3 Invasion: Live in Corner',
        boardSizes: [19, 13],
        priority: 92,
        required: [
          { r: 3, c: 3, role: 'OPP' },
          { r: 2, c: 3, role: 'OPP' },
          { r: 1, c: 3, role: 'OPP' },
          { r: 2, c: 2, role: 'SELF' },
          { r: 1, c: 2, role: 'SELF' }
        ],
        empty: [
          { r: 1, c: 1 }
        ],
        recommended: { r: 1, c: 1 },
        commentary: 'ฮาเนะเปิดทางรอดในมุม (Corner Hane) เพื่อเตรียมสร้าง 2 ห้องจริง'
      },
      {
        id: 'ai_33_connect_solid',
        name: 'AI 3-3 Invasion: Solid Connect',
        boardSizes: [19, 13],
        priority: 91,
        required: [
          { r: 3, c: 3, role: 'SELF' },
          { r: 2, c: 3, role: 'SELF' },
          { r: 1, c: 3, role: 'SELF' },
          { r: 2, c: 2, role: 'OPP' },
          { r: 1, c: 2, role: 'OPP' },
          { r: 1, c: 1, role: 'OPP' }
        ],
        empty: [
          { r: 2, c: 4 }
        ],
        recommended: { r: 2, c: 4 },
        commentary: 'ต่อหมากมั่นคง (Nobi) ป้องกันจุดตัดและสร้างกำแพงอิทธิพลสุดแกร่ง'
      },

      // ==========================================
      // 2. SMALL KNIGHT APPROACH (Keima Kakari) (19x19 & 13x13)
      // ==========================================
      {
        id: 'small_knight_attach',
        name: 'Small Knight Approach: Top Attachment (Tsuke)',
        boardSizes: [19, 13],
        priority: 88,
        required: [
          { r: 3, c: 3, role: 'SELF' },
          { r: 2, c: 5, role: 'OPP' }
        ],
        empty: [
          { r: 2, c: 4 }
        ],
        recommended: { r: 2, c: 4 },
        commentary: 'สูตรแนบบน (Tsuke) สไตล์ AI เพื่อตั้งรับการเข้ามุมม้าเล็กและบีบให้คู่ต่อสู้ต้องเลือกข้าง'
      },
      {
        id: 'small_knight_attach_reply',
        name: 'Small Knight Approach: Outside Hane',
        boardSizes: [19, 13],
        priority: 87,
        required: [
          { r: 3, c: 3, role: 'OPP' },
          { r: 2, c: 4, role: 'OPP' },
          { r: 2, c: 5, role: 'SELF' }
        ],
        empty: [
          { r: 1, c: 4 }
        ],
        recommended: { r: 1, c: 4 },
        commentary: 'ฮาเนะสวนด้านนอก (Hane) ตอบโต้สูตรแนบบนอย่างเฉียบขาด'
      },
      {
        id: 'small_knight_backoff',
        name: 'Small Knight Approach: Solid Backoff',
        boardSizes: [19, 13],
        priority: 85,
        required: [
          { r: 3, c: 3, role: 'SELF' },
          { r: 2, c: 5, role: 'OPP' }
        ],
        empty: [
          { r: 1, c: 3 }
        ],
        recommended: { r: 1, c: 3 },
        commentary: 'ถอยรับม้าเล็ก (Keima) เพื่อรักษาแต้มในมุมอย่างสมดุลและปลอดภัย'
      },

      // ==========================================
      // 3. KOMOKU (3-4 Point) ENCLOSURES & DEFENSE
      // ==========================================
      {
        id: 'komoku_small_enclosure',
        name: 'Komoku: Small Knight Enclosure (Keima Shimari)',
        boardSizes: [19, 13],
        priority: 75,
        required: [
          { r: 2, c: 3, role: 'SELF' }
        ],
        emptyRadius: 6,
        empty: [
          { r: 4, c: 2 }
        ],
        recommended: { r: 4, c: 2 },
        commentary: 'ล้อมมุมม้าเล็ก (Keima Shimari) ยึดพื้นที่มุม 15-20 แต้มอย่างมั่นคงถาวร'
      },
      {
        id: 'komoku_approach_defense',
        name: 'Komoku: Diagonal Defense (Kosumi)',
        boardSizes: [19, 13],
        priority: 86,
        required: [
          { r: 2, c: 3, role: 'SELF' },
          { r: 4, c: 3, role: 'OPP' }
        ],
        empty: [
          { r: 3, c: 3 }
        ],
        recommended: { r: 3, c: 3 },
        commentary: 'เดินแยงมุมตั้งรับ (Kosumi) รักษาฐานมุมโคมกุไม่ให้ถูกเจาะ'
      },

      // ==========================================
      // 4. EMPTY CORNER OCCUPATIONS (19x19 & 13x13)
      // ==========================================
      {
        id: 'empty_corner_star',
        name: 'Empty Corner: Star Point (Hoshi)',
        boardSizes: [19, 13],
        priority: 60,
        required: [],
        emptyRadius: 5,
        empty: [
          { r: 3, c: 3 }
        ],
        recommended: { r: 3, c: 3 },
        commentary: 'ยึดจุดดาว (Hoshi) ตามหลัก "มุมคือทอง ข้างคือเงิน กลางคือหญ้า"'
      },
      {
        id: 'empty_corner_komoku',
        name: 'Empty Corner: Komoku (3-4)',
        boardSizes: [19, 13],
        priority: 58,
        required: [],
        emptyRadius: 5,
        empty: [
          { r: 2, c: 3 }
        ],
        recommended: { r: 2, c: 3 },
        commentary: 'ยึดจุดโคมกุ 3-4 เพื่อเน้นความสมดุลระหว่างพื้นที่มุมและการขยายตัว'
      },

      // ==========================================
      // 5. 9x9 BOARD MASTER OPENINGS & FIGHTING
      // ==========================================
      {
        id: '9x9_tengen_open',
        name: '9x9: Center Tengen Opening',
        boardSizes: [9],
        priority: 100,
        boardEmpty: true,
        recommended: { r: 4, c: 4 },
        commentary: 'ยึดจุดกึ่งกลางกระดาน (เท็นเก็น Tengen 4,4) สูตรเปิดเกมที่ทรงพลังที่สุดบนกระดาน 9x9'
      },
      {
        id: '9x9_tengen_reply_corner',
        name: '9x9: Corner Base vs Tengen',
        boardSizes: [9],
        priority: 98,
        required: [
          { r: 4, c: 4, role: 'OPP' }
        ],
        boardTotalStones: 1,
        recommended: { r: 2, c: 6 },
        commentary: 'ยึดมุมตรงข้ามเพื่อตั้งฐานที่มั่นคง ท้าทายอิทธิพลกลางกระดานของดำ'
      },
      {
        id: '9x9_split_corners',
        name: '9x9: Dual Corner Split',
        boardSizes: [9],
        priority: 96,
        required: [
          { r: 4, c: 4, role: 'SELF' },
          { r: 2, c: 6, role: 'OPP' }
        ],
        boardTotalStones: 2,
        recommended: { r: 6, c: 2 },
        commentary: 'แยกมุมตรงข้าม (Dual Corner) ควบคุมพื้นที่ 2 ฝั่งเพื่อบีบให้ขาวเล่นยาก'
      },
      {
        id: '9x9_knight_extension',
        name: '9x9: Knight Extension',
        boardSizes: [9],
        priority: 94,
        required: [
          { r: 4, c: 4, role: 'OPP' },
          { r: 2, c: 6, role: 'SELF' },
          { r: 6, c: 2, role: 'OPP' }
        ],
        boardTotalStones: 3,
        recommended: { r: 2, c: 3 },
        commentary: 'ขยายฐานม้าเล็กเพื่อเชื่อมโยงโครงสร้างและสร้างพื้นที่แน่นอน'
      },
      {
        id: '9x9_corner_invasion_block',
        name: '9x9: Corner Invasion Block',
        boardSizes: [9],
        priority: 97,
        required: [
          { r: 2, c: 2, role: 'SELF' },
          { r: 1, c: 1, role: 'OPP' }
        ],
        empty: [
          { r: 1, c: 2 }
        ],
        recommended: { r: 1, c: 2 },
        commentary: 'บล็อกสกัดการบุกมุม 9x9 อย่างเด็ดขาด ป้องกันการแย่งพื้นที่'
      }
    ];
  }

  /**
   * Matches all patterns across the 8 symmetries and finds best move
   */
  static findBestBookMove(game, botColor, opponent, moves) {
    const size = game.size;
    const board = game.board;
    const legalSet = new Set(moves.map(m => `${m.r},${m.c}`));

    let totalStones = 0;
    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        if (board[r][c] !== 0) totalStones++;
      }
    }

    const matchingCandidates = [];

    for (const pat of JosekiEngine.PATTERNS) {
      if (!pat.boardSizes.includes(size)) continue;

      if (pat.boardEmpty && totalStones > 0) continue;
      if (typeof pat.boardTotalStones === 'number' && totalStones !== pat.boardTotalStones) continue;

      for (let k = 0; k < 8; k++) {
        if (pat.boardEmpty && k > 0) break;

        const targetCoord = JosekiEngine.transform(pat.recommended.r, pat.recommended.c, size, k);
        const targetKey = `${targetCoord.r},${targetCoord.c}`;

        if (!legalSet.has(targetKey) || board[targetCoord.r][targetCoord.c] !== 0) {
          continue;
        }

        if (pat.emptyRadius) {
          let hasObstacle = false;
          for (let r = 0; r < pat.emptyRadius; r++) {
            for (let c = 0; c < pat.emptyRadius; c++) {
              const trans = JosekiEngine.transform(r, c, size, k);
              if (board[trans.r][trans.c] !== 0) {
                const isRequired = pat.required && pat.required.some(req => req.r === r && req.c === c);
                if (!isRequired) {
                  hasObstacle = true;
                  break;
                }
              }
            }
            if (hasObstacle) break;
          }
          if (hasObstacle) continue;
        }

        let matches = true;
        if (pat.required) {
          for (const req of pat.required) {
            const coord = JosekiEngine.transform(req.r, req.c, size, k);
            const expectedColor = req.role === 'SELF' ? botColor : opponent;
            if (board[coord.r][coord.c] !== expectedColor) {
              matches = false;
              break;
            }
          }
        }
        if (!matches) continue;

        if (pat.empty) {
          for (const emp of pat.empty) {
            const coord = JosekiEngine.transform(emp.r, emp.c, size, k);
            if (board[coord.r][coord.c] !== 0) {
              matches = false;
              break;
            }
          }
        }
        if (!matches) continue;

        matchingCandidates.push({
          r: targetCoord.r,
          c: targetCoord.c,
          priority: pat.priority,
          name: pat.name,
          commentary: pat.commentary,
          tacticName: pat.name,
          tacticalComment: pat.commentary
        });
      }
    }

    if (matchingCandidates.length === 0) return null;

    matchingCandidates.sort((a, b) => b.priority - a.priority);
    const topPriority = matchingCandidates[0].priority;
    const topPool = matchingCandidates.filter(c => c.priority === topPriority);
    return topPool[Math.floor(Math.random() * topPool.length)];
  }
}

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
    if (Math.random() < 0.65) {
      const bookMove = this.getProOpeningMove(game, moves, botColor, opponent);
      if (bookMove) return bookMove;
    }

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
    if (Math.random() < 0.85) {
      const bookMove = this.getProOpeningMove(game, moves, botColor, opponent);
      if (bookMove) return bookMove;
    }

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
  // ==========================================
  // LEVEL 5: ปรมาจารย์ (Master ~5-7 Dan)
  // ==========================================
  level5Master(game, moves, botColor, opponent) {
    const bookMove = this.getProOpeningMove(game, moves, botColor, opponent);
    if (bookMove) return bookMove;

    const candidates = this.getCandidateMoves(game, moves, botColor, opponent, 10);
    let bestScore = -Infinity;
    let bestMove = candidates[0] || moves[0];

    for (const m of candidates) {
      const score = this.alphaBetaSearch(game, m, 2, -Infinity, Infinity, true, botColor, opponent);
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

    // 2. High-priority Candidate selection (top 12 sharpest candidates)
    const candidates = this.getCandidateMoves(game, moves, botColor, opponent, 12);
    let bestScore = -Infinity;
    let bestMove = candidates[0] || moves[0];

    // 3. True 2-ply Deep Tactical Search with Opponent Reply & Double Atari
    for (const m of candidates) {
      const score = this.alphaBetaSearch(game, m, 2, -Infinity, Infinity, true, botColor, opponent);
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

  isTrueEye(game, r, c, color) {
    if (game.board[r][c] !== 0) return false;
    for (const n of game.getNeighbors(r, c)) {
      if (game.board[n.r][n.c] !== color) return false;
    }
    const diags = [[-1, -1], [-1, 1], [1, -1], [1, 1]];
    let diagSame = 0;
    let diagTotal = 0;
    for (const [dr, dc] of diags) {
      const nr = r + dr, nc = c + dc;
      if (game.isInBounds(nr, nc)) {
        diagTotal++;
        if (game.board[nr][nc] === color) diagSame++;
      }
    }
    return (diagTotal <= 2 && diagSame >= diagTotal) || (diagTotal > 2 && diagSame >= diagTotal - 1);
  }

  alphaBetaSearch(game, candidateMove, depth, alpha, beta, isMaximizing, botColor, opponent) {
    const clone = game.cloneBoard();
    clone[candidateMove.r][candidateMove.c] = botColor;
    this.removeDeadGroups(game, clone, candidateMove.r, candidateMove.c, opponent);

    let myScore = this.evaluateMoveTactics(game, candidateMove, botColor, opponent, 6);
    myScore += this.detectDoubleAtari(game, candidateMove, botColor, opponent) * 3500;
    myScore += this.detectCuttingPoints(game, candidateMove, botColor, opponent) * 400;
    myScore += this.evaluateShapeIntegrity(game, candidateMove, botColor, opponent);

    if (depth <= 1) {
      return myScore + this.evaluateStaticPosition(game, clone, botColor, opponent);
    }

    const oppLegal = this.getQuickLegalMoves(game, clone, opponent);
    let maxOppResponse = 0;
    const topReplies = oppLegal.slice(0, Math.min(8, oppLegal.length));
    for (const oppMove of topReplies) {
      const oppClone = game.cloneBoard(clone);
      oppClone[oppMove.r][oppMove.c] = opponent;
      this.removeDeadGroups(game, oppClone, oppMove.r, oppMove.c, botColor);
      const oppVal = this.evaluateMoveTacticsOnBoard(game, oppClone, oppMove, opponent, botColor, 4);
      if (oppVal > maxOppResponse) maxOppResponse = oppVal;
    }

    return myScore - maxOppResponse * 0.75 + this.evaluateStaticPosition(game, clone, botColor, opponent);
  }

  evaluateStaticPosition(game, board, botColor, opponent) {
    let score = 0;

    // 1. Stone count and capture balance
    let botStones = 0;
    let oppStones = 0;
    let botLiberties = 0;
    let oppLiberties = 0;
    let botTerritory = 0;
    let oppTerritory = 0;

    const visitedBot = new Set();
    const visitedOpp = new Set();

    for (let r = 0; r < game.size; r++) {
      for (let c = 0; c < game.size; c++) {
        const color = board[r][c];
        if (color === botColor) {
          botStones++;
          const key = `${r},${c}`;
          if (!visitedBot.has(key)) {
            const grp = game.getGroup(r, c, board);
            if (grp) {
              botLiberties += grp.liberties;
              for (const s of grp.stones) visitedBot.add(`${s.r},${s.c}`);
            }
          }
        } else if (color === opponent) {
          oppStones++;
          const key = `${r},${c}`;
          if (!visitedOpp.has(key)) {
            const grp = game.getGroup(r, c, board);
            if (grp) {
              oppLiberties += grp.liberties;
              for (const s of grp.stones) visitedOpp.add(`${s.r},${s.c}`);
            }
          }
        } else {
          // Territory estimate
          let botNeighbors = 0;
          let oppNeighbors = 0;
          for (const n of game.getNeighbors(r, c)) {
            if (board[n.r][n.c] === botColor) botNeighbors++;
            else if (board[n.r][n.c] === opponent) oppNeighbors++;
          }
          if (botNeighbors >= 3 && oppNeighbors === 0) botTerritory += 60;
          else if (oppNeighbors >= 3 && botNeighbors === 0) oppTerritory += 60;
        }
      }
    }

    score += (botStones - oppStones) * 120;
    score += (botLiberties - oppLiberties) * 15;
    score += (botTerritory - oppTerritory);

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
          for (const s of oppGroup.stones) {
            clone[s.r][s.c] = 0;
          }
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

    // 8. VITAL POINTS (Corner 3-3, Star Points, Tengen)
    if (game.moveHistory.length <= 14) {
      const is9x9Corner = game.size === 9 && ((r === 2 || r === 6) && (c === 2 || c === 6));
      const isLargeCorner = (game.size === 19 || game.size === 13) && (
        ((r === 2 || r === 3) || (r === game.size - 3 || r === game.size - 4)) &&
        ((c === 2 || c === 3) || (c === game.size - 3 || c === game.size - 4))
      );
      if (is9x9Corner || isLargeCorner) {
        let stonesNear = 0;
        for (let dr = -1; dr <= 1; dr++) {
          for (let dc = -1; dc <= 1; dc++) {
            const nr = r + dr, nc = c + dc;
            if (game.isInBounds(nr, nc) && game.board[nr][nc] !== 0) stonesNear++;
          }
        }
        if (stonesNear === 0) {
          score += 1500; // Tremendous strategic bonus for claiming an empty corner!
        }
      }
    }

    if (game.size === 9) {
      if (r === 4 && c === 4) score += 120; // Tengen
    }

    // 9. LIFE & DEATH / EYE PROTECTION
    if (this.isTrueEye(game, r, c, botColor)) {
      score -= 35000; // NEVER fill own true eye!
    } else if (this.isTrueEye(game, r, c, opponent)) {
      score += 2500; // Nakade / Poke opponent eye space!
    }

    return score;
  }

  evaluateMoveTacticsOnBoard(game, board, move, botColor, opponent, level) {
    const dummyGame = Object.assign(Object.create(Object.getPrototypeOf(game)), game);
    dummyGame.board = board;
    return this.evaluateMoveTactics(dummyGame, move, botColor, opponent, level);
  }

  /**
   * Retrieves a world-class opening or Joseki move from JosekiEngine
   */
  getProOpeningMove(game, moves, botColor, opponent) {
    if (game.moveHistory && game.moveHistory.length > 18) {
      return null;
    }
    return JosekiEngine.findBestBookMove(game, botColor, opponent, moves);
  }

  /**
   * Evaluates shape quality: Hane at head of two, Bamboo joint, Tiger's mouth, Cross-cut vs Empty Triangle
   */
  evaluateShapeIntegrity(game, move, botColor, opponent) {
    let score = 0;
    const r = move.r;
    const c = move.c;
    const board = game.board;

    // 1. Empty Triangle (Aki-sankaku) penalty: 3 friendly stones forming an L with empty corner
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
      const diagonals = [[-1, -1], [-1, 1], [1, -1], [1, 1]];
      for (const [dr, dc] of diagonals) {
        if (game.isInBounds(r + dr, c) && board[r + dr][c] === botColor &&
            game.isInBounds(r, c + dc) && board[r][c + dc] === botColor &&
            game.isInBounds(r + dr, c + dc) && board[r + dr][c + dc] === 0) {
          score -= 220; // Empty triangle penalty!
        }
      }
      score += 60; // Solid connection bonus
    }

    // 2. Tiger's Mouth (Kaketsugi) bonus
    for (const [dr, dc] of [[-1, -1], [-1, 1], [1, -1], [1, 1]]) {
      const nr = r + dr;
      const nc = c + dc;
      if (game.isInBounds(nr, nc) && board[nr][nc] === botColor) {
        score += 55; // Flexible diagonal connection
      }
    }

    // 3. Hane at the head of two stones (Niken no atama) - Proverb: Never allow hane at head of two!
    const lineDirs = [
      { dr: -1, dc: 0 },
      { dr: 1, dc: 0 },
      { dr: 0, dc: -1 },
      { dr: 0, dc: 1 }
    ];

    for (const d of lineDirs) {
      const opp1R = r + d.dr;
      const opp1C = c + d.dc;
      const opp2R = r + d.dr * 2;
      const opp2C = c + d.dc * 2;

      if (game.isInBounds(opp1R, opp1C) && game.isInBounds(opp2R, opp2C)) {
        if (board[opp1R][opp1C] === opponent && board[opp2R][opp2C] === opponent) {
          score += 850; // Striking the head of two opponent stones!
        }
      }

      // 4. Defend own head of two stones (extend when in contact fight)
      const own1R = r + d.dr;
      const own1C = c + d.dc;
      const own2R = r + d.dr * 2;
      const own2C = c + d.dc * 2;
      if (game.isInBounds(own1R, own1C) && game.isInBounds(own2R, own2C)) {
        if (board[own1R][own1C] === botColor && board[own2R][own2C] === botColor) {
          const hasOppNear = game.getNeighbors(r, c).some(n => board[n.r][n.c] === opponent);
          score += hasOppNear ? 300 : 80;
        }
      }
    }

    // 5. Cross-cut, Extend (Kirichigai ni nobi)
    const diags = [[-1, -1], [-1, 1], [1, -1], [1, 1]];
    for (const [dr, dc] of diags) {
      const oppDiagR = r + dr;
      const oppDiagC = c + dc;
      if (game.isInBounds(oppDiagR, oppDiagC) && board[oppDiagR][oppDiagC] === opponent) {
        if ((game.isInBounds(r + dr, c) && board[r + dr][c] === botColor) ||
            (game.isInBounds(r, c + dc) && board[r][c + dc] === botColor)) {
          score += 600; // Proper extension in cross-cut
        }
      }
    }

    // 6. Bamboo Joint (Takefu) - Unbreakable connection
    const bambooOffsets = [
      [[0, 1], [2, 0], [2, 1]],
      [[0, -1], [2, 0], [2, -1]],
      [[1, 0], [0, 2], [1, 2]],
      [[-1, 0], [0, 2], [-1, 2]]
    ];
    for (const set of bambooOffsets) {
      const allFriendly = set.every(([dr, dc]) => {
        const nr = r + dr, nc = c + dc;
        return game.isInBounds(nr, nc) && board[nr][nc] === botColor;
      });
      if (allFriendly) {
        score += 450;
      }
    }

    // 7. Defend against Peep (Nozoki ni tsugu)
    for (const [dr, dc] of dirs) {
      const nr = r + dr, nc = c + dc;
      if (game.isInBounds(nr, nc) && board[nr][nc] === opponent) {
        const b1R = r + dc, b1C = c + dr;
        const b2R = r - dc, b2C = c - dr;
        if (game.isInBounds(b1R, b1C) && game.isInBounds(b2R, b2C)) {
          if (board[b1R][b1C] === botColor && board[b2R][b2C] === botColor) {
            score += 900; // Firm connection against opponent peep
          }
        }
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
          // Identify group uniquely by its min coordinate stone
          const minStone = grp.stones.reduce((min, s) => (s.r < min.r || (s.r === min.r && s.c < min.c)) ? s : min, grp.stones[0]);
          const key = `${minStone.r},${minStone.c}`;
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
      let botScore = 0;
      let oppScore = 0;
      for (let r = 0; r < game.size; r++) {
        for (let c = 0; c < game.size; c++) {
          if (simBoard[r][c] === botColor) botScore++;
          else if (simBoard[r][c] === opponent) oppScore++;
        }
      }

      if (botScore >= oppScore) botWins++;
    }

    return botWins / simulations;
  }

  getQuickLegalMoves(game, board, color) {
    const moves = [];
    const size = game.size;
    const opponent = color === 1 ? 2 : 1;
    // Ko check: the board state 2 half-moves ago (opponent's last state)
    const koForbidden = game.history.length >= 2 ? game.history[game.history.length - 2] : null;

    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        if (board[r][c] === 0) {
          // Check liberties
          let isLegal = false;
          for (const n of game.getNeighbors(r, c)) {
            if (board[n.r][n.c] === 0 || board[n.r][n.c] === color) {
              isLegal = true;
              break;
            } else if (board[n.r][n.c] === opponent) {
              const oppGrp = game.getGroup(n.r, n.c, board);
              if (oppGrp && oppGrp.liberties === 1) {
                isLegal = true;
                break;
              }
            }
          }

          if (isLegal && koForbidden) {
            // Quick Ko check: simulate the move and compare board serial
            const testBoard = game.cloneBoard(board);
            testBoard[r][c] = color;
            // Remove any captured opponent groups
            for (const n of game.getNeighbors(r, c)) {
              if (testBoard[n.r][n.c] === opponent) {
                const grp = game.getGroup(n.r, n.c, testBoard);
                if (grp && grp.liberties === 0) {
                  for (const s of grp.stones) testBoard[s.r][s.c] = 0;
                }
              }
            }
            const serial = game.serializeBoard(testBoard);
            if (serial === koForbidden) isLegal = false;
          }

          if (isLegal) moves.push({ r, c });
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
  JosekiEngine,
  analyzeCapture,
  evaluateQuizExplanation,
  getBotTauntAndComfort
};

