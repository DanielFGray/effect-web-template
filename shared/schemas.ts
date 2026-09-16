import { Model } from '@effect/sql'
import { Schema as S } from 'effect'

export class User extends Model.Class<User>('User')({
	id: Model.Generated(S.UUID),
	username: S.NonEmptyTrimmedString,
	name: S.NullOr(S.NonEmptyTrimmedString),
	avatar_url: S.NullOr(S.NonEmptyTrimmedString),
	bio: S.NullOr(S.NonEmptyTrimmedString),
	role: S.Literal('user', 'admin'),
	is_verified: S.Boolean,
	created_at: Model.Generated(S.Date),
	updated_at: Model.Generated(S.Date),
}) {}

export class Session extends Model.Class<Session>('Session')({
	uuid: S.UUID,
	user_id: S.UUID,
	created_at: Model.Generated(S.Date),
	last_active: Model.Generated(S.Date),
}) {}

export const AuthenticatedUser = S.Struct({
	session_id: S.UUID,
	user_id: S.UUID,
	username: S.NonEmptyTrimmedString,
	name: S.NullOr(S.NonEmptyTrimmedString),
	avatar_url: S.NullOr(S.NonEmptyTrimmedString),
	role: S.Literal('user', 'admin'),
	is_verified: S.Boolean,
})

export class Post extends Model.Class<Post>('Post')({
	id: Model.Generated(S.BigInt),
	user_id: Model.Generated(S.NullOr(S.UUID)),
	body: S.NonEmptyTrimmedString,
	privacy: S.Literal('public', 'secret', 'private'),
	created_at: Model.Generated(S.Date),
	updated_at: Model.Generated(S.Date),
}) {}

export const PostWithDetails = S.Struct({
	...Post.select.fields,
	stars: S.Union(S.BigInt, S.Number, S.String),
	user: S.Struct({
		username: S.NullOr(S.String),
		avatar_url: S.NullOr(S.String),
	}),
}).pipe(S.omit('user_id'))

export class UserEmail extends Model.Class<UserEmail>('UserEmail')({
	id: Model.Generated(S.UUID),
	user_id: S.UUID,
	email: S.String,
	is_verified: S.Boolean,
	is_primary: S.Boolean,
	created_at: Model.Generated(S.Date),
	updated_at: Model.Generated(S.Date),
}) {}

export class Organization extends Model.Class<Organization>('Organization')({
	id: Model.Generated(S.UUID),
	slug: S.NonEmptyTrimmedString,
	name: S.NonEmptyTrimmedString,
	created_at: Model.Generated(S.Date),
}) {}

export class OrganizationMembership extends Model.Class<OrganizationMembership>(
	'OrganizationMembership',
)({
	id: Model.Generated(S.UUID),
	organization_id: S.UUID,
	user_id: S.UUID,
	is_owner: S.Boolean,
	is_billing_contact: S.Boolean,
	created_at: Model.Generated(S.Date),
}) {}

export const OrganizationMember = S.Struct({
	...OrganizationMembership.select.fields,
	user: S.Struct({
		username: S.NullOr(S.String),
		avatar_url: S.NullOr(S.String),
	}),
})

export class OrganizationInvitation extends Model.Class<OrganizationInvitation>(
	'OrganizationInvitation',
)({
	id: Model.Generated(S.UUID),
	organization_id: S.UUID,
	user_id: S.NullOr(S.UUID),
	email: S.NullOr(S.String),
}) {}
