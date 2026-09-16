import { Effect } from 'effect'
import type { Selectable } from 'kysely'
import { jsonBuildObject } from 'kysely/helpers/postgres'

import type { AppPublicOrganizations } from '../../generated/db.js'
import {
	AccessDenied,
	AlreadyMember,
	AuthenticationRequired,
	EmailNotVerified,
	InternalError,
	NotFound,
} from '../../shared/errors.js'
import { Organization } from '../../shared/schemas.js'
import { catchSql, KyselyDB, mapDbErrors, sql } from '../db.js'

type OrgRow = Selectable<AppPublicOrganizations>

export class Organizations extends Effect.Service<Organizations>()(
	'Organizations/OrgRepo',
	{
		accessors: true,
		sync: () => ({
			create: Effect.fnUntraced(function* ({
				slug,
				name,
			}: {
				slug: string
				name: string
			}) {
				const db = yield* KyselyDB
				return yield* db
					.selectFrom((eb) =>
						eb
							.fn<OrgRow>('app_public.create_organization', [eb.val(slug), eb.val(name)])
							.as('o'),
					)
					.selectAll()
					.pipe(
						Effect.head,
						Effect.mapError(
							mapDbErrors({
								LOGIN: (msg) =>
									new AuthenticationRequired({
										message: msg,
										action: 'organizations',
									}),
							}),
						),
						catchSql,
						Effect.mapError((error) =>
							error._tag === 'NoSuchElementException'
								? new InternalError({ message: 'Failed to create organization' })
								: error,
						),
					)
			}),

			listMine: Effect.fnUntraced(function* () {
				const db = yield* KyselyDB
				return yield* db
					.selectFrom('app_public.organizations')
					.selectAll()
					.orderBy('created_at', 'asc')
					.pipe(catchSql)
			}),

			byId: Effect.fnUntraced(function* (orgId: (typeof Organization.select.Type)['id']) {
				const db = yield* KyselyDB
				return yield* db
					.selectFrom('app_public.organizations')
					.selectAll()
					.where('id', '=', orgId)
					.pipe(
						Effect.head,
						Effect.catchTag('NoSuchElementException', () => Effect.succeed(null)),
						catchSql,
					)
			}),

			update: Effect.fnUntraced(function* (
				orgId: (typeof Organization.select.Type)['id'],
				patch: { slug?: string; name?: string },
			) {
				const db = yield* KyselyDB
				return yield* db
					.updateTable('app_public.organizations')
					.set(patch)
					.where('id', '=', orgId)
					.returningAll()
					.pipe(
						Effect.head,
						Effect.catchTag('NoSuchElementException', () =>
							Effect.fail(
								new AccessDenied({
									message: "You're not the owner of this organization",
								}),
							),
						),
						catchSql,
					)
			}),

			delete: Effect.fnUntraced(function* (
				orgId: (typeof Organization.select.Type)['id'],
			) {
				const db = yield* KyselyDB
				return yield* db
					.selectNoFrom((eb) => [
						eb.fn<void>('app_public.delete_organization', [sql`${orgId}::uuid`]).as('x'),
					])
					.pipe(
						Effect.head,
						Effect.catchTag('NoSuchElementException', Effect.die),
						Effect.asVoid,
						catchSql,
					)
			}),

			listMembers: Effect.fnUntraced(function* (
				orgId: (typeof Organization.select.Type)['id'],
			) {
				const db = yield* KyselyDB
				return yield* db
					.selectFrom('app_public.organization_memberships as m')
					.leftJoin('app_public.users as u', 'm.user_id', 'u.id')
					.select((eb) => [
						'm.id',
						'm.organization_id',
						'm.user_id',
						'm.is_owner',
						'm.is_billing_contact',
						'm.created_at',
						jsonBuildObject({
							username: eb.ref('u.username'),
							avatar_url: eb.ref('u.avatar_url'),
						}).as('user'),
					])
					.where('m.organization_id', '=', orgId)
					.orderBy('m.created_at', 'asc')
					.pipe(catchSql)
			}),

			// Never selectAll() — `code` is the invite secret and must not leak to members.
			listInvitations: Effect.fnUntraced(function* (
				orgId: (typeof Organization.select.Type)['id'],
			) {
				const db = yield* KyselyDB
				return yield* db
					.selectFrom('app_public.organization_invitations')
					.select(['id', 'organization_id', 'user_id', 'email'])
					.where('organization_id', '=', orgId)
					.pipe(catchSql)
			}),

			removeMember: Effect.fnUntraced(function* (
				orgId: (typeof Organization.select.Type)['id'],
				userId: string,
			) {
				const db = yield* KyselyDB
				return yield* db
					.selectNoFrom((eb) => [
						eb
							.fn<void>('app_public.remove_from_organization', [
								sql`${orgId}::uuid`,
								sql`${userId}::uuid`,
							])
							.as('x'),
					])
					.pipe(
						Effect.head,
						Effect.catchTag('NoSuchElementException', Effect.die),
						Effect.asVoid,
						catchSql,
					)
			}),

			invite: Effect.fnUntraced(function* (
				orgId: (typeof Organization.select.Type)['id'],
				{ username, email }: { username: string | null; email: string | null },
			) {
				const db = yield* KyselyDB
				return yield* db
					.selectNoFrom((eb) => [
						eb
							.fn<void>('app_public.invite_to_organization', [
								sql`${orgId}::uuid`,
								username === null ? sql`null::citext` : sql`${username}::citext`,
								email === null ? sql`null::citext` : sql`${email}::citext`,
							])
							.as('x'),
					])
					.pipe(
						Effect.head,
						Effect.mapError(
							mapDbErrors({
								LOGIN: (msg) =>
									new AuthenticationRequired({
										message: msg,
										action: 'organizations',
									}),
								DNIED: (msg) => new AccessDenied({ message: msg }),
								ISMBR: (msg) => new AlreadyMember({ message: msg }),
								VRFY2: (msg) => new EmailNotVerified({ message: msg }),
								NTFND: (msg) => new NotFound({ message: msg }),
							}),
						),
						Effect.asVoid,
						catchSql,
						Effect.mapError((error) =>
							error._tag === 'NoSuchElementException'
								? new InternalError({ message: 'Failed to invite user' })
								: error,
						),
					)
			}),

			forInvitation: Effect.fnUntraced(function* (
				invitationId: string,
				code: string | undefined,
			) {
				const db = yield* KyselyDB
				return yield* db
					.selectFrom((eb) =>
						eb
							.fn<OrgRow>('app_public.organization_for_invitation', [
								sql`${invitationId}::uuid`,
								code === undefined ? sql`null::text` : eb.val(code),
							])
							.as('o'),
					)
					.selectAll()
					.pipe(
						Effect.head,
						Effect.mapError(
							mapDbErrors({
								LOGIN: (msg) =>
									new AuthenticationRequired({
										message: msg,
										action: 'organizations',
									}),
								NTFND: (msg) => new NotFound({ message: msg }),
								DNIED: (msg) => new AccessDenied({ message: msg }),
							}),
						),
						catchSql,
						Effect.mapError((error) =>
							error._tag === 'NoSuchElementException'
								? new InternalError({
										message: 'Failed to load invitation organization',
									})
								: error,
						),
					)
			}),

			acceptInvitation: Effect.fnUntraced(function* (
				invitationId: string,
				code: string | null,
			) {
				const db = yield* KyselyDB
				return yield* db
					.selectNoFrom((eb) => [
						eb
							.fn<void>('app_public.accept_invitation_to_organization', [
								sql`${invitationId}::uuid`,
								code === null ? sql`null::text` : eb.val(code),
							])
							.as('x'),
					])
					.pipe(
						Effect.head,
						Effect.catchTag('NoSuchElementException', Effect.die),
						Effect.asVoid,
						catchSql,
					)
			}),

			// NULL composite from the SQL fn still yields one all-null row — filter it out.
			transferOwnership: Effect.fnUntraced(function* (
				orgId: (typeof Organization.select.Type)['id'],
				userId: string,
			) {
				const db = yield* KyselyDB
				return yield* db
					.selectFrom((eb) =>
						eb
							.fn<OrgRow>('app_public.transfer_organization_ownership', [
								sql`${orgId}::uuid`,
								sql`${userId}::uuid`,
							])
							.as('o'),
					)
					.selectAll()
					// @ts-expect-error: Kysely doesn't seem to allow referencing tables directly
					.where((eb) => eb.not(eb(eb.ref('o'), 'is', null)))
					.pipe(
						Effect.head,
						Effect.catchTag('NoSuchElementException', () => Effect.succeed(null)),
						catchSql,
					)
			}),

			// NULL composite from the SQL fn still yields one all-null row — filter it out.
			transferBillingContact: Effect.fnUntraced(function* (
				orgId: (typeof Organization.select.Type)['id'],
				userId: string,
			) {
				const db = yield* KyselyDB
				return yield* db
					.selectFrom((eb) =>
						eb
							.fn<OrgRow>('app_public.transfer_organization_billing_contact', [
								sql`${orgId}::uuid`,
								sql`${userId}::uuid`,
							])
							.as('o'),
					)
					.selectAll()
					// @ts-expect-error: Kysely doesn't seem to allow referencing tables directly
					.where((eb) => eb.not(eb(eb.ref('o'), 'is', null)))
					.pipe(
						Effect.head,
						Effect.catchTag('NoSuchElementException', () => Effect.succeed(null)),
						catchSql,
					)
			}),
		}),
	},
) {}
