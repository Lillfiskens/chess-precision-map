/**
 * FEN-keyed analysis cache — the canonical source of truth.
 *
 * Every unique chess position is stored exactly once by its FEN string,
 * regardless of how many tree paths lead to it (transposition handling).
 *
 * Subscribers are notified whenever a new result is stored, which
 * triggers a renderer re-render.
 *
 * API:
 *   store.has(fen)          → boolean
 *   store.get(fen)          → AnalysisResult | undefined
 *   store.set(fen, result)  — stores and notifies all subscribers
 *   store.subscribe(fn)     → unsubscribe function
 *   store.clear()           — flush all cached results
 *   store.size()            → number of cached positions
 */

const cache     = new Map()  // fen → AnalysisResult
const listeners = new Set()  // (fen, result) => void

export const store = {
  has(fen)          { return cache.has(fen) },
  get(fen)          { return cache.get(fen) },
  set(fen, result)  {
    cache.set(fen, result)
    listeners.forEach(fn => fn(fen, result))
  },
  subscribe(fn)     { listeners.add(fn); return () => listeners.delete(fn) },
  clear()           { cache.clear() },
  size()            { return cache.size },
}
