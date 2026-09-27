import { resolve } from "node:path";
import preact from "@preact/preset-vite";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [preact()],
  build: {
    outDir: "dist/web",
    emptyOutDir: false,
    sourcemap: true,
    rollupOptions: {
      input: {
        app: resolve(process.cwd(), "web/app.ts"),
        evacuation: resolve(process.cwd(), "web/evacuation.ts"),
      },
      output: {
        entryFileNames: "[name].js",
        chunkFileNames: "assets/[name]-[hash].js",
        assetFileNames: (asset) => asset.name?.endsWith(".css") ? "ui.css" : "assets/[name]-[hash][extname]",
      },
    },
    cssCodeSplit: false,
  },
});
