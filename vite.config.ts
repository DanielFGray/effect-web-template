/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";

if (!process.env.ROOT_URL) throw new Error("env var ROOT_URL is missing");

const rootUrl = new URL(process.env.ROOT_URL);

export default defineConfig({
  test: {
    root: "./",
  },
  plugins: [tsconfigPaths()],
  build: {
    target: "esnext",
    outDir: "../dist/client",
  },
  root: "./client",
  server: {
    port: Number(rootUrl.port),
    host: rootUrl.hostname,
    proxy: {
      "/rpc": {
        target: `http://localhost:${process.env.PORT}`,
        changeOrigin: true,
      },
    },
  },
});
