import { defineConfig } from "vite";
import tsconfigPaths from 'vite-tsconfig-paths'

export default defineConfig({
  plugins: [tsconfigPaths()],
  build: {
    target: "esnext",
    outDir: "../dist/client",
  },
  root: './client',
  server: {
    port: 3000,
    host: "localhost",
    proxy: {
      "/rpc": {
        target: `http://localhost:${process.env.PORT}`,
        changeOrigin: true,
      },
    },
  },
});
