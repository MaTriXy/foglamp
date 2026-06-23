import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// The demo frontend (React + @foglamp/ui + the foglamp/hud overlay). Built to
// dist/, then served by src/server.ts (which also runs the mock agents). The
// agent backend is a Bun server, not a Vite plugin, so this config is just the
// frontend build.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: { port: 3344 },
  build: { outDir: "dist", emptyOutDir: true },
});
