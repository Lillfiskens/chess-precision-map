/**
 * Tree node factory and lazy expansion logic.
 *
 * Nodes are expanded on demand (when the user clicks them, or during
 * pre-analysis on startup). Each unique FEN is analysed exactly once —
 * results are stored in and read from `store.js`, so transpositions
 * (same position reached via different move orders) share one analysis.
 *
 * Exported API:
 *   makeNode(fen, san, lan, depth, cp, result) → NodeData
 *   expandNode(nodeData)                        → Promise<void>
 *   resetNodeCounter()                          — call on root FEN change
 */

import { Chess } from 'chess.js'
import { analysePosition } from '../engine/analyser.js'
import { store } from './store.js'
import {
  CHILD_BRANCH_LIMIT,
  MAX_DEPTH_PLY,
  MAX_TOTAL_NODES,
  ANALYSIS_DEPTH,
  MULTIPV_COUNT,
  getPrecisionTier,
} from '../constants.js'

let _nodeId = 0

export function resetNodeCounter() {
  _nodeId = 0
}

/**
 * Create a tree node.
 *
 * @param {string}      fen     FEN of this position
 * @param {string|null} san     SAN move that led here (null for root)
 * @param {string|null} lan     UCI/LAN move that led here (null for root)
 * @param {number}      depth   Ply depth from root (0 = root)
 * @param {number|null} cp      White-perspective eval (known from parent's analysis, null for root)
 * @param {object|null} result  Parent's AnalysisResult (used to read tier for this node)
 * @returns {NodeData}
 */
export function makeNode(fen, san, lan, depth, cp, result) {
  const tier = result !== null ? getPrecisionTier(result.acceptableCount) : null

  return {
    id:              _nodeId++,
    fen,
    move:            san,
    moveLan:         lan,
    depth,
    cp:              cp ?? null,
    acceptableCount: result?.acceptableCount ?? null,
    mayHaveMore:     result?.mayHaveMore ?? false,
    label:           tier?.label ?? null,
    children:        undefined,   // undefined = not yet expanded (D3 treats as leaf)
    _analysisResult: result,
    _expanded:       false,
    _loading:        false,
  }
}

/**
 * Lazily expand a node: run analysis (or read from cache) and attach children.
 *
 * Guards:
 * - Already expanded → no-op
 * - At or beyond MAX_DEPTH_PLY → no-op
 * - Cache already at MAX_TOTAL_NODES → no-op
 *
 * Triggers a store.set() at the end so renderer subscribers re-render.
 *
 * @param {NodeData} nodeData
 * @returns {Promise<void>}
 */
export async function expandNode(nodeData) {
  if (nodeData._expanded)                    return
  if (nodeData.depth >= MAX_DEPTH_PLY)       return
  if (store.size() >= MAX_TOTAL_NODES)       return

  nodeData._expanded = true
  nodeData._loading  = true

  // ── Get or fetch analysis result ──────────────────────────────────────────
  let result
  if (store.has(nodeData.fen)) {
    result = store.get(nodeData.fen)
  } else {
    try {
      result = await analysePosition(nodeData.fen, MULTIPV_COUNT, ANALYSIS_DEPTH)
      store.set(nodeData.fen, result)  // cache + notify subscribers
    } catch (err) {
      // Engine was stopped (root FEN change) — abandon expansion cleanly
      nodeData._expanded = false
      nodeData._loading  = false
      return
    }
  }

  nodeData._loading = false

  // ── Update this node's own fields (important for the root node) ──────────
  if (nodeData.cp === null) nodeData.cp = result.bestCp
  nodeData.acceptableCount = result.acceptableCount
  nodeData.mayHaveMore     = result.mayHaveMore
  nodeData.label           = getPrecisionTier(result.acceptableCount).label
  nodeData._analysisResult = result

  // ── Build child nodes ────────────────────────────────────────────────────
  const chess    = new Chess()
  const topLines = result.lines.slice(0, CHILD_BRANCH_LIMIT)
  const children = []

  for (const line of topLines) {
    if (!line.move) continue

    try {
      chess.load(nodeData.fen)
      const from      = line.move.slice(0, 2)
      const to        = line.move.slice(2, 4)
      const promotion = line.move[4] ?? undefined
      const moveObj   = chess.move({ from, to, promotion })
      // moveObj.after is the FEN after the move (chess.js v1.4)
      const childResult = store.has(moveObj.after) ? store.get(moveObj.after) : null
      children.push(makeNode(moveObj.after, moveObj.san, line.move, nodeData.depth + 1, line.cp, childResult))
    } catch {
      // Illegal move from engine (rare) — skip silently
    }
  }

  nodeData.children = children

  // Re-emit so renderer re-renders now that children are attached
  store.set(nodeData.fen, result)
}
