import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Build landet in data/signature-ui/dist und wird von app.py ausgeliefert.
// "static" statt "assets", weil /assets/ für die Logos reserviert ist.
export default defineConfig({
  plugins: [react()],
  build: { outDir: "../data/signature-ui/dist", emptyOutDir: true, assetsDir: "static" },
  server: { proxy: { "/api": "http://localhost:8090", "/assets": "http://localhost:8090" } },
});
