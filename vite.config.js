import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { viteStaticCopy } from "vite-plugin-static-copy";

// Flat project layout: no src/ or public/ subfolders, everything sits at the
// project root. Vite normally expects static files (icons, manifest, service
// worker) in a "public" folder — since we don't have one, we explicitly copy
// those specific files into the build output instead.
export default defineConfig({
  plugins: [
    react(),
    viteStaticCopy({
      targets: [
        { src: "icon-192.png", dest: "." },
        { src: "icon-512.png", dest: "." },
        { src: "manifest.json", dest: "." },
        { src: "sw.js", dest: "." },
      ],
    }),
  ],
  base: "./",
});
