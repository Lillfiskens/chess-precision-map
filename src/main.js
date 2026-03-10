/**
 * Chess Precision Map — application entry point.
 *
 * Orchestrates engine startup, UI initialisation, and the
 * pre-analysis → render → interaction loop.
 */

import './style.css'

import { createEngine } from './engine/stockfish.js'
import { setEngine } from './engine/analyser.js'
import { store } from './tree/store.js'
import { makeNode, expandNode, resetNodeCounter } from './tree/builder.js'
import { initRenderer } from './tree/renderer.js'
import { renderPanel } from './ui/panel.js'
import { initLegend } from './ui/legend.js'
import { initFenInput } from './ui/fen-input.js'
import { initProgress } from './ui/progress.js'
import { OPENINGS } from './data/openings.js'

let renderer = null

async function loadTree(fen, engine) {
  engine.newGame()
  resetNodeCounter()

  const root = makeNode(fen, null, null, 0, null, null)

  // Pre-analyse root
  await expandNode(root)

  // Pre-analyse root's children (sequential — engine is single-threaded)
  for (const child of root.children ?? []) {
    await expandNode(child)
  }

  // Destroy previous renderer if one exists
  if (renderer) renderer.destroy()

  // Init D3 renderer
  renderer = initRenderer('#tree-container', root, {
    onNodeClick: async (nodeData) => {
      renderPanel(nodeData)
      await expandNode(nodeData)
    },
  })

  // Show empty panel placeholder
  renderPanel(null)
}

async function init() {
  const overlay = document.getElementById('loading-overlay')

  try {
    // 1. Create engine — blocks until UCI readyok
    const engine = await createEngine()
    setEngine(engine)

    // 2. Hide loading overlay
    overlay.classList.add('hidden')

    // 3. Init static UI
    const defaultFen = OPENINGS[0].fen
    initLegend('#legend-container')
    initFenInput('#fen-controls', defaultFen)
    initProgress('#progress-indicator', engine)

    // 4. Build initial tree
    await loadTree(defaultFen, engine)

    // 5. Wire root FEN change (from fen-input.js)
    document.addEventListener('rootFenChange', async (e) => {
      engine.stop()   // cancel in-flight analyses
      store.clear()   // flush stale cache
      await loadTree(e.detail.fen, engine)
    })
  } catch (err) {
    console.error('Failed to initialise Chess Precision Map:', err)
    overlay.innerHTML = `
      <div class="loading-content">
        <p style="color: var(--colour-forced);">
          Failed to load Stockfish engine.
        </p>
        <p style="color: var(--text-secondary); font-size: 0.85em;">
          ${err.message ?? 'Unknown error'}
        </p>
      </div>
    `
  }
}

init()
