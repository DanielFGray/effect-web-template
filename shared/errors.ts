import { Schema as S } from 'effect'

export class InternalError extends S.TaggedError<InternalError>()('InternalError', {
	message: S.String,
}) {}

export class AccountLocked extends S.TaggedError<AccountLocked>()('AccountLocked', {
	message: S.String,
}) {}

export class WeakPassword extends S.TaggedError<WeakPassword>()('WeakPassword', {
	message: S.String,
	requirements: S.optional(S.Array(S.String)),
}) {}

export class AuthenticationRequired extends S.TaggedError<AuthenticationRequired>()(
	'AuthenticationRequired',
	{ message: S.String, action: S.String },
) {}

export class InvalidCredentials extends S.TaggedError<InvalidCredentials>()(
	'InvalidCredentials',
	{ message: S.String },
) {}

export class InvalidToken extends S.TaggedError<InvalidToken>()('InvalidToken', {
	message: S.String,
}) {}

export class MissingData extends S.TaggedError<MissingData>()('MissingData', {
	message: S.String,
	field: S.Literal('email', 'password', 'username'),
}) {}

export class AccountAlreadyLinked extends S.TaggedError<AccountAlreadyLinked>()(
	'AccountAlreadyLinked',
	{ message: S.String, service: S.String },
) {}

export class SessionNotFound extends S.TaggedError<SessionNotFound>()('SessionNotFound', {
	message: S.String,
}) {}

export class UsernameTaken extends S.TaggedError<UsernameTaken>()('UsernameTaken', {
	message: S.String,
}) {}

export class EmailAlreadyTaken extends S.TaggedError<EmailAlreadyTaken>()(
	'EmailAlreadyTaken',
	{ message: S.String },
) {}

export class CannotDeleteLastEmail extends S.TaggedError<CannotDeleteLastEmail>()(
	'CannotDeleteLastEmail',
	{ message: S.String },
) {}

export class EmailNotOwned extends S.TaggedError<EmailNotOwned>()('EmailNotOwned', {
	message: S.String,
}) {}

export class EmailNotVerified extends S.TaggedError<EmailNotVerified>()(
	'EmailNotVerified',
	{ message: S.String },
) {}

export class AccessDenied extends S.TaggedError<AccessDenied>()('AccessDenied', {
	message: S.String,
}) {}

export class AlreadyMember extends S.TaggedError<AlreadyMember>()('AlreadyMember', {
	message: S.String,
}) {}

export class NotFound extends S.TaggedError<NotFound>()('NotFound', {
	message: S.String,
}) {}

export class CannotDeleteWhileOwningOrganization extends S.TaggedError<CannotDeleteWhileOwningOrganization>()(
	'CannotDeleteWhileOwningOrganization',
	{ message: S.String },
) {}
