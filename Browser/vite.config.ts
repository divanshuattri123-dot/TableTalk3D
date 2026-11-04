import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { createReadStream, existsSync, statSync } from "node:fs";
import { resolve, sep } from "node:path";
import type {Declaration} from 'postcss';

export default defineConfig({
  base: process.env.PAGES_BASE_PATH ?? "./",
  build:{target:'chrome91'},
  css:{postcss:{plugins:[{postcssPlugin:'android-viewport-fallback',Declaration(declaration:Declaration){
    const fallback=declaration.value.replace(/(\d*\.?\d+)[sd]v([hw])\b/g,'$1v$2');
    if(fallback!==declaration.value)declaration.cloneBefore({value:fallback});
  }}]}},
  // The Unity loader expects native browser decompression and correct Wasm MIME types.
  // Production uses the generated _headers file; Vite's static server needs the same mapping.
  plugins: [react(), { name: "unity-encoding", configureServer(server) {
    server.middlewares.use((request, response, next) => {
      const url = request.url?.split("?")[0] ?? "";
      if (url.startsWith("/unity/")) {
        const root = resolve("public/unity"), file = resolve(root, `.${url.slice(6)}`);
        if (!file.startsWith(root + sep) || !existsSync(file)) { response.statusCode = 404; response.end("Unity player is not built yet."); return; }
        if (url.endsWith(".gz")) response.setHeader("Content-Encoding", "gzip");
        response.setHeader("Content-Length", statSync(file).size);
        response.setHeader("Content-Type", url.endsWith(".wasm.gz") ? "application/wasm" : /\.js(\.gz)?$/.test(url) ? "application/javascript" : url.endsWith(".json") ? "application/json" : "application/gzip");
        createReadStream(file).pipe(response); return;
      }
      next();
    });
  } }],
  server: {
    host: true,
    watch: { ignored: ["**/work/**", "**/outputs/**", `${resolve("unity").replaceAll("\\", "/")}/**`] }
  }
});
