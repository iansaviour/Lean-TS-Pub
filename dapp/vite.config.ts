import { defineConfig } from "vite";
import { nodePolyfills } from "vite-plugin-node-polyfills";

export default defineConfig({
  base: "/Lean-TS-Pub/",
  plugins: [
    nodePolyfills({
      include: ["buffer", "process"],
      globals: { Buffer: true, process: true, global: true },
    }),
  ],
});
