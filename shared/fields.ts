/**
 * The leaf schemas that a form field can be built from.
 *
 * This module imports nothing but `effect/Schema`, which is what makes it safe
 * to reach from the browser. `schemas.ts` (the persistence models) and
 * `httpApi.ts` (the contract) both pull in packages the client must never load,
 * so they import *from* here rather than the other way round.
 *
 * Every schema carries a `message`, because a ParseError from these is rendered
 * into the page and Effect's default messages quote the offending value back.
 */
import { Schema as S } from 'effect'

import { isValidEmail, isValidPassword } from './validation.js'

/**
 * A password being *set*. One flat filter rather than a composition: each nested
 * schema that can fail adds another default message, and a password must never
 * be echoed into the DOM.
 */
export const Password = S.String.pipe(
	S.filter(isValidPassword, {
		identifier: 'Password',
		title: 'Password',
		jsonSchema: { minLength: 8, pattern: '^\\S[\\s\\S]*\\S$|^\\S$|^$' },
		message: () =>
			'Password must be at least 8 characters and cannot begin or end with a space',
	}),
)

/**
 * A password the user is proving they already know, as opposed to one they are
 * setting. Only emptiness is checked: the stored hash is the authority, and any
 * stricter client rule would lock out an account whose password predates that
 * rule. Deliberately not trimmed for the same reason.
 */
export const SubmittedSecret = S.String.pipe(
	S.filter((s) => s.length > 0, {
		identifier: 'SubmittedSecret',
		title: 'Password',
		jsonSchema: { minLength: 1 },
		message: () => 'Password is required',
	}),
)

export const EmailSchema = S.String.pipe(
	S.filter(isValidEmail, {
		identifier: 'Email',
		title: 'Email',
		jsonSchema: { format: 'email', minLength: 6, maxLength: 998 },
		message: () => 'Enter a valid email address',
	}),
)

/** A nullable email. See {@link nullable} for why this is not `S.NullOr`. */
export const NullableEmail = nullable({
	identifier: 'NullableEmail',
	title: 'Email',
	predicate: isValidEmail,
	message: 'Enter a valid email address',
	jsonSchema: { format: 'email', minLength: 6, maxLength: 998 },
})

/** A nullable free-text field: non-null values must be non-empty and trimmed. */
export const NullableText = nullable({
	identifier: 'NullableText',
	predicate: (s) => s.length > 0 && s === s.trim(),
	message: 'Cannot be blank or begin or end with a space',
	jsonSchema: { minLength: 1, pattern: '^\\S[\\s\\S]*\\S$|^\\S$|^$' },
})

/**
 * `string | null` whose non-null values satisfy `predicate`.
 *
 * Blank and absent are the same thing: decoding `''` (or whitespace-only) yields
 * `null`, the same as decoding `null`. A filter cannot map, so the blank→null
 * step is a transform sitting under the predicate. Encoded and decoded types
 * both stay `string | null` so a JSON client sending null is unchanged.
 *
 * Reports one failure instead of one per NullOr branch: a union that fails
 * tells the user both what the field should be *and* that it should have been null.
 */
function nullable(options: {
	identifier: string
	title?: string
	predicate: (value: string) => boolean
	message: string
	jsonSchema: Record<string, unknown>
}) {
	return S.transform(S.NullOr(S.String), S.NullOr(S.String), {
		decode: (value) => (value === null || value.trim() === '' ? null : value),
		encode: (value) => value,
	}).pipe(
		S.filter((value) => value === null || options.predicate(value), {
			identifier: options.identifier,
			...(options.title === undefined ? null : { title: options.title }),
			jsonSchema: options.jsonSchema,
			message: () => options.message,
		}),
	)
}
