import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  server: { port: 5173, strictPort: true, fs: { allow: [fileURLToPath(new URL(".", import.meta.url)), fileURLToPath(new URL("../packages/spreadsheet-formula", import.meta.url))] } },
  plugins: [react(), tailwindcss()],
  optimizeDeps: {
    include: ["exceljs", "jszip"],
  },
});
