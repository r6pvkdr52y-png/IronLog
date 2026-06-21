import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Using a relative base ("./") means the build works whether it's hosted
// at a domain root or under a GitHub Pages project subpath
// (e.g. username.github.io/ironlog/) without any extra configuration.
export default defineConfig({
  plugins: [react()],
  base: "./",
});
