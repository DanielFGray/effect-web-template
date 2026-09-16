import { expect, it, suite } from '@effect/vitest'
import { Either, Option, ParseResult, Schema } from 'effect'

import { NullableEmail, NullableText } from './fields.js'
import {
	ChangePasswordFormPayload,
	RegisterFormPayload,
	ResetPasswordFormPayload,
	UpdateProfilePayload,
} from './payloads.js'

suite('NullableEmail blank-to-null', () => {
	it("decodes '' to null", () => {
		expect(Either.getOrThrow(Schema.decodeUnknownEither(NullableEmail)(''))).toBe(null)
	})

	it("decodes '   ' to null", () => {
		expect(Either.getOrThrow(Schema.decodeUnknownEither(NullableEmail)('   '))).toBe(null)
	})

	it('decodes null to null', () => {
		expect(Either.getOrThrow(Schema.decodeUnknownEither(NullableEmail)(null))).toBe(null)
	})

	it('keeps a valid address', () => {
		expect(
			Either.getOrThrow(Schema.decodeUnknownEither(NullableEmail)('user@example.com')),
		).toBe('user@example.com')
	})

	it("rejects 'not-an-email'", () => {
		expect(Either.isLeft(Schema.decodeUnknownEither(NullableEmail)('not-an-email'))).toBe(
			true,
		)
	})
})

suite('NullableText blank-to-null', () => {
	it("decodes '' to null", () => {
		expect(Either.getOrThrow(Schema.decodeUnknownEither(NullableText)(''))).toBe(null)
	})

	it("decodes '   ' to null", () => {
		expect(Either.getOrThrow(Schema.decodeUnknownEither(NullableText)('   '))).toBe(null)
	})

	it("keeps 'hello'", () => {
		expect(Either.getOrThrow(Schema.decodeUnknownEither(NullableText)('hello'))).toBe(
			'hello',
		)
	})
})

suite('UpdateProfilePayload blank fields', () => {
	it('decodes blank name/avatar_url/bio to null', () => {
		expect(
			Either.getOrThrow(
				Schema.decodeUnknownEither(UpdateProfilePayload)({
					username: 'x',
					name: '',
					avatar_url: '',
					bio: '',
				}),
			),
		).toEqual({
			username: 'x',
			name: null,
			avatar_url: null,
			bio: null,
		})
	})
})

suite('RegisterFormPayload confirmPassword', () => {
	it('mismatch fails at confirmPassword', () => {
		const result = Schema.decodeUnknownEither(RegisterFormPayload)({
			username: 'alice',
			password: 'password123',
			confirmPassword: 'different99',
			email: null,
		})
		expect(
			ParseResult.ArrayFormatter.formatErrorSync(
				Option.getOrThrow(Either.getLeft(result)),
			),
		).toEqual([
			{
				_tag: 'Type',
				path: ['confirmPassword'],
				message: 'Passwords do not match',
			},
		])
	})

	it('match decodes without confirmPassword', () => {
		const payload = Either.getOrThrow(
			Schema.decodeUnknownEither(RegisterFormPayload)({
				username: 'alice',
				password: 'password123',
				confirmPassword: 'password123',
				email: 'alice@example.com',
			}),
		)
		expect(payload).toEqual({
			username: 'alice',
			password: 'password123',
			email: 'alice@example.com',
		})
		expect('confirmPassword' in payload).toBe(false)
	})
})

suite('ResetPasswordFormPayload confirmPassword', () => {
	it('mismatch fails at confirmPassword', () => {
		const result = Schema.decodeUnknownEither(ResetPasswordFormPayload)({
			userId: '00000000-0000-4000-8000-000000000001',
			token: 'reset-token',
			password: 'password123',
			confirmPassword: 'different99',
		})
		expect(
			ParseResult.ArrayFormatter.formatErrorSync(
				Option.getOrThrow(Either.getLeft(result)),
			),
		).toEqual([
			{
				_tag: 'Type',
				path: ['confirmPassword'],
				message: 'Passwords do not match',
			},
		])
	})
})

suite('ChangePasswordFormPayload confirmPassword', () => {
	it('mismatch fails at confirmPassword', () => {
		const result = Schema.decodeUnknownEither(ChangePasswordFormPayload)({
			oldPassword: 'oldpassword',
			newPassword: 'password123',
			confirmPassword: 'different99',
		})
		expect(
			ParseResult.ArrayFormatter.formatErrorSync(
				Option.getOrThrow(Either.getLeft(result)),
			),
		).toEqual([
			{
				_tag: 'Type',
				path: ['confirmPassword'],
				message: 'Passwords do not match',
			},
		])
	})
})
