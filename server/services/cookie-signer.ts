import { createHmac, timingSafeEqual } from 'crypto'

import { Effect, Config, Redacted, Schema as S } from 'effect'

export class InvalidCookieSignature extends S.TaggedError<InvalidCookieSignature>()(
	'InvalidCookieSignature',
	{ message: S.String },
) {}

export class CookieSigner extends Effect.Service<CookieSigner>()('CookieSigner', {
	accessors: true,
	effect: Effect.gen(function* () {
		const secret = yield* Config.redacted('SECRET')
		const secretValue = Redacted.value(secret)

		return {
			sign: (value: string): string => {
				const signature = createHmac('sha256', secretValue)
					.update(value)
					.digest('base64url')
				return `${value}.${signature}`
			},

			verify: Effect.fnUntraced(function* (signedValue: string) {
				const lastDotIndex = signedValue.lastIndexOf('.')
				if (lastDotIndex === -1) {
					return yield* new InvalidCookieSignature({
						message: 'Invalid signed cookie format',
					})
				}

				const value = signedValue.slice(0, lastDotIndex)
				const signature = signedValue.slice(lastDotIndex + 1)

				const expectedSignature = createHmac('sha256', secretValue)
					.update(value)
					.digest('base64url')

				// Use timing-safe comparison to prevent timing attacks
				const sigBuffer = new Uint8Array(Buffer.from(signature))
				const expectedBuffer = new Uint8Array(Buffer.from(expectedSignature))

				if (
					sigBuffer.length !== expectedBuffer.length ||
					!timingSafeEqual(sigBuffer, expectedBuffer)
				) {
					return yield* new InvalidCookieSignature({
						message: 'Invalid cookie signature',
					})
				}

				return value
			}),
		}
	}),
}) {
	static Live = CookieSigner.Default
}
