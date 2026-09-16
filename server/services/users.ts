import { Effect } from 'effect'
import type { Updateable } from 'kysely'

import type { AppPublicUsers } from '../../generated/db.js'
import {
	AccountLocked,
	WeakPassword,
	AuthenticationRequired,
	InvalidCredentials,
	InvalidToken,
	MissingData,
	AccountAlreadyLinked,
	UsernameTaken,
	InternalError,
	CannotDeleteWhileOwningOrganization,
} from '../../shared/errors.js'
import { User } from '../../shared/schemas.js'
import { PgRootDB, KyselyDB, sql } from '../db.js'
import { fromSql, mapDbErrors, mapUniqueViolation } from '../db.js'

type SelectableUser = typeof User.select.Type

export class Users extends Effect.Service<Users>()('User/Accounts', {
	accessors: true,
	dependencies: [PgRootDB.Live],
	effect: Effect.gen(function* () {
		const rootDb = yield* PgRootDB

		const queries = {
			login: ({ id, password }: { id: string; password: string }) =>
				rootDb
					.selectFrom((eb) =>
						eb
							.fn<typeof User.Type>('app_private.login', [
								sql`${id}::citext`,
								eb.val(password),
							])
							.as('u'),
					)
					.selectAll()
					// @ts-expect-error: Kysely doesn't seem to allow referencing tables directly
					.where((eb) => eb.not(eb(eb.ref('u'), 'is', null))),

			reallyCreateUser: (payload: {
				username: string
				password: string
				email?: string | null
				name?: string | null
				verified?: boolean | null
				avatarUrl?: string | null
			}) =>
				rootDb
					.selectFrom(
						sql<typeof User.Type>`
              app_private.really_create_user(
                username => ${payload.username}::citext,
                email => ${payload.email || null},
                email_is_verified => ${payload.verified},
                name => ${payload.name},
                avatar_url => ${payload.avatarUrl},
                password => ${payload.password}::text
              )`.as('u'),
					)
					.selectAll()
					// @ts-expect-error: Kysely doesn't seem to allow referencing tables directly
					.where((eb) => eb.not(eb(eb.ref('u'), 'is', null))),

			register: ({
				username,
				password,
				email,
			}: {
				username: string
				password: string
				email?: string | null
			}) =>
				queries.reallyCreateUser({
					username,
					email: email || null,
					name: username,
					verified: false,
					password,
					avatarUrl: null,
				}),

			forgotPassword: ({ email }: { email: string }) =>
				rootDb.selectNoFrom((eb) => [
					eb
						.fn<void>('app_public.forgot_password', [eb.val(email)])
						.as('forgot_password'),
				]),

			resetPassword: ({
				userId,
				token,
				password,
			}: {
				userId: string
				token: string
				password: string
			}) =>
				rootDb.selectNoFrom((eb) => [
					eb
						.fn<boolean>('app_private.reset_password', [
							sql`${userId}::uuid`,
							eb.val(token),
							eb.val(password),
						])
						.as('reset_password'),
				]),

			oauthLink: ({
				userId,
				serviceData,
				username,
				profile,
				tokens,
			}: {
				userId: string | null
				username: string
				serviceData: Record<string, unknown>
				profile: Record<string, unknown>
				tokens: Record<string, unknown>
			}) =>
				rootDb
					.selectFrom((eb) =>
						eb
							.fn<SelectableUser>('app_private.link_or_register_user', [
								sql`f_user_id => ${userId ?? null}`,
								sql`f_service => ${serviceData}`,
								sql`f_identifier => ${username}`,
								sql`f_profile => ${JSON.stringify(profile)}`,
								sql`f_auth_details => ${JSON.stringify(tokens)}`,
							])
							.as('u'),
					)
					.selectAll(),
		} as const

		return {
			queries,

			logout: Effect.fnUntraced(function* () {
				const db = yield* KyselyDB
				return yield* db
					.selectNoFrom((eb) => [eb.fn<void>('app_public.logout', []).as('logout')])
					.pipe(
						Effect.head,
						Effect.catchTag('NoSuchElementException', Effect.die),
						Effect.map((x) => x.logout),
						fromSql,
					)
			}),

			login: Effect.fn('db:user:login')(
				queries.login,
				Effect.head,
				// app_private.login returns no row for bad credentials (does not raise CREDS).
				Effect.catchTag('NoSuchElementException', () =>
					Effect.fail(
						new InvalidCredentials({ message: 'invalid username or password' }),
					),
				),
				Effect.mapError(
					mapDbErrors({
						CREDS: (msg) => new InvalidCredentials({ message: msg }),
						LOCKD: (msg) => new AccountLocked({ message: msg }),
					}),
				),
				fromSql,
			),

			register: Effect.fn('db:user:register')(
				queries.register,
				Effect.head,
				Effect.mapError(
					mapDbErrors({
						MDEML: (msg) => new MissingData({ message: msg, field: 'email' }),
						MDPWD: (msg) => new MissingData({ message: msg, field: 'password' }),
						WEAKP: (msg) =>
							new WeakPassword({
								message: msg,
								requirements: ['At least 8 characters'],
							}),
						TAKEN: (msg) => new AccountAlreadyLinked({ message: msg, service: 'oauth' }),
					}),
				),
				mapUniqueViolation(
					() => new UsernameTaken({ message: 'username already exists' }),
				),
				fromSql,
				Effect.mapError((error) =>
					error._tag === 'NoSuchElementException'
						? new InternalError({ message: 'Registration failed' })
						: error,
				),
			),

			updateProfile: Effect.fnUntraced(function* (
				patch: Pick<
					Updateable<AppPublicUsers>,
					'name' | 'avatar_url' | 'bio' | 'username'
				>,
			) {
				const db = yield* KyselyDB
				return yield* db
					.updateTable('app_public.users')
					.set(patch)
					.where('id', '=', (eb) => eb.fn('app_public.current_user_id', []))
					.returningAll()
					.pipe(
						Effect.head,
						// Empty RETURNING when current_user_id() is null — expected unauthenticated outcome.
						Effect.catchTag('NoSuchElementException', () =>
							Effect.fail(
								new AuthenticationRequired({
									message: 'You must log in to update your profile',
									action: 'update_profile',
								}),
							),
						),
						fromSql,
					)
			}),

			changePassword: Effect.fnUntraced(function* ({
				oldPassword,
				newPassword,
			}: {
				oldPassword: string
				newPassword: string
			}) {
				const db = yield* KyselyDB
				return yield* db
					.selectNoFrom((eb) => [
						eb
							.fn<boolean>('app_public.change_password', [
								eb.val(oldPassword),
								eb.val(newPassword),
							])
							.as('change_password'),
					])
					.pipe(
						Effect.head,
						Effect.mapError(
							mapDbErrors({
								LOGIN: (msg) =>
									new AuthenticationRequired({
										message: msg,
										action: 'change_password',
									}),
								CREDS: (msg) => new InvalidCredentials({ message: msg }),
								WEAKP: (msg) =>
									new WeakPassword({
										message: msg,
										requirements: ['At least 8 characters'],
									}),
							}),
						),
						Effect.mapError((error) =>
							error._tag === 'NoSuchElementException'
								? new InternalError({ message: 'Password change failed' })
								: error,
						),
						fromSql,
					)
			}),

			forgotPassword: Effect.fn('db:user:forgotPassword')(
				queries.forgotPassword,
				Effect.head,
				Effect.as(void 0 as void),
				fromSql,
				Effect.mapError((error) =>
					error._tag === 'NoSuchElementException'
						? new InternalError({ message: 'Password reset request failed' })
						: error,
				),
			),

			resetPassword: Effect.fn('db:user:resetPassword')(
				queries.resetPassword,
				Effect.head,
				// app_private.reset_password returns one row with NULL for bad/stale tokens.
				Effect.flatMap((row) =>
					row.reset_password === true
						? Effect.succeed(row)
						: Effect.fail(
								new InvalidToken({
									message: 'invalid or expired password reset token',
								}),
							),
				),
				fromSql,
				Effect.mapError((error) =>
					error._tag === 'NoSuchElementException'
						? new InternalError({ message: 'Password reset failed' })
						: error,
				),
			),

			oauthLink: Effect.fn('db:user:oauthLink')(
				queries.oauthLink,
				Effect.head,
				fromSql,
				Effect.mapError((error) =>
					error._tag === 'NoSuchElementException'
						? new InternalError({ message: 'OAuth link failed' })
						: error,
				),
			),

			oauthUnlink: Effect.fnUntraced(function* ({ id }: { id: string }) {
				const db = yield* KyselyDB
				return yield* db
					.deleteFrom('app_public.user_authentications')
					.where('id', '=', id)
					.pipe(
						Effect.head,
						Effect.map((res) => res.numDeletedRows > 0),
						fromSql,
						Effect.mapError((error) =>
							error._tag === 'NoSuchElementException'
								? new InternalError({ message: 'OAuth unlink failed' })
								: error,
						),
					)
			}),

			requestAccountDeletion: Effect.fnUntraced(function* () {
				const db = yield* KyselyDB
				return yield* db
					.selectFrom((eb) =>
						eb
							.fn<{
								request_account_deletion: boolean
							}>('app_public.request_account_deletion', [])
							.as('request_account_deletion'),
					)
					.selectAll()
					.pipe(
						Effect.head,
						fromSql,
						Effect.mapError((error) =>
							error._tag === 'NoSuchElementException'
								? new InternalError({ message: 'Account deletion request failed' })
								: error,
						),
					)
			}),

			confirmAccountDeletion: Effect.fnUntraced(function* ({ token }: { token: string }) {
				const db = yield* KyselyDB
				return yield* db
					.selectFrom((eb) =>
						eb
							.fn<{
								confirm_account_deletion: boolean
							}>('app_public.confirm_account_deletion', [eb.val(token)])
							.as('confirm_account_deletion'),
					)
					.selectAll()
					.pipe(
						Effect.head,
						Effect.mapError(
							mapDbErrors({
								OWNER: (msg) => new CannotDeleteWhileOwningOrganization({ message: msg }),
							}),
						),
						fromSql,
						Effect.mapError((error) =>
							error._tag === 'NoSuchElementException'
								? new InternalError({ message: 'Account deletion confirmation failed' })
								: error,
						),
					)
			}),
		} as const
	}),
}) {
	// static Test = makeTestLayer(UsersRepo)({});
	static Live = Users.Default
}
