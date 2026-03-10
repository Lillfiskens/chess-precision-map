/**
 * Analysis queue progress indicator.
 *
 * Shows a minimal status text that updates in real-time as the engine
 * processes positions.
 *
 * API:
 *   initProgress(containerSelector, engine)
 */

/**
 * Render the progress indicator into the given container.
 * @param {string} containerSelector  CSS selector
 * @param {object} engine             Engine object from createEngine()
 */
export function initProgress(containerSelector, engine) {
  const el = document.querySelector(containerSelector)
  if (!el) return

  el.innerHTML = '<span class="progress-text">Initialised</span>'
  const text = el.querySelector('.progress-text')

  engine.onProgress((queued, total) => {
    if (total === 0) {
      text.textContent = 'Ready'
      text.classList.remove('is-active')
    } else {
      text.textContent = `Analysing\u2026 (${queued} queued)`
      text.classList.add('is-active')
    }
  })
}
