/**
 * Detail panel for the selected node.
 *
 * Renders side-to-move, precision label, a table of all analysed lines
 * with eval and cp-loss, and the position FEN.
 *
 * API:
 *   renderPanel(nodeData)  — call on every node click
 */

import { getPrecisionTier, EQUALITY_THRESHOLD_CP } from '../constants.js'

/** Format centipawn eval (White perspective): "+0.32", "-1.45", "#5". */
function formatEval(cp, isMate, mateIn) {
  if (isMate) return `#${mateIn}`
  const pawns = (cp / 100).toFixed(2)
  return cp >= 0 ? `+${pawns}` : pawns
}

/**
 * Render the detail panel for a selected node.
 * @param {NodeData|null} nodeData
 */
export function renderPanel(nodeData) {
  const el = document.getElementById('detail-panel')
  if (!el) return

  // ── Empty state ─────────────────────────────────────────────────────────
  if (!nodeData || !nodeData._analysisResult) {
    el.innerHTML = '<p class="panel-placeholder">Click a node to see details</p>'
    return
  }

  const result = nodeData._analysisResult
  const tier   = getPrecisionTier(nodeData.acceptableCount ?? 0)
  const side   = nodeData.fen.split(' ')[1] === 'w' ? 'White' : 'Black'
  const bestCp = result.lines[0]?.cp ?? 0

  // ── Header ──────────────────────────────────────────────────────────────
  const moveLabel = nodeData.move ?? 'Root'
  const header = `
    <div class="panel-header">
      <span class="panel-move">${moveLabel}</span>
      <span class="panel-badge" style="background:${tier.colour}">${tier.label}</span>
    </div>
  `

  // ── Info rows ───────────────────────────────────────────────────────────
  const info = `
    <div class="panel-info">
      <div class="panel-row">
        <span class="panel-label">Side to move</span>
        <span>${side}</span>
      </div>
      <div class="panel-row">
        <span class="panel-label">Acceptable moves</span>
        <span>
          <span class="panel-dot" style="background:${tier.colour}"></span>
          ${nodeData.acceptableCount}${nodeData.mayHaveMore ? '+' : ''}
        </span>
      </div>
      <div class="panel-row">
        <span class="panel-label">Depth (ply)</span>
        <span>${nodeData.depth}</span>
      </div>
    </div>
  `

  // ── Moves table ─────────────────────────────────────────────────────────
  const rows = result.lines.map(line => {
    const cpLoss    = Math.abs(line.cp - bestCp)
    const evalStr   = formatEval(line.cp, line.isMate, line.mateIn)
    const lossStr   = cpLoss === 0 ? '0' : `-${cpLoss}`
    const acceptable = cpLoss <= EQUALITY_THRESHOLD_CP
    return `
      <tr class="${acceptable ? 'acceptable' : 'losing'}">
        <td>${line.rank}</td>
        <td class="move-san">${line.san}</td>
        <td class="move-eval">${evalStr}</td>
        <td class="move-loss">${lossStr}</td>
      </tr>
    `
  }).join('')

  const table = `
    <table class="panel-table">
      <thead><tr><th>#</th><th>Move</th><th>Eval</th><th>cp loss</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
  `

  // ── Warning ─────────────────────────────────────────────────────────────
  const warning = nodeData.mayHaveMore
    ? '<p class="panel-warning">There may be additional acceptable moves beyond those analysed.</p>'
    : ''

  // ── FEN ─────────────────────────────────────────────────────────────────
  const fen = `
    <div class="panel-fen">
      <span class="panel-label">FEN</span>
      <code class="panel-fen-text" title="Click to copy">${nodeData.fen}</code>
    </div>
  `

  el.innerHTML = header + info + table + warning + fen

  // Copy FEN on click
  const fenEl = el.querySelector('.panel-fen-text')
  if (fenEl) {
    fenEl.addEventListener('click', () => {
      navigator.clipboard.writeText(nodeData.fen).then(() => {
        fenEl.textContent = 'Copied!'
        setTimeout(() => { fenEl.textContent = nodeData.fen }, 1200)
      })
    })
  }
}
