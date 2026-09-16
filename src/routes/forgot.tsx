import { createFileRoute, redirect } from '@tanstack/react-router'
import { createServerFn, useServerFn } from '@tanstack/react-start'
import { Effect, Schema } from 'effect'
import { useState } from 'react'

import { formConstraints } from '../../shared/formConstraints.gen.js'
import { ForgotPasswordPayload } from '../../shared/payloads.js'
import {
	Form,
	formResultFromError,
	formResultFromParseError,
	type FormResult,
} from '../components.js'
import { callApi } from '../lib/api.server.js'
import {
	type ActionResult,
	decodeFormAction,
	type FormAction,
	formDataRecord,
} from '../lib/formAction.js'

const performForgot = (
	payload: typeof ForgotPasswordPayload.Type,
): Promise<ActionResult> =>
	callApi((api) =>
		api.users.forgotPassword({ payload }).pipe(
			Effect.map((): ActionResult => ({ ok: true, data: null })),
			Effect.catchAll((err) =>
				Effect.succeed({
					ok: false as const,
					error: formResultFromError(err),
				}),
			),
		),
	)

const forgotFn = createServerFn({ method: 'POST' })
	.validator((data: { email: string }) => data)
	.handler(({ data }): Promise<ActionResult> => performForgot(data))

export const Route = createFileRoute('/forgot')({
	validateSearch: (search: Record<string, unknown>) => ({
		// Set by the no-JS success redirect so the confirmation copy survives a full navigation.
		sent:
			search.sent === '1' || search.sent === 'true' || search.sent === true
				? true
				: undefined,
	}),
	server: {
		handlers: {
			POST: async ({ request, next }) => {
				const record = formDataRecord(await request.formData())
				const values = { email: record.email ?? '' }
				const decoded = decodeFormAction(ForgotPasswordPayload, record, values)
				if (!decoded.ok) {
					return next({
						context: {
							forgotAction: decoded.action satisfies FormAction<typeof values>,
						},
					})
				}

				const result = await performForgot(decoded.payload)

				if (result.ok) {
					throw redirect({ to: '/forgot', search: { sent: true } })
				}

				return next({
					context: {
						forgotAction: {
							values: { email: decoded.payload.email },
							response: result.error,
						} satisfies FormAction<typeof values>,
					},
				})
			},
		},
	},
	beforeLoad: ({ serverContext }) => ({
		forgotAction: serverContext?.forgotAction,
	}),
	component: ForgotPassword,
})

function ForgotPassword() {
	const { forgotAction } = Route.useRouteContext()
	const { sent } = Route.useSearch()
	const [email, setEmail] = useState(forgotAction?.values.email ?? '')
	const [response, setResponse] = useState<FormResult | undefined>(forgotAction?.response)
	const [done, setDone] = useState(false)
	const forgot = useServerFn(forgotFn)

	if (done || sent) {
		return (
			<div>
				We&apos;ve sent a link to your email. Please check your email and click the link
				and follow the instructions. If you don&apos;t receive the link, please ensure you
				entered the email address correctly, and check in your spam folder just in case.
			</div>
		)
	}

	return (
		<Form
			response={response}
			prefix="forgot"
			method="post"
			onSubmit={async (ev) => {
				ev.preventDefault()
				setResponse(undefined)
				const decoded = Schema.decodeUnknownEither(ForgotPasswordPayload)({ email })
				if (decoded._tag === 'Left') {
					setResponse(formResultFromParseError(decoded.left))
					return
				}
				const result = await forgot({
					data: decoded.right,
				})
				if (result.ok) {
					setDone(true)
				} else {
					setResponse(result.error)
				}
			}}
		>
			<fieldset>
				<legend>forgot password</legend>
				<Form.Row
					name="email"
					{...formConstraints['users.forgotPassword'].email}
					autoComplete="email"
					value={email}
					onChange={(e) => setEmail(e.target.value)}
				/>

				<div>
					<Form.Errors />
					<button type="submit" data-cy="forgot-submit-button">
						Reset Password
					</button>
				</div>
			</fieldset>
		</Form>
	)
}
