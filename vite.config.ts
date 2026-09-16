import { nitroV2Plugin } from '@tanstack/nitro-v2-vite-plugin'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import viteReact from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import tsconfigPaths from 'vite-tsconfig-paths'
/// <reference types="vitest/config" />
import { mergeConfig, defineConfig as vitestConfig } from 'vitest/config'

if (!process.env.VITE_ROOT_URL) throw new Error('env var VITE_ROOT_URL is missing')

const rootUrl = new URL(process.env.VITE_ROOT_URL)

export default mergeConfig(
	vitestConfig({
		test: {
			root: './',
			include: ['**/*.{test,spec}.?(c|m)[jt]s?(x)'],
			exclude: ['**/node_modules/**', '**/dist/**'],
			// setupFiles: ["./vitest.setup.ts"],
			// alias: {
			//   "#server": new URL("../server", import.meta.url).pathname,
			//   "#lib": new URL("../", import.meta.url).pathname,
			//   "#client": new URL("./", import.meta.url).pathname,
			// },
		},
	}),
	defineConfig({
		plugins: [
			tsconfigPaths(),
			// tanstackStart before viteReact (Start owns the React transform order).
			// nitroV2 between them: Start registers the SSR env; nitro captures that
			// SSR bundle and wraps it as the Nitro renderer before React's plugin runs.
			tanstackStart(),
			nitroV2Plugin(),
			viteReact(),
		],
		build: {
			target: 'esnext',
			// Client environment writes here; nitroV2Plugin copies that directory
			// into .output/public. Keep it inside the package (never `../…`).
			outDir: 'dist',
		},
		server: {
			port: Number(rootUrl.port),
			host: rootUrl.hostname,
		},
	}),
)
