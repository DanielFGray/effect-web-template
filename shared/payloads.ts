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

/**
 * Browser form submission for register: API fields plus confirmPassword.
 * Decoded type is RegisterPayload — confirmPassword never reaches the endpoint.
 */
export const RegisterFormPayload = S.transform(
	S.Struct({
		...RegisterPayload.fields,
		confirmPassword: S.String,
	}).pipe(
		S.filter((input) =>
			input.password === input.confirmPassword
				? undefined
				: {
						path: ['confirmPassword'],
						message: 'Passwords do not match',
					},
		),
	),
	RegisterPayload,
	{
		decode: ({ confirmPassword: _confirm, ...payload }) => payload,
		encode: (payload) => ({ ...payload, confirmPassword: payload.password }),
	},
)

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

/**
 * Browser form submission for reset: API fields plus confirmPassword.
 * Decoded type is ResetPasswordPayload — confirmPassword never reaches the endpoint.
 */
export const ResetPasswordFormPayload = S.transform(
	S.Struct({
		...ResetPasswordPayload.fields,
		confirmPassword: S.String,
	}).pipe(
		S.filter((input) =>
			input.password === input.confirmPassword
				? undefined
				: {
						path: ['confirmPassword'],
						message: 'Passwords do not match',
					},
		),
	),
	ResetPasswordPayload,
	{
		decode: ({ confirmPassword: _confirm, ...payload }) => payload,
		encode: (payload) => ({ ...payload, confirmPassword: payload.password }),
	},
)

export const ChangePasswordPayload = S.Struct({
	oldPassword: SubmittedSecret,
	newPassword: Password,
})

/**
 * Browser form submission for change-password (settings). Same shape as
 * register/reset confirmation; settings can adopt this without inventing a
 * third copy of the match rule.
 */
export const ChangePasswordFormPayload = S.transform(
	S.Struct({
		...ChangePasswordPayload.fields,
		confirmPassword: S.String,
	}).pipe(
		S.filter((input) =>
			input.newPassword === input.confirmPassword
				? undefined
				: {
						path: ['confirmPassword'],
						message: 'Passwords do not match',
					},
		),
	),
	ChangePasswordPayload,
	{
		decode: ({ confirmPassword: _confirm, ...payload }) => payload,
		encode: (payload) => ({ ...payload, confirmPassword: payload.newPassword }),
	},
)

export const UpdateProfilePayload = S.Struct({
	username: S.NonEmptyTrimmedString,
	name: NullableText,
	avatar_url: NullableText,
	bio: NullableText,
})

export const AddEmailPayload = S.Struct({ email: EmailSchema })
