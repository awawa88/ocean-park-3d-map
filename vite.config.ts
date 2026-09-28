import { defineConfig } from "vite";
import { devTools } from "./scripts/dev-server";

export default defineConfig({
  plugins: [devTools(__dirname)],
  server: { host: true, port: 5173, watch: { ignored: ["**/feedback/**", "**/refs/**"] } },
  preview: { host: true, port: 4173 },
  // three.js is most of the bundle (~200 kB gzipped in total); one chunk is fine.
  build: { chunkSizeWarningLimit: 1000 },
});
