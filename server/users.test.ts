import {
	HttpClient,
	Cookies,
	HttpClientResponse,
	HttpClientRequest,
} from '@effect/platform'
import { FetchHttpClient } from '@effect/platform'
import { suite, expect, it } from '@effect/vitest'
import { Effect, Ref, Option, Config } from 'effect'

import { InvalidCredentials } from '../shared/errors.js'
import { User } from '../shared/schemas.js'

// Test layer that provides HTTP client for testing against running server
const TestHttpClientLive = FetchHttpClient.layer

const baseUrl = Config.string('PORT').pipe(
	Effect.map((port) => `http://localhost:${port}/api`),
)

// Unique per test run so re-running against a live, unreset database never
// collides with usernames left behind by a previous run.
const runId = Math.random().toString(36).slice(2, 8)

suite('user registration HTTP flow', () => {
	it.live('POST /auth/register returns user and sets session cookie', () =>
		Effect.gen(function* () {
			const client = yield* HttpClient.HttpClient
			const cookiesRef = yield* Ref.make(Cookies.empty)
			const clientWithCookies = client.pipe(HttpClient.withCookiesRef(cookiesRef))

			// Make the registration request
			const response = yield* HttpClientRequest.post(
				`${yield* baseUrl}/auth/register`,
			).pipe(
				HttpClientRequest.bodyJson({
					username: `testuser_${runId}`,
					password: 'password123',
					email: 'test@example.com',
				}),
				Effect.flatMap(clientWithCookies.execute),
			)

			// Check response status
			expect(response.status).toBe(201)

			// Check that user data was returned
			const user = yield* HttpClientResponse.schemaBodyJson(User.select)(response)
			expect(user).toBeTypeOf('object')
			expect(user).toHaveProperty('id')
			expect(user).toHaveProperty('username', `testuser_${runId}`)
			expect(user).toHaveProperty('role', 'user')
			expect(user).toHaveProperty('is_verified', false)
			expect(user.created_at).toBeInstanceOf(Date)

			// Check that session cookie was set
			const cookies = yield* Ref.get(cookiesRef)
			const sessionCookie = Cookies.get(cookies, 'session')
			expect(Option.isSome(sessionCookie)).toBe(true)

			if (Option.isSome(sessionCookie)) {
				// signed cookie: <session uuid>.<hmac signature>
				expect(sessionCookie.value.value).toMatch(/^[0-9a-f-]{36}\.[\w-]+$/)
			}
		}).pipe(Effect.provide(TestHttpClientLive)),
	)

	it.live('can use session cookie for authenticated requests', () =>
		Effect.gen(function* () {
			const client = yield* HttpClient.HttpClient
			const cookiesRef = yield* Ref.make(Cookies.empty)
			const clientWithCookies = client.pipe(HttpClient.withCookiesRef(cookiesRef))

			// First, register a user to get session cookie
			const registerResponse = yield* HttpClientRequest.post(
				`${yield* baseUrl}/auth/register`,
			).pipe(
				HttpClientRequest.bodyJson({
					username: `authuser_${runId}`,
					password: 'password123',
					email: 'auth@example.com',
				}),
				Effect.flatMap(clientWithCookies.execute),
			)

			expect(registerResponse.status).toBe(201)
			const user = yield* HttpClientResponse.schemaBodyJson(User.select)(registerResponse)

			// Verify session cookie was set
			const cookies = yield* Ref.get(cookiesRef)
			const sessionCookie = Cookies.get(cookies, 'session')
			expect(Option.isSome(sessionCookie)).toBe(true)

			// Now make an authenticated request (profile update)
			const updateResponse = yield* HttpClientRequest.patch(
				`${yield* baseUrl}/profile`,
			).pipe(
				HttpClientRequest.bodyJson({
					username: `authuser_${runId}_updated`,
					name: 'Test User',
					bio: 'This is a test user',
					avatar_url: null,
				}),
				Effect.flatMap(clientWithCookies.execute),
			)

			// The client with cookies should automatically include the session cookie
			expect(updateResponse.status).toBe(200)

			const updatedUser = yield* HttpClientResponse.schemaBodyJson(User.select)(
				updateResponse,
			)
			expect(updatedUser.id).toBe(user.id)
			expect(updatedUser.username).toBe(`authuser_${runId}_updated`)
			expect(updatedUser.name).toBe('Test User')
			expect(updatedUser.bio).toBe('This is a test user')
		}).pipe(Effect.provide(TestHttpClientLive)),
	)

	it.live('authenticated request fails without session cookie', () =>
		Effect.gen(function* () {
			const client = yield* HttpClient.HttpClient

			// Try to make authenticated request without session cookie
			const result = yield* HttpClientRequest.patch(`${yield* baseUrl}/profile`).pipe(
				HttpClientRequest.bodyJson({
					username: 'unauthorized_user',
					name: 'Should Fail',
				}),
				Effect.flatMap(client.pipe(HttpClient.filterStatusOk).execute),
				Effect.either,
			)

			// Should fail with 401 Unauthorized or other error
			expect(result._tag).toBe('Left')
		}).pipe(Effect.provide(TestHttpClientLive)),
	)

	it.live('can logout and invalidate session cookie', () =>
		Effect.gen(function* () {
			const client = yield* HttpClient.HttpClient
			const cookiesRef = yield* Ref.make(Cookies.empty)
			const clientWithCookies = client.pipe(HttpClient.withCookiesRef(cookiesRef))

			// Register user and get session
			yield* HttpClientRequest.post(`${yield* baseUrl}/auth/register`).pipe(
				HttpClientRequest.bodyJson({
					username: `logoutuser_${runId}`,
					password: 'password123',
					email: 'logout@example.com',
				}),
				Effect.flatMap(clientWithCookies.execute),
			)

			// Verify we have a session cookie
			const cookiesBeforeLogout = yield* Ref.get(cookiesRef)
			const sessionCookieBefore = Cookies.get(cookiesBeforeLogout, 'session')
			expect(Option.isSome(sessionCookieBefore)).toBe(true)

			// Logout
			const logoutResponse = yield* clientWithCookies.post(
				`${yield* baseUrl}/auth/logout`,
			)
			expect(logoutResponse.status).toBe(204)
			const clearHeaders = Cookies.toSetCookieHeaders(logoutResponse.cookies)
			expect(
				clearHeaders.some((h) => h.startsWith('session=') && h.includes('Max-Age=0')),
			).toBe(true)

			// Try to use the session cookie for an authenticated request after logout
			const result = yield* HttpClientRequest.patch(`${yield* baseUrl}/profile`).pipe(
				HttpClientRequest.bodyJson({
					username: 'should_fail',
				}),
				Effect.flatMap(clientWithCookies.pipe(HttpClient.filterStatusOk).execute),
				Effect.either,
			)

			// Should fail because session was invalidated
			expect(result._tag).toBe('Left')
		}).pipe(Effect.provide(TestHttpClientLive)),
	)

	it.live('registration with duplicate username fails', () =>
		Effect.gen(function* () {
			const client = yield* HttpClient.HttpClient

			const userData = {
				username: `duplicateuser_${runId}`,
				password: 'password123',
				email: 'duplicate@example.com',
			}

			// First registration should succeed
			const firstResponse = yield* HttpClientRequest.post(
				`${yield* baseUrl}/auth/register`,
			).pipe(HttpClientRequest.bodyJson(userData), Effect.flatMap(client.execute))
			expect(firstResponse.status).toBe(201)

			// Second registration with same username should fail
			const result = yield* HttpClientRequest.post(
				`${yield* baseUrl}/auth/register`,
			).pipe(
				HttpClientRequest.bodyJson({
					...userData,
					email: 'different@example.com', // Different email, same username
				}),
				Effect.flatMap(client.pipe(HttpClient.filterStatusOk).execute),
				Effect.either,
			)

			// Should fail with conflict or bad request
			expect(result._tag).toBe('Left')
		}).pipe(Effect.provide(TestHttpClientLive)),
	)

	it.live('registration with weak password fails', () =>
		Effect.gen(function* () {
			const client = yield* HttpClient.HttpClient

			const result = yield* HttpClientRequest.post(
				`${yield* baseUrl}/auth/register`,
			).pipe(
				HttpClientRequest.bodyJson({
					username: `weakpassuser_${runId}`,
					password: '123', // Too short
					email: 'weak@example.com',
				}),
				Effect.flatMap(client.pipe(HttpClient.filterStatusOk).execute),
				Effect.either,
			)

			// Should fail with validation error
			expect(result._tag).toBe('Left')
		}).pipe(Effect.provide(TestHttpClientLive)),
	)

	it.live('wrong password for existing user returns 401 InvalidCredentials', () =>
		Effect.gen(function* () {
			const client = yield* HttpClient.HttpClient
			const username = `badpass_${runId}`

			const registerResponse = yield* HttpClientRequest.post(
				`${yield* baseUrl}/auth/register`,
			).pipe(
				HttpClientRequest.bodyJson({
					username,
					password: 'password123',
					email: `badpass_${runId}@example.com`,
				}),
				Effect.flatMap(client.execute),
			)
			expect(registerResponse.status).toBe(201)

			const response = yield* HttpClientRequest.post(`${yield* baseUrl}/auth/login`).pipe(
				HttpClientRequest.bodyJson({
					id: username,
					password: 'wrong-password',
				}),
				Effect.flatMap(client.execute),
			)

			expect(response.status).toBe(401)
			const error = yield* HttpClientResponse.schemaBodyJson(InvalidCredentials)(response)
			expect(error._tag).toBe('InvalidCredentials')
			expect(error.message).toBe('invalid username or password')
		}).pipe(Effect.provide(TestHttpClientLive)),
	)

	it.live('unknown username returns the same 401 InvalidCredentials', () =>
		Effect.gen(function* () {
			const client = yield* HttpClient.HttpClient

			const response = yield* HttpClientRequest.post(`${yield* baseUrl}/auth/login`).pipe(
				HttpClientRequest.bodyJson({
					id: `nobody_${runId}`,
					password: 'password123',
				}),
				Effect.flatMap(client.execute),
			)

			expect(response.status).toBe(401)
			const error = yield* HttpClientResponse.schemaBodyJson(InvalidCredentials)(response)
			expect(error._tag).toBe('InvalidCredentials')
			expect(error.message).toBe('invalid username or password')
		}).pipe(Effect.provide(TestHttpClientLive)),
	)
})
