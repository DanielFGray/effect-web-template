import {
	Cookies,
	FetchHttpClient,
	HttpApiClient,
	HttpClient,
	HttpClientRequest,
} from '@effect/platform'
import { suite, expect, it } from '@effect/vitest'
import { Effect, Ref, Config, Layer } from 'effect'

import { Contract } from '../shared/httpApi.js'

/**
 * Loader data must be seroval-serialized into the HTML for hydration.
 * SSR markup alone is not enough — that already renders when serialization fails.
 *
 * Marker: the post body must appear inside a `<script class="$tsr">` dehydration
 * script (TanStack Start's `$R["tsr"]` stream). With SerovalUnsupportedTypeError,
 * those scripts stay empty (`$R["tsr"]=[]`) while `<p>{body}</p>` still appears
 * in the markup.
 */
const TestHttpClientLive = Layer.merge(
	FetchHttpClient.layer,
	Layer.succeed(FetchHttpClient.RequestInit, { redirect: 'manual' }),
)

const origin = Config.string('VITE_ROOT_URL').pipe(
	Effect.map((url) => new URL(url).origin),
)

const runId = Math.random().toString(36).slice(2, 8)

const tsrScriptsContain = (html: string, needle: string) => {
	const scripts = [
		...html.matchAll(/<script[^>]*class="\$tsr"[^>]*>([\s\S]*?)<\/script>/g),
	].map((m) => m[1] ?? '')
	return scripts.some((s) => s.includes(needle))
}

suite('SSR loader payload', () => {
	it.live(
		'GET / HTML embeds serialized loader data for a new post',
		() =>
			Effect.gen(function* () {
				const cookiesRef = yield* Ref.make(Cookies.empty)
				const base = yield* origin
				const api = yield* HttpApiClient.make(Contract, {
					baseUrl: base,
					transformClient: (c) => c.pipe(HttpClient.withCookiesRef(cookiesRef)),
				})

				const username = `ssrload_${runId}`
				yield* api.users.register({
					payload: {
						username,
						password: 'password123',
						email: `${username}@example.com`,
					},
				})

				const body = `ssr-loader-payload-${runId}`
				yield* api.posts.create({
					payload: { body, privacy: 'public' },
				})

				const client = (yield* HttpClient.HttpClient).pipe(
					HttpClient.withCookiesRef(cookiesRef),
				)
				const home = yield* HttpClientRequest.get(`${base}/`).pipe(
					HttpClientRequest.setHeader('Accept', 'text/html'),
					client.execute,
				)
				expect(home.status).toBe(200)
				const html = yield* home.text

				// SSR markup is present even when serialization fails — not sufficient.
				expect(html).toContain(body)
				expect(html).toContain(`<p>${body}</p>`)

				// The dehydration script is what the client hydrates from.
				expect(tsrScriptsContain(html, body)).toBe(true)
			}).pipe(Effect.provide(TestHttpClientLive)),
		{ timeout: 60_000 },
	)

	it.live(
		'GET /settings HTML embeds serialized loader data for the user email',
		() =>
			Effect.gen(function* () {
				const cookiesRef = yield* Ref.make(Cookies.empty)
				const base = yield* origin
				const api = yield* HttpApiClient.make(Contract, {
					baseUrl: base,
					transformClient: (c) => c.pipe(HttpClient.withCookiesRef(cookiesRef)),
				})

				const username = `ssremail_${runId}`
				const email = `${username}@example.com`
				yield* api.users.register({
					payload: {
						username,
						password: 'password123',
						email,
					},
				})

				const client = (yield* HttpClient.HttpClient).pipe(
					HttpClient.withCookiesRef(cookiesRef),
				)
				const settings = yield* HttpClientRequest.get(`${base}/settings`).pipe(
					HttpClientRequest.setHeader('Accept', 'text/html'),
					client.execute,
				)
				expect(settings.status).toBe(200)
				const html = yield* settings.text

				expect(html).toContain(email)
				expect(tsrScriptsContain(html, email)).toBe(true)
			}).pipe(Effect.provide(TestHttpClientLive)),
		{ timeout: 60_000 },
	)
})
