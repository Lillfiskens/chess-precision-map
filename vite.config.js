import { defineConfig } from 'vite'

export default defineConfig({
  assetsInclude: ['**/*.wasm'],
  // Uncomment for multi-threaded Stockfish (requires HTTPS or localhost with these headers):
  // server: {
  //   headers: {
  //     'Cross-Origin-Embedder-Policy': 'require-corp',
  //     'Cross-Origin-Opener-Policy': 'same-origin',
  //   }
  // },
})
