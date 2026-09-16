import {
	FetchHttpClient,
	HttpClient,
	HttpClientRequest,
	HttpClientResponse,
} from '@effect/platform'
import { suite, expect, it } from '@effect/vitest'
import { Config, Effect, Layer } from 'effect'

/**
 * Hosting contract for `bun run start` (Nitro on PORT).
 *
 * `bun run test` needs both:
 * - the Vite/Start dev server on VITE_ROOT_URL (other it.live suites)
 * - this production server on PORT (after `bun run build` && `bun run start`)
 *
 * If the production server is down, this suite fails on the first request —
 * it does not skip or pass silently.
 *
 * Fetch follows redirects by default; RequestInit.redirect=manual keeps the
 * anonymous /settings 307 visible so we can assert the guard.
 */
const TestHttpClientLive = Layer.merge(
	FetchHttpClient.layer,
	Layer.succeed(FetchHttpClient.RequestInit, { redirect: 'manual' }),
)

const baseUrl = Config.integer('PORT').pipe(
	Effect.map((port) => `http://127.0.0.1:${port}`),
	Effect.orDieWith(
		() =>
			new Error(
				'PORT is missing from the environment; production-start tests need bun run start',
			),
	),
)

const assetPath = (html: string, ext: 'js' | 'css'): string => {
	const match = html.match(new RegExp(`(/assets/[^"'\\s]+\\.${ext})`))
	if (!match) {
		throw new Error(`no /assets/*.${ext} reference in HTML`)
	}
	return match[1]!
}

suite('production start smoke', () => {
	it.live(
		'serves HTML, assets, API, and anonymous settings guard',
		() =>
			Effect.gen(function* () {
				const origin = yield* baseUrl
				const client = yield* HttpClient.HttpClient

				const home = yield* client.execute(HttpClientRequest.get(`${origin}/`)).pipe(
					Effect.catchTag('RequestError', () =>
						Effect.fail(
							new Error(
								`production server not reachable at ${origin}; run \`bun run build\` and \`bun run start\` before \`bun run test\``,
							),
						),
					),
					Effect.flatMap(HttpClientResponse.filterStatusOk),
				)
				expect(home.status).toBe(200)
				const homeHtml = yield* home.text
				const jsPath = assetPath(homeHtml, 'js')
				const cssPath = assetPath(homeHtml, 'css')

				const js = yield* client.execute(HttpClientRequest.get(`${origin}${jsPath}`))
				expect(js.status).toBe(200)

				const css = yield* client.execute(HttpClientRequest.get(`${origin}${cssPath}`))
				expect(css.status).toBe(200)

				const badLogin = yield* HttpClientRequest.post(`${origin}/api/auth/login`).pipe(
					HttpClientRequest.bodyJson({ id: 'nobody', password: 'wrong' }),
					Effect.flatMap(client.execute),
				)
				expect(badLogin.status).toBe(401)

				const settingsAnon = yield* client.execute(
					HttpClientRequest.get(`${origin}/settings`),
				)
				expect(settingsAnon.status).toBe(307)
				expect(settingsAnon.headers.location).toBe('/login')
			}).pipe(Effect.provide(TestHttpClientLive)),
		{ timeout: 30_000 },
	)
})
