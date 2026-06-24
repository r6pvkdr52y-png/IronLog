import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { viteStaticCopy } from "vite-plugin-static-copy";

export default defineConfig({
  plugins: [
    react(),
    viteStaticCopy({
      targets: [
        // Icons — one pair per theme
        { src: "icon-ember-192.png",    dest: "." },
        { src: "icon-ember-512.png",    dest: "." },
        { src: "icon-crimson-192.png",  dest: "." },
        { src: "icon-crimson-512.png",  dest: "." },
        { src: "icon-forest-192.png",   dest: "." },
        { src: "icon-forest-512.png",   dest: "." },
        { src: "icon-lavender-192.png", dest: "." },
        { src: "icon-lavender-512.png", dest: "." },
        { src: "icon-ocean-192.png",    dest: "." },
        { src: "icon-ocean-512.png",    dest: "." },
        { src: "icon-hotpink-192.png",  dest: "." },
        { src: "icon-hotpink-512.png",  dest: "." },
        // Manifests — one per theme plus default
        { src: "manifest.json",         dest: "." },
        { src: "manifest-ember.json",   dest: "." },
        { src: "manifest-crimson.json", dest: "." },
        { src: "manifest-forest.json",  dest: "." },
        { src: "manifest-lavender.json",dest: "." },
        { src: "manifest-ocean.json",   dest: "." },
        { src: "manifest-hotpink.json", dest: "." },
        // Service worker
        { src: "sw.js",                 dest: "." },
      ],
    }),
  ],
  base: "./",
});
