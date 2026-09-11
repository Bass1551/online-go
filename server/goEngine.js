/**
 * Go (Baduk / Weiqi) Game Engine
 * Authoritative server-side rules implementation
 */

class GoGame {
  constructor(options = {}) {
    this.size = options.size || 19;
    if (![9, 13, 19].includes(this.size)) {
      this.size = 19;
    }
    // Komi: 5.5 for 9x9, 6.5 for 13x13/19x19
    this.komi = options.komi !== undefined ? options.komi : (this.size === 9 ? 5.5 : 6.5);
    
    // 0 = Empty, 1 = Black, 2 = White
    this.board = Array.from({ length: this.size }, () => Array(this.size).fill(0));
    this.turn = 1; // 1 = Black, 2 = White (Black moves first)
    this.captures = { 1: 0, 2: 0 }; // captures[1] = captured by Black, captures[2] = captured by White
    
    this.history = []; // array of board states as serialized strings
    this.moveHistory = []; // array of { r, c, player, captured, pass }
    this.consecutivePasses = 0;
    this.isGameOver = false;
    this.winner = null;
    this.winReason = null;
    this.lastMove = null;
    this.scoreResult = null;

    // Record initial board
    this.history.push(this.serializeBoard());
  }

  serializeBoard(board = this.board) {
    return board.map(row => row.join('')).join('');
  }

  cloneBoard(board = this.board) {
    return board.map(row => [...row]);
  }

  isInBounds(r, c) {
    return r >= 0 && r < this.size && c >= 0 && c < this.size;
  }

  getNeighbors(r, c) {
    const neighbors = [];
    const dirs = [[-1, 0], [1, 0], [0, -1], [0, 1]];
    for (const [dr, dc] of dirs) {
      const nr = r + dr;
      const nc = c + dc;
      if (this.isInBounds(nr, nc)) {
        neighbors.push({ r: nr, c: nc });
      }
    }
    return neighbors;
  }

  /**
   * Find all stones in the connected group and their liberties
   */
  getGroup(r, c, board = this.board) {
    const color = board[r][c];
    if (color === 0) return null;

    const visited = new Set();
    const stones = [];
    const liberties = new Set();
    const queue = [{ r, c }];
    visited.add(`${r},${c}`);

    while (queue.length > 0) {
      const curr = queue.shift();
      stones.push(curr);

      for (const neighbor of this.getNeighbors(curr.r, curr.c)) {
        const key = `${neighbor.r},${neighbor.c}`;
        const neighborColor = board[neighbor.r][neighbor.c];

        if (neighborColor === 0) {
          liberties.add(key);
        } else if (neighborColor === color && !visited.has(key)) {
          visited.add(key);
          queue.push(neighbor);
        }
      }
    }

    return { color, stones, liberties: liberties.size, libertyCoords: Array.from(liberties) };
  }

  /**
   * Play a stone at (r, c) by player (1 = Black, 2 = White)
   */
  playMove(player, r, c) {
    if (this.isGameOver) {
      return { success: false, error: 'เกมจบแล้ว' };
    }

    if (this.turn !== player) {
      return { success: false, error: 'ยังไม่ใช่ตาของคุณ' };
    }

    if (!this.isInBounds(r, c)) {
      return { success: false, error: 'ตำแหน่งอยู่นอกกระดาน' };
    }

    if (this.board[r][c] !== 0) {
      return { success: false, error: 'มีหมากวางอยู่ตรงนี้แล้ว' };
    }

    const opponent = player === 1 ? 2 : 1;
    const tempBoard = this.cloneBoard();
    tempBoard[r][c] = player;

    // Check opponent groups around this stone
    const capturedStones = [];
    const checkedOpponents = new Set();

    for (const neighbor of this.getNeighbors(r, c)) {
      const key = `${neighbor.r},${neighbor.c}`;
      if (tempBoard[neighbor.r][neighbor.c] === opponent && !checkedOpponents.has(key)) {
        const group = this.getGroup(neighbor.r, neighbor.c, tempBoard);
        if (group) {
          for (const stone of group.stones) {
            checkedOpponents.add(`${stone.r},${stone.c}`);
          }
          if (group.liberties === 0) {
            for (const stone of group.stones) {
              capturedStones.push(stone);
              tempBoard[stone.r][stone.c] = 0; // Remove captured stone
            }
          }
        }
      }
    }

    // Check liberties of player's own group
    const ownGroup = this.getGroup(r, c, tempBoard);
    if (!ownGroup || ownGroup.liberties === 0) {
      return { success: false, error: 'ห้ามฆ่าตัวตาย (ตำแหน่งนี้ไม่มีลมหายใจ)' };
    }

    // Check Ko rule (situation where board state repeats previous state)
    const newBoardSerial = this.serializeBoard(tempBoard);
    if (this.history.length >= 2 && this.history[this.history.length - 2] === newBoardSerial) {
      return { success: false, error: 'ผิดกฎโคะ (Ko Rule: ห้ามกินกลับทันทีในรูปเดิม)' };
    }

    // Valid move! Apply changes to official board
    this.board = tempBoard;
    this.captures[player] += capturedStones.length;
    this.history.push(newBoardSerial);
    this.consecutivePasses = 0;
    this.turn = opponent;
    this.lastMove = { r, c, player, captured: capturedStones.length };
    this.moveHistory.push({ r, c, player, captured: capturedStones.length });

    return {
      success: true,
      capturedStones,
      lastMove: this.lastMove,
      captures: this.captures,
      turn: this.turn
    };
  }

  /**
   * Pass turn
   */
  pass(player) {
    if (this.isGameOver) {
      return { success: false, error: 'เกมจบแล้ว' };
    }

    if (this.turn !== player) {
      return { success: false, error: 'ยังไม่ใช่ตาของคุณ' };
    }

    this.consecutivePasses += 1;
    this.history.push(this.serializeBoard());
    this.moveHistory.push({ pass: true, player });
    this.turn = player === 1 ? 2 : 1;
    this.lastMove = { pass: true, player };

    if (this.consecutivePasses >= 2) {
      this.isGameOver = true;
      this.scoreResult = this.calculateScore();
      this.winner = this.scoreResult.winner;
      this.winReason = `ผ่านทั้ง 2 ฝ่าย (${this.scoreResult.blackTotal} ต่อ ${this.scoreResult.whiteTotal} คะแนน)`;
    }

    return {
      success: true,
      turn: this.turn,
      consecutivePasses: this.consecutivePasses,
      isGameOver: this.isGameOver,
      scoreResult: this.scoreResult,
      winner: this.winner,
      winReason: this.winReason
    };
  }

  /**
   * Resign
   */
  resign(player) {
    if (this.isGameOver) {
      return { success: false, error: 'เกมจบแล้ว' };
    }

    this.isGameOver = true;
    this.winner = player === 1 ? 2 : 1;
    const resigningColor = player === 1 ? 'ดำ' : 'ขาว';
    const winningColor = this.winner === 1 ? 'ดำ' : 'ขาว';
    this.winReason = `หมาก${resigningColor}ขอยอมแพ้ (หมาก${winningColor}เป็นฝ่ายชนะ)`;

    return {
      success: true,
      isGameOver: true,
      winner: this.winner,
      winReason: this.winReason
    };
  }

  /**
   * Calculate territory using area scoring / flood fill for empty intersections
   */
  calculateScore() {
    let blackTerritory = 0;
    let whiteTerritory = 0;
    let neutralTerritory = 0;
    const territoryMap = Array.from({ length: this.size }, () => Array(this.size).fill(0));
    const visited = new Set();

    for (let r = 0; r < this.size; r++) {
      for (let c = 0; c < this.size; c++) {
        if (this.board[r][c] === 0 && !visited.has(`${r},${c}`)) {
          // Explore empty region
          const queue = [{ r, c }];
          const region = [];
          const borderingColors = new Set();
          visited.add(`${r},${c}`);

          while (queue.length > 0) {
            const curr = queue.shift();
            region.push(curr);

            for (const neighbor of this.getNeighbors(curr.r, curr.c)) {
              const nColor = this.board[neighbor.r][neighbor.c];
              if (nColor === 0) {
                const key = `${neighbor.r},${neighbor.c}`;
                if (!visited.has(key)) {
                  visited.add(key);
                  queue.push(neighbor);
                }
              } else {
                borderingColors.add(nColor);
              }
            }
          }

          // If region is bordered only by Black -> Black territory
          // If region is bordered only by White -> White territory
          let owner = 0;
          if (borderingColors.size === 1) {
            owner = borderingColors.values().next().value;
          }

          for (const stone of region) {
            territoryMap[stone.r][stone.c] = owner;
          }

          if (owner === 1) {
            blackTerritory += region.length;
          } else if (owner === 2) {
            whiteTerritory += region.length;
          } else {
            neutralTerritory += region.length;
          }
        }
      }
    }

    const blackCaptures = this.captures[1];
    const whiteCaptures = this.captures[2];

    const blackTotal = blackTerritory + blackCaptures;
    const whiteTotal = whiteTerritory + whiteCaptures + this.komi;

    const winner = blackTotal > whiteTotal ? 1 : 2;
    const margin = Math.abs(blackTotal - whiteTotal);

    return {
      blackTerritory,
      whiteTerritory,
      neutralTerritory,
      blackCaptures,
      whiteCaptures,
      komi: this.komi,
      blackTotal: Number(blackTotal.toFixed(1)),
      whiteTotal: Number(whiteTotal.toFixed(1)),
      winner,
      margin: Number(margin.toFixed(1)),
      territoryMap
    };
  }

  /**
   * Undo last move (requires both players consent in UI)
   */
  undoMove() {
    if (this.moveHistory.length === 0) {
      return { success: false, error: 'ไม่มีตาเดินให้ย้อนกลับ' };
    }

    this.moveHistory.pop();
    this.history.pop();

    // Restore previous board
    const prevSerial = this.history[this.history.length - 1];
    let idx = 0;
    for (let r = 0; r < this.size; r++) {
      for (let c = 0; c < this.size; c++) {
        this.board[r][c] = parseInt(prevSerial[idx++], 10);
      }
    }

    // Recalculate captures from history or reset
    // For simplicity, switch turn back
    this.turn = this.turn === 1 ? 2 : 1;
    this.consecutivePasses = 0;
    this.isGameOver = false;
    this.winner = null;
    this.winReason = null;
    this.scoreResult = null;
    this.lastMove = this.moveHistory.length > 0 ? this.moveHistory[this.moveHistory.length - 1] : null;

    return {
      success: true,
      board: this.board,
      turn: this.turn,
      lastMove: this.lastMove
    };
  }

  getState() {
    return {
      size: this.size,
      board: this.board,
      turn: this.turn,
      captures: this.captures,
      komi: this.komi,
      consecutivePasses: this.consecutivePasses,
      isGameOver: this.isGameOver,
      winner: this.winner,
      winReason: this.winReason,
      lastMove: this.lastMove,
      scoreResult: this.scoreResult
    };
  }
}

module.exports = GoGame;
