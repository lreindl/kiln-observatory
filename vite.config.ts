import { defineConfig } from "vitest/config";

// `npm run dev` serves the scene alone (it falls back to the demo feed);
// `npm run worker` serves the built site through the Worker, with the live feed.
export default defineConfig({
  build: { target: "es2022", chunkSizeWarningLimit: 1200 }, // three.js is most of it
  server: { proxy: { "/api": { target: "http://127.0.0.1:8787", ws: true } } },
  test: { environment: "node" },
});
