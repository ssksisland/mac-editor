import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { readFile } from "node:fs/promises";

const modelEntry = /[\\/]@vscode[\\/]vscode-languagedetection[\\/]dist[\\/]lib[\\/]index\.js$/;

// 1.0.23 的 Webpack 产物通过拼接路径 require CPU chunk。
// 显式引用它，让 Vite 的开发预打包和生产 Worker 构建都能包含后端。
function includeModelBackend(code: string): string {
  const dynamicChunk = /require\("\.\/"\+\w+\.u\(\w+\)\)/;
  if (!dynamicChunk.test(code)) throw new Error('语言检测依赖的打包格式已变化，请更新 CPU 后端适配。');
  return code.replace(dynamicChunk, 'require("./979.js")');
}

// @ts-expect-error process is a nodejs global
const host = process.env.TAURI_DEV_HOST;

// https://vite.dev/config/
export default defineConfig(async () => ({
  plugins: [react()],
  worker: {
    plugins: () => [{
      name: "language-detection-backend",
      enforce: "pre",
      transform(code, id) {
        if (modelEntry.test(id)) return includeModelBackend(code);
      },
    }],
  },
  optimizeDeps: {
    esbuildOptions: {
      plugins: [{
        name: "language-detection-backend",
        setup(build) {
          build.onLoad({ filter: modelEntry }, async ({ path }) => ({
            contents: includeModelBackend(await readFile(path, 'utf8')),
            loader: 'js',
          }));
        },
      }],
    },
  },

  // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
  //
  // 1. prevent Vite from obscuring rust errors
  clearScreen: false,
  // 2. tauri expects a fixed port, fail if that port is not available
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      // 3. tell Vite to ignore watching `src-tauri`
      ignored: ["**/src-tauri/**"],
    },
  },
}));
