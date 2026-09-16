import { Effect } from 'effect'

import { SessionCookie } from '../shared/sessionCookie.js'
import { withAuthContext } from './db.js'
import { CookieSigner } from './services/cookie-signer.js'
import { Sessions } from './services/session.js'
import { Users } from './services/users.js'

/** Current user from the session cookie, or null when absent/invalid. */
export const currentUser = Effect.gen(function* () {
	const sessionCookie = yield* SessionCookie
	const signedSessionCookie = yield* sessionCookie.read
	if (!signedSessionCookie) return null

	const sessionId = yield* CookieSigner.verify(signedSessionCookie).pipe(
		Effect.catchTag('InvalidCookieSignature', () => Effect.succeed(null)),
	)
	if (!sessionId) return null

	return yield* Sessions.validateSession(sessionId).pipe(
		Effect.catchTag('SessionNotFound', () => Effect.succeed(null)),
	)
})

/** Login, create a session, and write the session cookie — shared by HTTP and Start. */
export const loginAndCreateSession = (payload: {
	readonly id: string
	readonly password: string
}) =>
	Effect.gen(function* () {
		const sessionCookie = yield* SessionCookie
		const user = yield* Users.login(payload)
		const session = yield* Sessions.createSession(user.id)
		yield* sessionCookie.write(session.uuid)
		return user
	})

/** Register, create a session, and write the session cookie — shared by HTTP and Start. */
export const registerAndCreateSession = (payload: {
	readonly username: string
	readonly password: string
	readonly email?: string | null
}) =>
	Effect.gen(function* () {
		const sessionCookie = yield* SessionCookie
		const user = yield* Users.register(payload)
		const session = yield* Sessions.createSession(user.id)
		yield* sessionCookie.write(session.uuid)
		return user
	})

/** Logout under auth context and clear the session cookie — shared by HTTP and Start. */
export const logoutAndClearSession = Effect.gen(function* () {
	const sessionCookie = yield* SessionCookie
	yield* Users.logout().pipe(withAuthContext)
	yield* sessionCookie.clear
})
