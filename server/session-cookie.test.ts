import { Cookies, FetchHttpClient, HttpClient, HttpClientRequest } from '@effect/platform'
import { suite, expect, it } from '@effect/vitest'
import { Config, Duration, Effect, Layer, Option } from 'effect'

/**
 * Start session-cookie adapter must set Set-Cookie on every login/register/
 * logout — not roughly one request in ten. Hits the no-JS form handlers
 * against the Vite/Start server on VITE_ROOT_URL.
 */
const TestHttpClientLive = Layer.merge(
	FetchHttpClient.layer,
	Layer.succeed(FetchHttpClient.RequestInit, { redirect: 'manual' }),
)

const origin = Config.string('VITE_ROOT_URL').pipe(
	Effect.map((url) => new URL(url).origin),
)

const runId = Math.random().toString(36).slice(2, 8)
const password = 'password123'

const assertSessionCookie = (cookies: Cookies.Cookies) => {
	const session = Cookies.get(cookies, 'session')
	expect(Option.isSome(session)).toBe(true)
	if (Option.isNone(session)) return
	expect(session.value.value.length).toBeGreaterThan(0)
	expect(session.value.options?.httpOnly).toBe(true)
	expect(session.value.options?.sameSite).toBe('lax')
}

const loginForm = (client: HttpClient.HttpClient, base: string, id: string) =>
	HttpClientRequest.post(`${base}/login`).pipe(
		HttpClientRequest.bodyUrlParams({ id, password }),
		HttpClientRequest.setHeader('Accept', 'text/html'),
		client.execute,
	)

suite('Start session cookie (no-JS forms)', () => {
	it.live(
		'5 sequential registers each set session cookie and 307 to /',
		() =>
			Effect.gen(function* () {
				const client = yield* HttpClient.HttpClient
				const base = yield* origin

				for (let i = 0; i < 5; i++) {
					const username = `scr${runId}${i}`
					const response = yield* HttpClientRequest.post(`${base}/register`).pipe(
						HttpClientRequest.bodyUrlParams({
							username,
							email: `${username}@ex.com`,
							password,
							confirmPassword: password,
						}),
						HttpClientRequest.setHeader('Accept', 'text/html'),
						client.execute,
					)
					expect(response.status).toBe(307)
					expect(response.headers.location).toBe('/')
					assertSessionCookie(response.cookies)
				}
			}).pipe(Effect.provide(TestHttpClientLive)),
		{ timeout: 60_000 },
	)

	it.live(
		'5 sequential logins each set session cookie',
		() =>
			Effect.gen(function* () {
				const client = yield* HttpClient.HttpClient
				const base = yield* origin
				const username = `scl${runId}`

				const registered = yield* HttpClientRequest.post(`${base}/register`).pipe(
					HttpClientRequest.bodyUrlParams({
						username,
						email: `${username}@ex.com`,
						password,
						confirmPassword: password,
					}),
					HttpClientRequest.setHeader('Accept', 'text/html'),
					client.execute,
				)
				expect(registered.status).toBe(307)
				assertSessionCookie(registered.cookies)

				for (let i = 0; i < 5; i++) {
					const response = yield* loginForm(client, base, username)
					expect(response.status).toBe(307)
					assertSessionCookie(response.cookies)
				}
			}).pipe(Effect.provide(TestHttpClientLive)),
		{ timeout: 60_000 },
	)

	it.live(
		'5 concurrent logins each set session cookie',
		() =>
			Effect.gen(function* () {
				const client = yield* HttpClient.HttpClient
				const base = yield* origin
				const username = `scc${runId}`

				const registered = yield* HttpClientRequest.post(`${base}/register`).pipe(
					HttpClientRequest.bodyUrlParams({
						username,
						email: `${username}@ex.com`,
						password,
						confirmPassword: password,
					}),
					HttpClientRequest.setHeader('Accept', 'text/html'),
					client.execute,
				)
				expect(registered.status).toBe(307)
				assertSessionCookie(registered.cookies)

				const responses = yield* Effect.all(
					Array.from({ length: 5 }, () => loginForm(client, base, username)),
					{ concurrency: 'unbounded' },
				)

				for (const response of responses) {
					expect(response.status).toBe(307)
					assertSessionCookie(response.cookies)
				}
			}).pipe(Effect.provide(TestHttpClientLive)),
		{ timeout: 60_000 },
	)

	it.live(
		'register cookie authenticates SSR home and /settings',
		() =>
			Effect.gen(function* () {
				const client = yield* HttpClient.HttpClient
				const base = yield* origin
				const username = `sce${runId}`

				const registered = yield* HttpClientRequest.post(`${base}/register`).pipe(
					HttpClientRequest.bodyUrlParams({
						username,
						email: `${username}@ex.com`,
						password,
						confirmPassword: password,
					}),
					HttpClientRequest.setHeader('Accept', 'text/html'),
					client.execute,
				)
				expect(registered.status).toBe(307)
				assertSessionCookie(registered.cookies)

				const session = Cookies.get(registered.cookies, 'session')
				if (Option.isNone(session)) {
					throw new Error('missing session cookie after register')
				}
				const cookieHeader = Cookies.toCookieHeader(
					Cookies.fromReadonlyRecord({ session: session.value }),
				)

				const home = yield* HttpClientRequest.get(`${base}/`).pipe(
					HttpClientRequest.setHeader('Cookie', cookieHeader),
					HttpClientRequest.setHeader('Accept', 'text/html'),
					client.execute,
				)
				expect(home.status).toBe(200)
				const homeHtml = yield* home.text
				expect(homeHtml).toContain(username)

				const settings = yield* HttpClientRequest.get(`${base}/settings`).pipe(
					HttpClientRequest.setHeader('Cookie', cookieHeader),
					HttpClientRequest.setHeader('Accept', 'text/html'),
					client.execute,
				)
				expect(settings.status).toBe(200)
			}).pipe(Effect.provide(TestHttpClientLive)),
		{ timeout: 60_000 },
	)

	it.live(
		'logout clears the session cookie',
		() =>
			Effect.gen(function* () {
				const client = yield* HttpClient.HttpClient
				const base = yield* origin
				const username = `sco${runId}`

				const registered = yield* HttpClientRequest.post(`${base}/register`).pipe(
					HttpClientRequest.bodyUrlParams({
						username,
						email: `${username}@ex.com`,
						password,
						confirmPassword: password,
					}),
					HttpClientRequest.setHeader('Accept', 'text/html'),
					client.execute,
				)
				expect(registered.status).toBe(307)
				assertSessionCookie(registered.cookies)

				const session = Cookies.get(registered.cookies, 'session')
				if (Option.isNone(session)) {
					throw new Error('missing session cookie after register')
				}
				const cookieHeader = Cookies.toCookieHeader(
					Cookies.fromReadonlyRecord({ session: session.value }),
				)

				const logout = yield* HttpClientRequest.post(`${base}/logout`).pipe(
					HttpClientRequest.setHeader('Accept', 'text/html'),
					HttpClientRequest.setHeader('Cookie', cookieHeader),
					client.execute,
				)
				expect(logout.status).toBe(307)
				expect(logout.headers.location).toBe('/')

				const cleared = Cookies.get(logout.cookies, 'session')
				expect(Option.isSome(cleared)).toBe(true)
				if (Option.isNone(cleared)) return
				expect(cleared.value.value).toBe('')
				const maxAge = cleared.value.options?.maxAge
				expect(maxAge).toBeDefined()
				if (maxAge !== undefined) {
					expect(Duration.toMillis(maxAge)).toBe(0)
				}
			}).pipe(Effect.provide(TestHttpClientLive)),
		{ timeout: 60_000 },
	)
})
