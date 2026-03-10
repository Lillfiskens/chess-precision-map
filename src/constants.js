/**
 * Tunable parameters for Chess Precision Map.
 * All values are defaults; main.js may override them in appState.
 */

/** How many lines to request from Stockfish per position (initial request). */
export const MULTIPV_COUNT = 10

/** Centipawn window within which a move is considered "acceptable". */
export const EQUALITY_THRESHOLD_CP = 30

/** Max child nodes added per tree expansion (top N of MultiPV results). */
export const CHILD_BRANCH_LIMIT = 5

/** Maximum half-move depth for auto-expansion. */
export const MAX_DEPTH_PLY = 6

/** Stockfish search depth per position. 12 is fast; 16 for higher accuracy. */
export const ANALYSIS_DEPTH = 12

/** Hard cap on total tree nodes across the session. */
export const MAX_TOTAL_NODES = 3000

/**
 * Precision tier definitions — drives colour and shape encoding.
 * Listed in ascending order of acceptable-move count.
 */
export const PRECISION_TIERS = [
  { max: 1,        label: 'Forced',   colour: '#e53e3e', r: 8,  dash: '4,2' },
  { max: 2,        label: 'Critical', colour: '#dd6b20', r: 10, dash: '4,2' },
  { max: 3,        label: 'Narrow',   colour: '#d69e2e', r: 12, dash: null  },
  { max: 6,        label: 'Open',     colour: '#38a169', r: 16, dash: null  },
  { max: Infinity, label: 'Free',     colour: '#2c7a7b', r: 20, dash: null  },
]

export function getPrecisionTier(acceptableCount) {
  return PRECISION_TIERS.find(t => acceptableCount <= t.max) ?? PRECISION_TIERS.at(-1)
}
