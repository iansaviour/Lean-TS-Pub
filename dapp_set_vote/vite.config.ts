import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { nodePolyfills } from 'vite-plugin-node-polyfills'

// @ton/core uses Node's Buffer at import time (BitString.EMPTY).
// Without this polyfill the module throws and React never mounts.
// Production is served at https://iansaviour.github.io/Lean-TS-Pub/set-vote/
export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/Lean-TS-Pub/set-vote/' : '/',
  plugins: [
    react(),
    nodePolyfills({
      include: ['buffer', 'process'],
      globals: { Buffer: true, process: true, global: true },
    }),
  ],
}))
