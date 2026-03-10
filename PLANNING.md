# Chess Precision Map — Planning

## What is this?

A browser-based interactive tree visualisation of chess openings, powered by the Stockfish engine.
The key insight is showing **response precision** at each node: how many acceptable replies exist
for the side to move, and how much the evaluation drops if they miss them.

This is distinct from existing tools (lichess explorer, chesstree.net, treevis.org) which show
win rates from human games. This tool shows **engine-evaluated precision requirements**.

---

## Core Concept

At every position in the opening tree:

1. Run Stockfish with MultiPV (requesting top N moves, where N = number of legal moves capped at `MULTIPV_COUNT`)
2. Count how many replies stay within `EQUALITY_THRESHOLD_CP` centipawns of the best move
3. Colour-code the node by this count:

| Count | Label    | Colour |
|-------|----------|--------|
| 1     | Forced   | Red    |
| 2     | Critical | Orange |
| 3     | Narrow   | Yellow |
| 4–6   | Open     | Green  |
| 7+    | Free     | Teal   |

Shape encoding (circle size or border style) supplements colour for accessibility.

### Precision is Directional

Precision is always computed for **the side to move at that node**. A "Forced" node for White
and a "Forced" node for Black have different study implications — the detail panel must make this
explicit.

---

## Tech Stack

- **Vite** — build tooling
- **Vanilla JS** — no framework overhead
- **D3.js** — tree layout and SVG rendering
- **chess.js** — board logic, FEN strings, legal move generation
- **Stockfish.js (WASM)** — runs in-browser via Web Worker, no backend needed

---

## Architecture

```
src/
  main.js              # entry point, wires modules together, owns app state
  engine/
    stockfish.js       # Web Worker wrapper, UCI message parsing, queue management
    analyser.js        # analyses a position: sends UCI commands, returns MultiPV result
  tree/
    store.js           # FEN-keyed analysis cache; canonical source of truth
    builder.js         # expands a node: reads from store or enqueues analysis
    renderer.js        # D3 rendering; subscribes to store updates
  ui/
    panel.js           # detail panel for selected node (top moves, eval, side to move)
    legend.js          # colour/shape legend
    fen-input.js       # FEN / starting-position input field
  data/
    openings.js        # seed opening lines with name labels
```

### Data Flow

```
User action / page load
        │
        ▼
  builder.js (expand node)
        │
        ├─ FEN in store? ──yes──▶ renderer.js (D3 update)
        │
        └─ no ──▶ engine queue (stockfish.js)
                        │
                        ▼
                  analyser.js (UCI MultiPV)
                        │
                        ▼
                  store.js (cache result by FEN)
                        │
                        ▼
                  renderer.js (D3 update)
```

`main.js` owns app state (selected node, root FEN, config). All other modules are stateless or
read/write through `store.js`.

---

## Transpositions

Chess openings regularly reach the same position via different move orders (e.g. 1.d4 d5 2.c4
and 1.c4 d5 2.d4). The tree is rendered as a **visual tree** (D3 layout), but analysis is
**FEN-keyed** in `store.js`. This means:

- Each unique position is analysed **exactly once**, regardless of how many paths lead to it
- D3 nodes that share a FEN show the same precision colour
- The queue deduplicates by FEN before dispatching to the engine

---

## Branching and Scale

Chess has an average branching factor of ~30 legal moves, but MultiPV is capped at
`MULTIPV_COUNT`. Only the moves Stockfish returns as top candidates are added as child nodes —
not all legal moves. This keeps the effective branching factor at ≤ `CHILD_BRANCH_LIMIT`
(default: 5) per node for tree expansion purposes, even if `MULTIPV_COUNT` is higher.

| Depth (ply) | Nodes (branch=5) | Nodes (branch=10) |
|-------------|-------------------|---------------------|
| 4           | ~780              | ~11,000             |
| 6           | ~19,000           | ~1,100,000          |
| 8           | ~488,000          | ~111,000,000        |

**Consequence**: depth beyond 6 with branching > 5 is impractical. The tool enforces a hard cap
of `MAX_TOTAL_NODES` (default: 3,000) and stops expanding once reached, regardless of depth.

Lazy expansion (analyse on node click/expand) is the primary mitigation. The root and its
immediate children are pre-analysed on load; everything else is on-demand.

---

## Key Parameters (tunable via UI)

| Constant               | Default | Description                                                    |
|------------------------|---------|----------------------------------------------------------------|
| `MULTIPV_COUNT`        | 10      | Lines requested from engine per position (≥ legal move count for accuracy, but capped for performance) |
| `EQUALITY_THRESHOLD_CP`| 30      | Centipawn window for "acceptable" reply                        |
| `CHILD_BRANCH_LIMIT`   | 5       | Max child nodes added per expansion (top N of MultiPV results) |
| `MAX_DEPTH_PLY`        | 6       | Maximum half-move depth for auto-expansion                     |
| `ANALYSIS_DEPTH`       | 12      | Stockfish search depth per position (12 is fast; 16 for accuracy)|
| `MAX_TOTAL_NODES`      | 3000    | Hard cap on total nodes in the tree                            |

### On `MULTIPV_COUNT` Accuracy

Requesting only 10 lines when a position has 30+ legal moves risks under-counting acceptable
replies — moves ranked 11+ could be within threshold. To mitigate:

- Default `MULTIPV_COUNT` is 10 for speed
- When the 10th result falls within `EQUALITY_THRESHOLD_CP` of best, a warning flag is set on
  the node ("may have more acceptable moves") and `MULTIPV_COUNT` is doubled for that position
  automatically

---

## MVP Scope

- [ ] Stockfish WASM Web Worker integration with MultiPV
- [ ] UCI output parser → structured `{ move, cp, rank }` objects
- [ ] FEN-keyed analysis store with deduplication
- [ ] Seed openings as starting positions (selectable from dropdown)
- [ ] Custom FEN / starting position input
- [ ] D3 collapsible tree layout with lazy expansion
- [ ] Node colouring **and shape encoding** by precision count
- [ ] Hard branching and total-node caps enforced
- [ ] Eval display per node (from White's perspective, consistent axis)
- [ ] Click node → detail panel: side to move, top 3 moves with cp-loss, precision label
- [ ] Node hover tooltip: move played, eval, acceptable-move count
- [ ] Analysis progress indicator (queued / analysing / done)

---

## Out of Scope (for now)

- Server-side analysis or persistent caching (IndexedDB could come later)
- Opening name labels on nodes (seed data has names; displaying them on the tree is deferred)
- Mobile layout
- PGN import
- Comparison with human game frequency (lichess data overlay)

---

## Eval Display Convention

All eval bars show centipawns **from White's perspective** (positive = White better), consistent
across all nodes. This avoids confusion when toggling between nodes where different sides are
to move. The detail panel also shows whose turn it is explicitly.

---

## Known Challenges

- **Branching explosion**: mitigated by `CHILD_BRANCH_LIMIT` + `MAX_TOTAL_NODES` cap + lazy expansion.
- **MULTIPV undercounting**: mitigated by auto-doubling when the Nth result is still within threshold.
- **Transpositions**: mitigated by FEN-keyed store; D3 tree may show duplicate nodes visually but they share the same analysis result.
- **Stockfish WASM startup**: load once on page load, keep the worker alive across all analyses. Show a loading indicator until ready.
- **Streaming UCI output**: engine streams `info` lines before `bestmove`. The analyser must buffer all `info depth N multipv M` lines and only resolve the promise on `bestmove`.
- **WASM thread limits**: Stockfish WASM is single-threaded in most browsers. Analysis depth 12 takes ~1–3s per position. Queue must be serialised (one position at a time), not parallelised.
- **Colour blindness**: shape + colour dual encoding is required from day one, not retrofitted later.
