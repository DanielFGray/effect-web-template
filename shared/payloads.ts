/**
 * The payload schemas for endpoints that back a form.
 *
 * These live apart from httpApi.ts on purpose: the contract imports
 * @effect/platform, which the browser must never load. A form validates its
 * input before submit against the very same schema object the server decodes
 * with, so there is one definition and no derivation step between them.
 */
import { Schema as S } from 'effect'

import {
	EmailSchema,
	NullableEmail,
	NullableText,
	Password,
	SubmittedSecret,
} from './fields.js'

export const RegisterPayload = S.Struct({
	username: S.NonEmptyTrimmedString,
	password: Password,
	email: NullableEmail,
})

export const LoginPayload = S.Struct({
	id: S.NonEmptyTrimmedString,
	password: SubmittedSecret,
})

export const ForgotPasswordPayload = S.Struct({ email: EmailSchema })

export const ResetPasswordPayload = S.Struct({
	userId: S.UUID,
	token: S.NonEmptyTrimmedString,
	password: Password,
})

export const ChangePasswordPayload = S.Struct({
	oldPassword: SubmittedSecret,
	newPassword: Password,
})

export const UpdateProfilePayload = S.Struct({
	username: S.NonEmptyTrimmedString,
	name: NullableText,
	avatar_url: NullableText,
	bio: NullableText,
})

export const AddEmailPayload = S.Struct({ email: EmailSchema })
