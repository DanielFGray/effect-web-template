import { Effect } from 'effect'
import type { Selectable } from 'kysely'

import type { AppPublicUserEmails } from '../../generated/db.js'
import {
	EmailAlreadyTaken,
	CannotDeleteLastEmail,
	EmailNotOwned,
	EmailNotVerified,
	InternalError,
} from '../../shared/errors.js'
import { sql, KyselyDB, fromSql, mapDbErrors } from '../db.js'

export class Email extends Effect.Service<Email>()('User/Email', {
	accessors: true,
	sync: () => ({
		listMine: Effect.fnUntraced(function* () {
			const db = yield* KyselyDB
			return yield* db
				.selectFrom('app_public.user_emails')
				.selectAll()
				.orderBy('created_at', 'asc')
				.pipe(fromSql)
		}),

		addEmail: Effect.fnUntraced(function* ({ email }: { email: string }) {
			const db = yield* KyselyDB
			return yield* db
				.insertInto('app_public.user_emails')
				.values({ email })
				.returningAll()
				.pipe(
					Effect.head,
					Effect.mapError(
						mapDbErrors({
							EMTKN: (msg) => new EmailAlreadyTaken({ message: msg }),
						}),
					),
					Effect.mapError((error) =>
						error._tag === 'NoSuchElementException'
							? new InternalError({ message: 'Failed to add email' })
							: error,
					),
					fromSql,
				)
		}),

		removeEmail: Effect.fnUntraced(function* ({ emailId }: { emailId: string }) {
			const db = yield* KyselyDB
			return yield* db
				.deleteFrom('app_public.user_emails')
				.where('id', '=', emailId)
				.pipe(
					Effect.head,
					Effect.map((first) => first.numDeletedRows > 0),
					Effect.mapError(
						mapDbErrors({
							CDLEA: (msg) => new CannotDeleteLastEmail({ message: msg }),
						}),
					),
					Effect.mapError((error) =>
						error._tag === 'NoSuchElementException'
							? new InternalError({ message: 'Failed to remove email' })
							: error,
					),
					fromSql,
				)
		}),

		verifyEmail: Effect.fnUntraced(function* ({
			emailId,
			token,
		}: {
			emailId: string
			token: string
		}) {
			const db = yield* KyselyDB
			return yield* db
				.selectFrom((eb) =>
					eb
						.fn<{
							verify_email: boolean | null
						}>('app_public.verify_email', [sql`${emailId}::uuid`, eb.val(token)])
						.as('verify_email'),
				)
				.selectAll()
				.pipe(
					Effect.head,
					Effect.map((first) => Boolean(first.verify_email)),
					fromSql,
					Effect.mapError((error) =>
						error._tag === 'NoSuchElementException'
							? new InternalError({ message: 'Email verification failed' })
							: error,
					),
				)
		}),

		resendVerificationEmail: Effect.fnUntraced(function* ({
			emailId,
		}: {
			emailId: string
		}) {
			const db = yield* KyselyDB
			return yield* db
				.selectFrom((eb) =>
					eb
						.fn<{
							resend_email_verification_code: boolean
						}>('app_public.resend_email_verification_code', [sql`${emailId}::uuid`])
						.as('result'),
				)
				.selectAll()
				.pipe(
					Effect.head,
					Effect.map((first) => first.resend_email_verification_code),
					fromSql,
					Effect.mapError((error) =>
						error._tag === 'NoSuchElementException'
							? new InternalError({ message: 'Failed to resend verification' })
							: error,
					),
				)
		}),

		makeEmailPrimary: Effect.fnUntraced(function* ({ emailId }: { emailId: string }) {
			const db = yield* KyselyDB
			return yield* db
				.selectFrom((eb) =>
					eb
						.fn<Selectable<AppPublicUserEmails>>('app_public.make_email_primary', [
							sql`${emailId}::uuid`,
						])
						.as('result'),
				)
				.selectAll()
				.pipe(
					Effect.head,
					Effect.mapError(
						mapDbErrors({
							DNIED: (msg) => new EmailNotOwned({ message: msg }),
							VRFY1: (msg) => new EmailNotVerified({ message: msg }),
						}),
					),
					Effect.mapError((error) =>
						error._tag === 'NoSuchElementException'
							? new InternalError({ message: 'Failed to make email primary' })
							: error,
					),
					fromSql,
				)
		}),
	}),
}) {
	// static Test = makeTestLayer(EmailRepo)({});
	static Live = Email.Default
}
