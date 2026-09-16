import { ParseResult } from 'effect'
import React from 'react'

export type FormResult = {
	fieldErrors?: Record<string, Array<string>>
	formErrors?: Array<string>
	formMessages?: Array<string>
}

const FormContext = React.createContext<{
	prefix: string
	response?: FormResult
}>({ prefix: '' })

export function Form({
	prefix,
	response,
	children,
	...props
}: {
	prefix: string
	response?: FormResult
} & React.ComponentPropsWithoutRef<'form'>) {
	// Before hydration (and with JS off) the browser enforces the native constraint
	// attributes. After hydration the schema decode owns error presentation, so the
	// native bubbles would only duplicate it.
	const hydrated = useHydrated()

	return (
		<FormContext.Provider value={{ prefix, response }}>
			<form {...props} noValidate={hydrated}>
				{children}
			</form>
		</FormContext.Provider>
	)
}

/**
 * False while server-rendering and through the hydration render, true after.
 * The store never changes, so the two snapshots alone carry the signal.
 */
function useHydrated(): boolean {
	return React.useSyncExternalStore(
		subscribeToNothing,
		() => true,
		() => false,
	)
}

const subscribeToNothing = () => () => {}

Form.Row = function FormRow(
	props: (
		| {
				name: string
				label?: string | null
				children: React.ReactNode
		  }
		| {
				name: string
				label?: string | null
				type: HTMLInputElement['type'] | 'textarea'
		  }
	) &
		Omit<React.ComponentPropsWithoutRef<'input'>, 'type' | 'name'>,
) {
	const { prefix, response } = React.useContext(FormContext)

	return (
		<div className="form-row">
			{props.label === null ? null : (
				<label
					htmlFor={`${prefix}-${props.name}-input`}
					data-cy={`${prefix}-${props.name}-label`}
				>
					{props.label || props.name}:
				</label>
			)}
			{'children' in props
				? props.children
				: React.createElement(props.type === 'textarea' ? 'textarea' : 'input', {
						...props,
						...(props.type === 'textarea' ? { pattern: undefined } : null),
						type: props.type === 'textarea' ? undefined : props.type,
						name: props.name,
						id: `${prefix}-${props.name}-input`,
						'aria-describedby': `${prefix}-${props.name}-help`,
						'aria-invalid': Boolean(response?.fieldErrors?.[props.name]),
						'data-cy': `${prefix}-${props.name}-input`,
					})}
			{response?.fieldErrors?.[props.name]?.map((e) => (
				<div className="field-error" key={e} id={`${prefix}-${props.name}-help`}>
					{e}
				</div>
			))}
		</div>
	)
}

Form.Errors = function FormErrors() {
	const { response } = React.useContext(FormContext)
	return (
		<>
			{response?.formMessages?.map((e) => (
				<div className="field-message" key={e}>
					{e}
				</div>
			))}
			{response?.formErrors?.map((e) => (
				<div className="field-error" key={e}>
					{e}
				</div>
			))}
		</>
	)
}

export function UnverifiedAccountWarning() {
	return (
		<small data-cy="unverified-account-warning">
			You do not have any verified email addresses, this will make account recovery
			impossible and may limit your available functionality within this application.
			Please complete email verification.
		</small>
	)
}

export function Spinner() {
	return <>loading...</>
}

/** Map a failed mutation/query error into form display fields. */
export function formResultFromError(error: {
	readonly message?: string
	readonly field?: string
}): FormResult {
	if (error.field && error.message) {
		return { fieldErrors: { [error.field]: [error.message] } }
	}
	if (error.message) {
		return { formErrors: [error.message] }
	}
	return { formErrors: ['Something went wrong'] }
}

/** Map a client-side Schema ParseError into form display fields. */
export function formResultFromParseError(error: ParseResult.ParseError): FormResult {
	const issues = ParseResult.ArrayFormatter.formatErrorSync(error)
	const formErrors = issues
		.filter((issue) => issue.path.length === 0)
		.map((issue) => issue.message)
	const fieldErrors = Object.fromEntries(
		Object.entries(
			Object.groupBy(
				issues.filter((issue) => issue.path.length > 0),
				(issue) => String(issue.path[0]),
			),
		).map(([field, group]) => [field, (group ?? []).map((issue) => issue.message)]),
	)
	return {
		fieldErrors: Object.keys(fieldErrors).length === 0 ? undefined : fieldErrors,
		formErrors: formErrors.length === 0 ? undefined : formErrors,
	}
}
