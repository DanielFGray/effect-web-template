import { HttpApiBuilder } from '@effect/platform'
import { Effect } from 'effect'

import { Contract } from '../../shared/httpApi.js'
import { SessionCookie } from '../../shared/sessionCookie.js'
import { withAuthContext } from '../db.js'
import { CookieSigner } from '../services/cookie-signer.js'
import { Sessions } from '../services/session.js'
import { Users } from '../services/users.js'

const whoami = Effect.gen(function* () {
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

export const UsersApiGroupLive = HttpApiBuilder.group(Contract, 'users', (handlers) =>
	handlers
		.handle('me', () => whoami)
		.handle(
			'register',
			Effect.fnUntraced(function* ({ payload }) {
				const sessionCookie = yield* SessionCookie
				const user = yield* Users.register(payload)
				const session = yield* Sessions.createSession(user.id)
				yield* sessionCookie.write(session.uuid)
				return user
			}),
		)
		.handle(
			'login',
			Effect.fnUntraced(function* ({ payload }) {
				const sessionCookie = yield* SessionCookie
				const user = yield* Users.login(payload)
				const session = yield* Sessions.createSession(user.id)
				yield* sessionCookie.write(session.uuid)
				return user
			}),
		)
		.handle('resetPassword', ({ payload }) => Users.resetPassword(payload))
		.handle(
			'logout',
			Effect.fnUntraced(function* () {
				const sessionCookie = yield* SessionCookie
				yield* Users.logout().pipe(withAuthContext)
				yield* sessionCookie.clear
			}),
		)
		.handle('requestDeletion', () => Users.requestAccountDeletion().pipe(withAuthContext))
		.handle('confirmDeletion', ({ payload }) =>
			Users.confirmAccountDeletion(payload).pipe(withAuthContext),
		)
		.handle('forgotPassword', ({ payload }) => Users.forgotPassword(payload))
		.handle('changePassword', ({ payload }) =>
			Users.changePassword(payload).pipe(withAuthContext),
		)
		.handle('updateProfile', ({ payload }) =>
			Users.updateProfile(payload).pipe(withAuthContext),
		)
		.handle('oauthLink', ({ payload }) => Users.oauthLink(payload))
		.handle('oauthUnlink', ({ path: { id } }) =>
			Users.oauthUnlink({ id }).pipe(withAuthContext),
		),
)
