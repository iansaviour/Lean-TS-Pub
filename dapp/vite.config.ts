import { defineConfig } from "vite";
import { nodePolyfills } from "vite-plugin-node-polyfills";

export default defineConfig({
  base: "/Learn-TS-TON/",
  plugins: [
    nodePolyfills({
      include: ["buffer", "process"],
      globals: { Buffer: true, process: true, global: true },
    }),
  ],
});
