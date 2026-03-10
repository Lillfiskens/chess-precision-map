/**
 * Precision tier legend.
 *
 * Renders a compact horizontal legend showing all 5 precision tiers
 * with colour, size, and stroke encoding.
 *
 * API:
 *   initLegend(containerSelector)  — renders once into the target element
 */

import { PRECISION_TIERS } from '../constants.js'

const DESCRIPTIONS = {
  'Forced':   '1 acceptable move',
  'Critical': '2 acceptable moves',
  'Narrow':   '3 acceptable moves',
  'Open':     '4\u20136 acceptable moves',
  'Free':     '7+ acceptable moves',
}

/**
 * Render the legend into the given container.
 * @param {string} containerSelector  CSS selector
 */
export function initLegend(containerSelector) {
  const el = document.querySelector(containerSelector)
  if (!el) return

  const items = PRECISION_TIERS.map(tier => {
    const r    = Math.round(tier.r * 0.6)
    const size = r * 2 + 4  // SVG viewBox size with margin
    const dash = tier.dash ? `stroke-dasharray="${tier.dash}"` : ''
    const desc = DESCRIPTIONS[tier.label] ?? ''

    return `
      <div class="legend-item">
        <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
          <circle cx="${size / 2}" cy="${size / 2}" r="${r}"
            fill="${tier.colour}" stroke="#ccc" stroke-width="1.5" ${dash} />
        </svg>
        <span class="legend-label">${tier.label}</span>
        <span class="legend-desc">${desc}</span>
      </div>
    `
  }).join('')

  el.innerHTML = `<div class="legend-row">${items}</div>`
}
