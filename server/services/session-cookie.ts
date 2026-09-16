import { Cookies, HttpApp, HttpServerResponse } from '@effect/platform'
import { HttpServerRequest } from '@effect/platform/HttpServerRequest'
import { getRequestHeader, setResponseHeader } from '@tanstack/react-start/server'
import { Config, Effect, Layer } from 'effect'

import { SessionCookie, SessionCookieHttp } from '../../shared/sessionCookie.js'
import { CookieSigner } from './cookie-signer.js'

const SESSION_COOKIE_NAME = 'session'

/**
 * Sole statement of the session cookie's browser attributes. Write and clear
 * both derive from this so HTTP and Start adapters cannot drift.
 */
const sessionCookiePolicy = Effect.gen(function* () {
	return {
		httpOnly: true as const,
		secure: (yield* Config.string('NODE_ENV')) === 'production',
		sameSite: 'lax' as const,
		path: '/',
		maxAge: '30 days' as const,
	}
})

/**
 * Per-request SessionCookie from HttpServerRequest; write/clear attach cookies
 * via HttpApp.appendPreResponseHandler (same path as securitySetCookie).
 */
export const SessionCookieHttpLive = Layer.effect(
	SessionCookieHttp,
	Effect.gen(function* () {
		const signer = yield* CookieSigner
		const policy = yield* sessionCookiePolicy
		const { maxAge: _maxAge, ...expireOptions } = policy

		return Effect.gen(function* () {
			const req = yield* HttpServerRequest
			const signed = req.cookies[SESSION_COOKIE_NAME] ?? null

			return SessionCookie.of({
				read: Effect.succeed(signed),
				write: (sessionId) =>
					HttpApp.appendPreResponseHandler((_request, response) =>
						HttpServerResponse.setCookie(
							response,
							SESSION_COOKIE_NAME,
							signer.sign(sessionId),
							policy,
						).pipe(Effect.orDie),
					),
				clear: HttpApp.appendPreResponseHandler((_request, response) =>
					Effect.succeed(
						HttpServerResponse.expireCookie(response, SESSION_COOKIE_NAME, expireOptions),
					),
				),
			})
		})
	}),
)

/**
 * SessionCookie for TanStack Start server functions / route handlers. Reads the
 * incoming Cookie header and writes Set-Cookie onto the Start response using
 * the same policy as the HTTP adapter.
 */
export const SessionCookieStartLive = Layer.effect(
	SessionCookie,
	Effect.gen(function* () {
		const signer = yield* CookieSigner
		const policy = yield* sessionCookiePolicy
		const { maxAge: _maxAge, ...expireOptions } = policy
		const header = getRequestHeader('cookie')
		const signed = header
			? (Cookies.parseHeader(header)[SESSION_COOKIE_NAME] ?? null)
			: null

		return SessionCookie.of({
			read: Effect.succeed(signed),
			write: (sessionId) =>
				Effect.sync(() => {
					setResponseHeader(
						'set-cookie',
						Cookies.toSetCookieHeaders(
							Cookies.setCookie(
								Cookies.empty,
								Cookies.unsafeMakeCookie(
									SESSION_COOKIE_NAME,
									signer.sign(sessionId),
									policy,
								),
							),
						),
					)
				}),
			clear: Effect.sync(() => {
				setResponseHeader(
					'set-cookie',
					Cookies.toSetCookieHeaders(
						Cookies.setCookie(
							Cookies.empty,
							Cookies.unsafeMakeCookie(SESSION_COOKIE_NAME, '', {
								...expireOptions,
								maxAge: 0,
							}),
						),
					),
				)
			}),
		})
	}),
)
