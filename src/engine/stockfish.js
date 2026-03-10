/**
 * Stockfish Web Worker wrapper.
 *
 * Manages the engine lifecycle and serialises the analysis queue —
 * only one position is dispatched at a time (WASM is single-threaded).
 *
 * Public API:
 *   createEngine() → Promise<Engine>
 *
 * Engine object:
 *   engine.ready          Promise<void>  — resolves once "readyok" received
 *   engine.enqueue(fen)   → Promise<RawResult>
 *   engine.stop()         — cancels in-flight job and clears queue
 *   engine.terminate()    — kills the worker entirely
 *   engine.onProgress(fn) — register callback(queued, total) for progress UI
 */

export async function createEngine() {
  const worker = new Worker('/stockfish-18-lite-single.js')

  // ── Progress listeners ──────────────────────────────────────────────────────
  const progressListeners = new Set()
  function notifyProgress() {
    const queued = queue.length
    const total  = queued + (busy ? 1 : 0)
    progressListeners.forEach(fn => fn(queued, total))
  }

  // ── UCI init handshake ──────────────────────────────────────────────────────
  const readyPromise = new Promise((resolve, reject) => {
    let uciOk = false

    function initHandler(event) {
      const line = event.data
      if (typeof line !== 'string') return

      if (line === 'uciok') {
        uciOk = true
        worker.postMessage('isready')
      } else if (line === 'readyok' && uciOk) {
        worker.removeEventListener('message', initHandler)
        worker.addEventListener('message', jobHandler)
        resolve()
      }
    }

    worker.addEventListener('message', initHandler)
    worker.addEventListener('error', reject)
    worker.postMessage('uci')
  })

  // ── Job queue ───────────────────────────────────────────────────────────────
  const queue = []   // { fen, multipv, depth, resolve, reject }
  let busy    = false
  let current = null // currently executing job

  function drain() {
    if (busy || queue.length === 0) return
    busy    = true
    current = queue.shift()
    notifyProgress()
    dispatchJob(current)
  }

  function dispatchJob(job) {
    infoBuffer = []
    worker.postMessage(`position fen ${job.fen}`)
    worker.postMessage(`setoption name MultiPV value ${job.multipv}`)
    worker.postMessage(`go depth ${job.depth}`)
  }

  // ── Message handler (active during analysis) ────────────────────────────────
  let infoBuffer = []

  function jobHandler(event) {
    const line = event.data
    if (typeof line !== 'string') return

    if (line.startsWith('info') && line.includes('score') && line.includes(' pv ')) {
      // Skip lowerbound/upperbound lines — they are partial window results
      if (!line.includes('lowerbound') && !line.includes('upperbound')) {
        infoBuffer.push(line)
      }
      return
    }

    if (line.startsWith('bestmove')) {
      const job    = current
      current      = null
      busy         = false

      const result = parseInfoBuffer(infoBuffer, job.fen, job.multipv)
      infoBuffer   = []

      notifyProgress()
      drain()
      job.resolve(result)
    }
  }

  // ── Info line parser ────────────────────────────────────────────────────────
  function parseInfoBuffer(lines, fen, multipv) {
    // Find the maximum depth reported across all lines
    let maxDepth = 0
    for (const line of lines) {
      const m = line.match(/\bdepth (\d+)/)
      if (m) maxDepth = Math.max(maxDepth, parseInt(m[1], 10))
    }

    // Keep only lines at max depth, one per multipv slot
    const byRank = new Map()
    for (const line of lines) {
      const depthM = line.match(/\bdepth (\d+)/)
      if (!depthM || parseInt(depthM[1], 10) !== maxDepth) continue

      const pvM = line.match(/\bmultipv (\d+)/)
      const rank = pvM ? parseInt(pvM[1], 10) : 1

      // Always keep the last line seen for this rank at max depth
      byRank.set(rank, line)
    }

    const parsed = []
    for (const [rank, line] of [...byRank.entries()].sort((a, b) => a[0] - b[0])) {
      const cpM   = line.match(/\bscore cp (-?\d+)/)
      const mateM = line.match(/\bscore mate (-?\d+)/)
      const pvM   = line.match(/\bpv (.+)$/)

      let cp     = 0
      let isMate = false
      let mateIn = null

      if (mateM) {
        isMate = true
        mateIn = parseInt(mateM[1], 10)
        cp     = mateIn > 0 ? 30000 : -30000
      } else if (cpM) {
        cp = parseInt(cpM[1], 10)
      }

      // Stockfish returns score from the perspective of the side to move.
      // Normalise to White's perspective.
      const sideToMove = fen.split(' ')[1]
      if (sideToMove === 'b') cp = -cp

      const pv   = pvM ? pvM[1].trim().split(' ') : []
      const move = pv[0] ?? null

      parsed.push({ rank, move, cp, isMate, mateIn, pv })
    }

    return { fen, lines: parsed, depth: maxDepth }
  }

  // ── Public API ───────────────────────────────────────────────────────────────
  await readyPromise

  return {
    ready: readyPromise,

    /**
     * Enqueue a position for analysis.
     * @param {string} fen
     * @param {number} multipv  Number of lines to request
     * @param {number} depth    Search depth
     * @returns {Promise<RawResult>}
     */
    enqueue(fen, multipv = 10, depth = 12) {
      return new Promise((resolve, reject) => {
        queue.push({ fen, multipv, depth, resolve, reject })
        notifyProgress()
        drain()
      })
    },

    /**
     * Cancel the in-flight job and flush the queue.
     * Pending promises are rejected with a "stopped" error.
     */
    stop() {
      worker.postMessage('stop')
      const stopped = new Error('stopped')
      if (current) {
        current.reject(stopped)
        current = null
      }
      while (queue.length) queue.pop().reject(stopped)
      busy = false
      infoBuffer = []
      notifyProgress()
    },

    /** Kill the worker entirely. */
    terminate() {
      worker.terminate()
    },

    /**
     * Register a progress listener.
     * @param {(queued: number, total: number) => void} fn
     * @returns {() => void} unsubscribe function
     */
    onProgress(fn) {
      progressListeners.add(fn)
      return () => progressListeners.delete(fn)
    },

    /** Signal a new game / root FEN change so the engine clears its hash. */
    newGame() {
      worker.postMessage('ucinewgame')
    },
  }
}
