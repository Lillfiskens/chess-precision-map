/**
 * UCI command orchestration layer.
 *
 * Takes a FEN string, dispatches it to the engine via the stockfish wrapper,
 * converts results into a structured AnalysisResult, and handles:
 *   - SAN conversion (UCI move → human-readable notation)
 *   - Eval normalisation to White's perspective
 *   - MULTIPV auto-doubling when the Nth result is still within threshold
 *
 * Public API:
 *   setEngine(engine)                          — called once by main.js
 *   analysePosition(fen, multipv, depth)       → Promise<AnalysisResult>
 *
 * AnalysisResult shape:
 * {
 *   fen:             string,
 *   lines:           Array<{ rank, move, san, cp, isMate, mateIn, pv }>,
 *   acceptableCount: number,   — moves within EQUALITY_THRESHOLD_CP of best
 *   mayHaveMore:     boolean,  — true if Nth line is still within threshold
 *   bestCp:          number,   — White-perspective cp of the best move
 * }
 */

import { Chess } from 'chess.js'
import { EQUALITY_THRESHOLD_CP, MULTIPV_COUNT } from '../constants.js'

let _engine = null

/** Called once by main.js after createEngine() resolves. */
export function setEngine(engine) {
  _engine = engine
}

/**
 * Analyse a position and return a structured result.
 *
 * Automatically doubles multipv up to 2 times when the Nth result is
 * within threshold (meaning there may be more acceptable moves beyond
 * the requested count).
 *
 * @param {string} fen
 * @param {number} multipv   Initial number of lines to request (default: MULTIPV_COUNT)
 * @param {number} depth     Stockfish search depth (default: 12)
 * @returns {Promise<AnalysisResult>}
 */
export async function analysePosition(fen, multipv = MULTIPV_COUNT, depth = 12) {
  if (!_engine) throw new Error('Engine not initialised — call setEngine() first')

  const chess         = new Chess()
  chess.load(fen)
  const legalMoveCount = chess.moves().length

  let result
  let doublings = 0
  let currentMultipv = Math.min(multipv, legalMoveCount)

  while (true) {
    const raw = await _engine.enqueue(fen, currentMultipv, depth)
    result = buildResult(fen, raw.lines, currentMultipv, chess)

    // Auto-double if the last line returned is still within threshold
    // and we haven't yet seen all legal moves.
    const shouldDouble =
      result.mayHaveMore &&
      doublings < 2 &&
      currentMultipv < legalMoveCount

    if (!shouldDouble) break

    doublings++
    currentMultipv = Math.min(currentMultipv * 2, legalMoveCount)
  }

  return result
}

// ── Internal helpers ──────────────────────────────────────────────────────────

function buildResult(fen, rawLines, multipv, chess) {
  if (rawLines.length === 0) {
    return { fen, lines: [], acceptableCount: 0, mayHaveMore: false, bestCp: 0 }
  }

  const bestCp = rawLines[0].cp

  const lines = rawLines.map(raw => {
    const san = uciToSan(chess, raw.move)
    return {
      rank:   raw.rank,
      move:   raw.move,  // UCI / LAN format e.g. "e2e4"
      san,               // SAN format e.g. "e4"
      cp:     raw.cp,    // White-perspective centipawns (normalised in stockfish.js)
      isMate: raw.isMate,
      mateIn: raw.mateIn,
      pv:     raw.pv,
    }
  })

  const acceptableCount = lines.filter(
    l => Math.abs(l.cp - bestCp) <= EQUALITY_THRESHOLD_CP
  ).length

  // True if the last line returned is still within threshold —
  // meaning there may be more acceptable moves we didn't ask for.
  const lastLine    = lines[lines.length - 1]
  const mayHaveMore = Math.abs(lastLine.cp - bestCp) <= EQUALITY_THRESHOLD_CP &&
                      lines.length >= multipv

  return { fen, lines, acceptableCount, mayHaveMore, bestCp }
}

/**
 * Convert a UCI move string (e.g. "e2e4", "e7e8q") to SAN using chess.js.
 * Returns the UCI string as a fallback if conversion fails.
 */
function uciToSan(chess, uciMove) {
  if (!uciMove) return ''
  try {
    const from      = uciMove.slice(0, 2)
    const to        = uciMove.slice(2, 4)
    const promotion = uciMove[4] ?? undefined
    const moveObj   = chess.move({ from, to, promotion })
    chess.undo()
    return moveObj.san
  } catch {
    return uciMove
  }
}
