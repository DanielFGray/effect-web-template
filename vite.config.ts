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
			// tanstack plugin must come before react plugin
			tanstackStart(),
			viteReact(),
		],
		build: {
			target: 'esnext',
			// Relative to this config's directory. Anything starting `../` lands
			// outside the package, where the emitted server entry cannot resolve
			// node_modules and nothing gitignores it.
			outDir: 'dist',
		},
		server: {
			port: Number(rootUrl.port),
			host: rootUrl.hostname,
		},
	}),
)
