import { HttpApi, HttpApiEndpoint, HttpApiGroup, HttpApiSchema } from '@effect/platform'
import { Schema as S } from 'effect'

import {
	InternalError,
	InvalidCredentials,
	AccountLocked,
	WeakPassword,
	MissingData,
	AccountAlreadyLinked,
	UsernameTaken,
	AuthenticationRequired,
	EmailAlreadyTaken,
	EmailNotOwned,
	EmailNotVerified,
	CannotDeleteLastEmail,
	AccessDenied,
	AlreadyMember,
	NotFound,
	CannotDeleteWhileOwningOrganization,
} from './errors.js'
import { NullableEmail } from './fields.js'
import {
	AddEmailPayload,
	ChangePasswordPayload,
	ForgotPasswordPayload,
	LoginPayload,
	RegisterPayload,
	ResetPasswordPayload,
	UpdateProfilePayload,
} from './payloads.js'
import {
	User,
	Post,
	PostWithDetails,
	UserEmail,
	AuthenticatedUser,
	Organization,
	OrganizationMember,
	OrganizationInvitation,
} from './schemas.js'
import { SessionCookieHttp } from './sessionCookie.js'

const idParam = HttpApiSchema.param('id', S.BigInt)
const uuidParam = HttpApiSchema.param('id', S.UUID)
const orgIdParam = HttpApiSchema.param('orgId', S.UUID)
const memberUserIdParam = HttpApiSchema.param('userId', S.UUID)
const invitationIdParam = HttpApiSchema.param('invitationId', S.UUID)

const PostsGroup = HttpApiGroup.make('posts')
	.add(
		HttpApiEndpoint.get('list', '/posts')
			.setUrlParams(
				S.partial(
					S.Struct({
						username: S.NonEmptyTrimmedString,
						sort: S.Union(
							S.Literal('created_at'),
							S.Literal('updated_at'),
							S.Literal('stars'),
						),
					}),
				),
			)
			.addSuccess(S.Array(PostWithDetails)),
	)
	.add(
		HttpApiEndpoint.get('getById')`/posts/${idParam}`.addSuccess(
			S.NullOr(PostWithDetails),
		),
	)
	.add(
		HttpApiEndpoint.post('create', '/posts')
			.setPayload(Post.insert)
			.addSuccess(Post.select.pick('id'), { status: 201 }),
	)

const UsersGroup = HttpApiGroup.make('users')
	.add(HttpApiEndpoint.get('me', '/auth/me').addSuccess(S.NullOr(AuthenticatedUser)))
	.add(
		HttpApiEndpoint.post('register', '/auth/register')
			.setPayload(RegisterPayload)
			.addSuccess(User.select, { status: 201 })
			.addError(MissingData, { status: 400 })
			.addError(WeakPassword, { status: 400 })
			.addError(AccountAlreadyLinked, { status: 409 })
			.addError(UsernameTaken, { status: 409 }),
	)
	.add(
		HttpApiEndpoint.post('login', '/auth/login')
			.setPayload(LoginPayload)
			.addSuccess(User.select)
			.addError(InvalidCredentials, { status: 401 })
			.addError(AccountLocked, { status: 423 }),
	)
	.add(HttpApiEndpoint.post('logout', '/auth/logout').addSuccess(S.Void))
	.add(
		HttpApiEndpoint.post('requestDeletion', '/auth/request-deletion').addSuccess(
			S.Struct({ request_account_deletion: S.Boolean }),
		),
	)
	.add(
		HttpApiEndpoint.post('confirmDeletion', '/auth/confirm-deletion')
			.setPayload(S.Struct({ token: S.NonEmptyTrimmedString }))
			.addSuccess(S.Struct({ confirm_account_deletion: S.Boolean }))
			.addError(CannotDeleteWhileOwningOrganization, { status: 409 }),
	)
	.add(
		HttpApiEndpoint.post('forgotPassword', '/auth/forgot-password')
			.setPayload(ForgotPasswordPayload)
			.addSuccess(S.Void),
	)
	.add(
		HttpApiEndpoint.post('resetPassword', '/auth/reset-password')
			.setPayload(ResetPasswordPayload)
			.addSuccess(S.Struct({ reset_password: S.Boolean })),
	)
	.add(
		HttpApiEndpoint.post('changePassword', '/auth/change-password')
			.setPayload(ChangePasswordPayload)
			.addSuccess(S.Struct({ change_password: S.Boolean }))
			.addError(AuthenticationRequired, { status: 401 })
			.addError(InvalidCredentials, { status: 401 })
			.addError(WeakPassword, { status: 400 }),
	)
	.add(
		HttpApiEndpoint.patch('updateProfile', '/profile')
			.setPayload(UpdateProfilePayload)
			.addSuccess(User.select),
	)
	.add(
		HttpApiEndpoint.post('oauthLink')`/auth/${HttpApiSchema.param('provider', S.String)}`
			.setPayload(
				S.Struct({
					userId: S.NullOr(S.String),
					username: S.String,
					serviceData: S.Record({ key: S.String, value: S.Unknown }),
					profile: S.Record({ key: S.String, value: S.Unknown }),
					tokens: S.Record({ key: S.String, value: S.Unknown }),
				}),
			)
			.addSuccess(User.select),
	)
	.add(HttpApiEndpoint.del('oauthUnlink')`/oauth/${uuidParam}`.addSuccess(S.Boolean))

const EmailGroup = HttpApiGroup.make('email')
	.add(HttpApiEndpoint.get('list', '/emails').addSuccess(S.Array(UserEmail.select)))
	.add(
		HttpApiEndpoint.post('addEmail', '/emails')
			.setPayload(AddEmailPayload)
			.addSuccess(UserEmail, { status: 201 })
			.addError(EmailAlreadyTaken, { status: 409 }),
	)
	.add(
		HttpApiEndpoint.patch('makeEmailPrimary')`/emails/${uuidParam}/primary`
			.addSuccess(UserEmail.select)
			.addError(EmailNotOwned, { status: 403 })
			.addError(EmailNotVerified, { status: 400 }),
	)
	.add(
		HttpApiEndpoint.del('removeEmail')`/emails/${uuidParam}`
			.addSuccess(S.Boolean)
			.addError(CannotDeleteLastEmail, { status: 400 }),
	)
	.add(
		HttpApiEndpoint.post('resendVerification')`/emails/${uuidParam}/resend`.addSuccess(
			S.Boolean,
		),
	)
	.add(
		HttpApiEndpoint.post('verifyEmail')`/emails/${uuidParam}/verify`
			.setPayload(S.Struct({ token: S.NonEmptyTrimmedString }))
			.addSuccess(S.Boolean),
	)

const OrganizationsGroup = HttpApiGroup.make('organizations')
	.add(
		HttpApiEndpoint.post('create', '/organizations')
			.setPayload(
				S.Struct({
					slug: S.NonEmptyTrimmedString,
					name: S.NonEmptyTrimmedString,
				}),
			)
			.addSuccess(Organization.select, { status: 201 })
			.addError(AuthenticationRequired, { status: 401 }),
	)
	.add(
		HttpApiEndpoint.get('list', '/organizations').addSuccess(
			S.Array(Organization.select),
		),
	)
	.add(
		HttpApiEndpoint.get('getById')`/organizations/${orgIdParam}`.addSuccess(
			S.NullOr(Organization.select),
		),
	)
	.add(
		HttpApiEndpoint.patch('update')`/organizations/${orgIdParam}`
			.setPayload(
				S.partial(
					S.Struct({
						slug: S.NonEmptyTrimmedString,
						name: S.NonEmptyTrimmedString,
					}),
				),
			)
			.addSuccess(Organization.select)
			.addError(AccessDenied, { status: 403 }),
	)
	.add(HttpApiEndpoint.del('delete')`/organizations/${orgIdParam}`.addSuccess(S.Void))
	.add(
		HttpApiEndpoint.get('listMembers')`/organizations/${orgIdParam}/members`.addSuccess(
			S.Array(OrganizationMember),
		),
	)
	.add(
		HttpApiEndpoint.get(
			'listInvitations',
		)`/organizations/${orgIdParam}/invitations`.addSuccess(
			S.Array(OrganizationInvitation.select),
		),
	)
	.add(
		HttpApiEndpoint.del(
			'removeMember',
		)`/organizations/${orgIdParam}/members/${memberUserIdParam}`.addSuccess(S.Void),
	)
	.add(
		HttpApiEndpoint.post('invite')`/organizations/${orgIdParam}/invite`
			.setPayload(
				S.Struct({
					username: S.NullOr(S.NonEmptyTrimmedString),
					email: NullableEmail,
				}),
			)
			.addSuccess(S.Void)
			.addError(AuthenticationRequired, { status: 401 })
			.addError(AccessDenied, { status: 403 })
			.addError(AlreadyMember, { status: 409 })
			.addError(EmailNotVerified, { status: 400 })
			.addError(NotFound, { status: 404 }),
	)
	.add(
		HttpApiEndpoint.get(
			'getForInvitation',
		)`/organizations/invitations/${invitationIdParam}`
			.setUrlParams(S.partial(S.Struct({ code: S.NonEmptyTrimmedString })))
			.addSuccess(Organization.select)
			.addError(AuthenticationRequired, { status: 401 })
			.addError(NotFound, { status: 404 })
			.addError(AccessDenied, { status: 403 }),
	)
	.add(
		HttpApiEndpoint.post(
			'acceptInvitation',
		)`/organizations/invitations/${invitationIdParam}/accept`
			.setPayload(S.Struct({ code: S.NullOr(S.NonEmptyTrimmedString) }))
			.addSuccess(S.Void),
	)
	.add(
		HttpApiEndpoint.post(
			'transferOwnership',
		)`/organizations/${orgIdParam}/transfer-ownership`
			.setPayload(S.Struct({ userId: S.UUID }))
			.addSuccess(S.NullOr(Organization.select)),
	)
	.add(
		HttpApiEndpoint.post(
			'transferBillingContact',
		)`/organizations/${orgIdParam}/transfer-billing-contact`
			.setPayload(S.Struct({ userId: S.UUID }))
			.addSuccess(S.NullOr(Organization.select)),
	)

export const Contract = HttpApi.make('Contract')
	.addError(InternalError, { status: 500 })
	.add(PostsGroup)
	.add(UsersGroup)
	.add(EmailGroup)
	.add(OrganizationsGroup)
	.middleware(SessionCookieHttp)
	.prefix('/api')
