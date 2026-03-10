/**
 * FEN / opening selection input.
 *
 * Renders a dropdown of seed openings and a text input for custom FEN.
 * Dispatches a `rootFenChange` CustomEvent on `document` when the user
 * selects a new position.
 *
 * API:
 *   initFenInput(containerSelector, defaultFen)
 */

import { validateFen } from 'chess.js'
import { OPENINGS } from '../data/openings.js'

/**
 * Render the FEN input controls into the given container.
 * @param {string} containerSelector  CSS selector
 * @param {string} defaultFen         Initial FEN to show selected
 */
export function initFenInput(containerSelector, defaultFen) {
  const el = document.querySelector(containerSelector)
  if (!el) return

  // ── Build dropdown options ──────────────────────────────────────────────
  const options = OPENINGS.map(o =>
    `<option value="${o.fen}" ${o.fen === defaultFen ? 'selected' : ''}>${o.name}</option>`
  ).join('')

  el.innerHTML = `
    <select id="opening-select">${options}<option value="">Custom FEN\u2026</option></select>
    <input  id="fen-text" type="text" placeholder="Paste FEN here\u2026" value="${defaultFen}" />
    <span   id="fen-error" class="fen-error"></span>
  `

  const select = el.querySelector('#opening-select')
  const input  = el.querySelector('#fen-text')
  const error  = el.querySelector('#fen-error')

  // Show/hide the text input based on dropdown selection
  function syncVisibility() {
    input.classList.toggle('hidden', select.value !== '')
  }
  syncVisibility()

  // ── Dropdown change ─────────────────────────────────────────────────────
  select.addEventListener('change', () => {
    error.textContent = ''
    syncVisibility()

    if (select.value === '') {
      // Custom FEN selected — focus the input
      input.classList.remove('hidden')
      input.focus()
      input.select()
      return
    }

    input.value = select.value
    dispatch(select.value)
  })

  // ── Text input submit (Enter or blur) ───────────────────────────────────
  function submitCustomFen() {
    const fen = input.value.trim()
    if (!fen) return

    const result = validateFen(fen)
    if (result.ok) {
      error.textContent = ''
      // Reset dropdown to "Custom FEN..." since it's a manual entry
      select.value = ''
      dispatch(fen)
    } else {
      error.textContent = result.error
    }
  }

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      submitCustomFen()
    }
  })

  input.addEventListener('blur', submitCustomFen)

  // ── Dispatch helper ─────────────────────────────────────────────────────
  function dispatch(fen) {
    document.dispatchEvent(new CustomEvent('rootFenChange', { detail: { fen } }))
  }
}
