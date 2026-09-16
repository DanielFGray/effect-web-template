import { HttpApiBuilder } from '@effect/platform'

import { Contract } from '../../shared/httpApi.js'
import {
	currentUser,
	loginAndCreateSession,
	logoutAndClearSession,
	registerAndCreateSession,
} from '../auth.js'
import { withAuthContext } from '../db.js'
import { Users } from '../services/users.js'

export const UsersApiGroupLive = HttpApiBuilder.group(Contract, 'users', (handlers) =>
	handlers
		.handle('me', () => currentUser)
		.handle('register', ({ payload }) => registerAndCreateSession(payload))
		.handle('login', ({ payload }) => loginAndCreateSession(payload))
		.handle('resetPassword', ({ payload }) => Users.resetPassword(payload))
		.handle('logout', () => logoutAndClearSession)
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
