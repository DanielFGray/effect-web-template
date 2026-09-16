import { Schema } from 'effect'

import { formResultFromParseError, type FormResult } from '../components.js'

/**
 * Outcome of a no-JS form POST, lifted from the route handler into route context
 * so the page re-renders with errors and safe values still filled in.
 */
export type FormAction<Values> = {
	values: Values
	response: FormResult
}

export type ActionResult = { ok: true; data: null } | { ok: false; error: FormResult }

/** Native FormData → flat string record. File fields are skipped. */
export function formDataRecord(formData: FormData): Record<string, string> {
	const record: Record<string, string> = {}
	for (const [key, value] of formData.entries()) {
		if (typeof value === 'string') {
			record[key] = value
		}
	}
	return record
}

/**
 * Decode a submission with the endpoint's payload schema.
 * On failure, returns the FormAction the page should re-render with — `values`
 * is whatever the caller decided is safe to echo (never passwords).
 */
export function decodeFormAction<A, I, Values>(
	schema: Schema.Schema<A, I>,
	input: unknown,
	values: Values,
): { ok: true; payload: A } | { ok: false; action: FormAction<Values> } {
	const decoded = Schema.decodeUnknownEither(schema)(input)
	if (decoded._tag === 'Left') {
		return {
			ok: false,
			action: { values, response: formResultFromParseError(decoded.left) },
		}
	}
	return { ok: true, payload: decoded.right }
}
