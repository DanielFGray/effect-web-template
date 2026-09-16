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
	// `label` (and `children`) are Form.Row's own props — they must not land on the DOM node.
	const { name, label } = props
	const field = (() => {
		if ('children' in props) {
			return props.children
		}
		const { type, label: _label, name: _name, ...inputProps } = props
		return React.createElement(type === 'textarea' ? 'textarea' : 'input', {
			...inputProps,
			...(type === 'textarea' ? { pattern: undefined } : null),
			type: type === 'textarea' ? undefined : type,
			name,
			id: `${prefix}-${name}-input`,
			'aria-describedby': `${prefix}-${name}-help`,
			'aria-invalid': Boolean(response?.fieldErrors?.[name]),
			'data-cy': `${prefix}-${name}-input`,
		})
	})()

	return (
		<div className="form-row">
			{label === null ? null : (
				<label htmlFor={`${prefix}-${name}-input`} data-cy={`${prefix}-${name}-label`}>
					{label || name}:
				</label>
			)}
			{field}
			{response?.fieldErrors?.[name]?.map((e) => (
				<div className="field-error" key={e} id={`${prefix}-${name}-help`}>
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
