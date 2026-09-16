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
	return (
		<FormContext.Provider value={{ prefix, response }}>
			<form {...props}>{children}</form>
		</FormContext.Provider>
	)
}

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
