import { Effect } from 'effect'

import { SessionNotFound, InternalError } from '../../shared/errors.js'
import { PgRootDB, sql } from '../db.js'
import { catchSql } from '../db.js'

export class Sessions extends Effect.Service<Sessions>()('Auth/SessionService', {
	accessors: true,
	effect: Effect.gen(function* () {
		const db = yield* PgRootDB

		const queries = {
			validateSession: (sessionId: string) =>
				db
					.selectFrom('app_private.sessions as s')
					.innerJoin('app_public.users as u', 'u.id', 's.user_id')
					.select([
						's.uuid as session_id',
						'u.id as user_id',
						'u.username',
						'u.name',
						'u.avatar_url',
						'u.role',
						'u.is_verified',
					])
					.where('s.uuid', '=', sessionId)
					.where(sql<boolean>`s.last_active > now() - '30 days'::interval`),

			createSession: (userId: string) =>
				db
					.insertInto('app_private.sessions')
					.values({ user_id: userId })
					.returning(['uuid', 'user_id', 'created_at', 'last_active']),

			getUserSessions: (userId: string) =>
				db
					.selectFrom('app_private.sessions')
					.selectAll()
					.where('user_id', '=', userId)
					.where('last_active', '>', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000))
					.orderBy('last_active', 'desc'),

			deleteSession: (sessionId: string) =>
				db.deleteFrom('app_private.sessions').where('uuid', '=', sessionId),

			deleteAllUserSessions: (userId: string) =>
				db.deleteFrom('app_private.sessions').where('user_id', '=', userId),
		}

		return {
			queries,

			validateSession: Effect.fn('db:session:validate')(
				queries.validateSession,
				Effect.head,
				Effect.mapError((error) =>
					error._tag === 'NoSuchElementException'
						? new SessionNotFound({
								message: 'Session not found or expired',
							})
						: error,
				),
				catchSql,
			),

			getUserSessions: Effect.fn('db:session:getUserSessions')(
				queries.getUserSessions,
				catchSql,
			),

			createSession: Effect.fn('db:session:insert')(
				queries.createSession,
				Effect.head,
				catchSql,
				Effect.mapError((error) =>
					error._tag === 'NoSuchElementException'
						? new InternalError({ message: 'Failed to create session' })
						: error,
				),
			),

			deleteSession: Effect.fn('db:session:delete')(
				queries.deleteSession,
				Effect.head,
				Effect.map((first) => first.numDeletedRows > 0),
				catchSql,
				Effect.mapError((error) =>
					error._tag === 'NoSuchElementException'
						? new InternalError({ message: 'Failed to delete session' })
						: error,
				),
			),

			deleteAllUserSessions: Effect.fn('db:session:deleteAllUserSessions')(
				queries.deleteAllUserSessions,
				Effect.head,
				Effect.map((first) => first.numDeletedRows),
				catchSql,
				Effect.mapError((error) =>
					error._tag === 'NoSuchElementException'
						? new InternalError({ message: 'Failed to delete sessions' })
						: error,
				),
			),
		} as const
	}),
}) {
	static Live = Sessions.Default

	static Test = Effect.succeed({
		validateSession: () =>
			Effect.fail(new SessionNotFound({ message: 'Session not found or expired' })),
		createSession: () =>
			Effect.succeed({
				uuid: 'test-session',
				user_id: 'test-user',
				created_at: new Date(),
				last_active: new Date(),
			}),
		deleteSession: () => Effect.succeed(true),
		getUserSessions: () => Effect.succeed([]),
		deleteAllUserSessions: () => Effect.succeed(0),
	} as const)
}
