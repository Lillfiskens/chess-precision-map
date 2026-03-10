/**
 * D3 tree renderer.
 *
 * Renders the opening tree as a horizontal collapsible D3 layout.
 * Nodes are colour-coded and sized by precision tier. Dual encoding
 * (colour + dashed stroke) ensures accessibility for colour-blind users.
 *
 * Exported API:
 *   initRenderer(containerSelector, rootData, { onNodeClick }) → { update }
 *
 * The renderer subscribes to store changes so it re-renders automatically
 * when new analysis results arrive.
 */

import * as d3 from 'd3'
import { store } from './store.js'
import { getPrecisionTier } from '../constants.js'

// ── Helpers ─────────────────────────────────────────────────────────────────

/** Format centipawn eval from White's perspective: "+0.32", "-1.45", "#5". */
function formatEval(cp, isMate, mateIn) {
  if (isMate) return `#${mateIn}`
  const pawns = (cp / 100).toFixed(2)
  return cp >= 0 ? `+${pawns}` : pawns
}

/** Get the tier visuals for a node. Falls back to a default for unanalysed nodes. */
function tier(d) {
  const count = d.data.acceptableCount
  if (count === null || count === undefined) {
    return { colour: '#555', r: 10, dash: null, label: '...' }
  }
  return getPrecisionTier(count)
}

// ── Main export ─────────────────────────────────────────────────────────────

/**
 * Initialise the D3 tree inside the given container element.
 *
 * @param {string}   containerSelector  CSS selector for the container div
 * @param {NodeData} rootData           Mutable root node from builder.js
 * @param {object}   opts
 * @param {function} opts.onNodeClick   Called with (nodeData) on node click
 * @returns {{ update: function, destroy: function }}
 */
export function initRenderer(containerSelector, rootData, { onNodeClick } = {}) {
  const container = document.querySelector(containerSelector)
  if (!container) throw new Error(`Container not found: ${containerSelector}`)

  // Clear any previous render
  container.innerHTML = ''

  const width  = container.clientWidth
  const height = container.clientHeight

  // ── SVG setup ───────────────────────────────────────────────────────────
  const svg = d3.select(container)
    .append('svg')
    .attr('width', '100%')
    .attr('height', '100%')
    .attr('viewBox', `0 0 ${width} ${height}`)

  const g = svg.append('g')
    .attr('transform', `translate(80, ${height / 2})`)

  // Zoom / pan
  const zoom = d3.zoom()
    .scaleExtent([0.1, 4])
    .on('zoom', (event) => g.attr('transform', event.transform))

  svg.call(zoom)

  // Set initial transform so root is visible
  const initialTransform = d3.zoomIdentity.translate(80, height / 2)
  svg.call(zoom.transform, initialTransform)

  // ── Layout ──────────────────────────────────────────────────────────────
  const treeLayout = d3.tree()
    .nodeSize([50, 220])
    .separation((a, b) => a.parent === b.parent ? 1 : 1.4)

  // Link generator for horizontal tree
  const linkGen = d3.linkHorizontal()
    .x(d => d.y)
    .y(d => d.x)

  let selectedNodeId = null
  let idCounter      = 0

  // ── Update function ─────────────────────────────────────────────────────
  function update(sourceData) {
    // Recompute hierarchy from mutable root every time (lazy expansion
    // means the tree shape changes between renders).
    const root = d3.hierarchy(rootData, d => d.children)
    treeLayout(root)

    // Assign stable IDs for D3 data joins
    root.each(d => {
      if (d.data._d3id === undefined) d.data._d3id = idCounter++
    })

    const duration = 400

    // ── Nodes ─────────────────────────────────────────────────────────
    const nodes = root.descendants()

    const nodeSelection = g.selectAll('g.node')
      .data(nodes, d => d.data._d3id)

    // Enter
    const nodeEnter = nodeSelection.enter()
      .append('g')
      .attr('class', 'node')
      .attr('transform', () => {
        const origin = sourceData
          ? `translate(${sourceData.y ?? 0},${sourceData.x ?? 0})`
          : `translate(0,0)`
        return origin
      })
      .attr('cursor', 'pointer')
      .on('click', (_event, d) => {
        selectedNodeId = d.data.id
        if (onNodeClick) onNodeClick(d.data)
        update(d)
      })

    // Circle
    nodeEnter.append('circle')
      .attr('r', 0)

    // SAN label (below circle)
    nodeEnter.append('text')
      .attr('class', 'node-move')
      .attr('dy', d => tier(d).r + 16)
      .attr('text-anchor', 'middle')
      .attr('fill', '#ccc')
      .attr('font-size', '12px')
      .attr('font-weight', 600)

    // Eval label (below SAN)
    nodeEnter.append('text')
      .attr('class', 'node-eval')
      .attr('dy', d => tier(d).r + 30)
      .attr('text-anchor', 'middle')
      .attr('fill', '#888')
      .attr('font-size', '10px')

    // Merge enter + update
    const nodeUpdate = nodeEnter.merge(nodeSelection)

    nodeUpdate.transition()
      .duration(duration)
      .attr('transform', d => `translate(${d.y},${d.x})`)

    nodeUpdate.select('circle')
      .transition()
      .duration(duration)
      .attr('r', d => tier(d).r)
      .attr('fill', d => tier(d).colour)
      .attr('stroke', d => d.data.id === selectedNodeId ? '#fff' : '#1a1a2e')
      .attr('stroke-width', d => d.data.id === selectedNodeId ? 3 : 2)
      .attr('stroke-dasharray', d => tier(d).dash)

    nodeUpdate.select('.node-move')
      .text(d => d.data.move ?? 'root')
      .attr('dy', d => tier(d).r + 16)

    nodeUpdate.select('.node-eval')
      .text(d => {
        if (d.data.cp === null) return ''
        const result = d.data._analysisResult
        if (result?.lines?.[0]?.isMate) {
          return formatEval(d.data.cp, true, result.lines[0].mateIn)
        }
        return formatEval(d.data.cp, false, null)
      })
      .attr('dy', d => tier(d).r + 30)

    // Loading pulse
    nodeUpdate.select('circle')
      .classed('is-loading', d => d.data._loading)

    // Exit
    nodeSelection.exit()
      .transition()
      .duration(duration)
      .attr('transform', () => {
        const target = sourceData
          ? `translate(${sourceData.y ?? 0},${sourceData.x ?? 0})`
          : `translate(0,0)`
        return target
      })
      .remove()
      .select('circle')
      .attr('r', 0)

    // ── Links ─────────────────────────────────────────────────────────
    const links = root.links()

    const linkSelection = g.selectAll('path.link')
      .data(links, d => d.target.data._d3id)

    const linkEnter = linkSelection.enter()
      .insert('path', 'g')   // insert before nodes so links render behind
      .attr('class', 'link')
      .attr('fill', 'none')
      .attr('stroke', '#444')
      .attr('stroke-width', 1.5)
      .attr('d', () => {
        const o = sourceData ? { x: sourceData.x ?? 0, y: sourceData.y ?? 0 } : { x: 0, y: 0 }
        return linkGen({ source: o, target: o })
      })

    linkEnter.merge(linkSelection)
      .transition()
      .duration(duration)
      .attr('d', d => linkGen(d))

    linkSelection.exit()
      .transition()
      .duration(duration)
      .attr('d', () => {
        const o = sourceData ? { x: sourceData.x ?? 0, y: sourceData.y ?? 0 } : { x: 0, y: 0 }
        return linkGen({ source: o, target: o })
      })
      .remove()
  }

  // ── Store subscription — re-render when analysis arrives ────────────────
  const unsubscribe = store.subscribe(() => update(null))

  // ── Initial render ──────────────────────────────────────────────────────
  update(null)

  return {
    update,
    destroy() {
      unsubscribe()
      container.innerHTML = ''
    },
  }
}
