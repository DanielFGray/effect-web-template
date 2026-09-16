export function isValidPassword(password: unknown) {
	return (
		typeof password === 'string' &&
		password.length >= 8 &&
		// Previously supplied by NonEmptyTrimmedString. Kept as one predicate so
		// a failure has a single message that never quotes the password back.
		password === password.trim()
	)
}

const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/

export function isValidEmail(value: string): boolean {
	return emailRegex.test(value)
}
