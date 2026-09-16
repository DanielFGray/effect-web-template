import { createFileRoute } from '@tanstack/react-router'
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

type ActionResult = { ok: true; data: null } | { ok: false; error: FormResult }

const forgotFn = createServerFn({ method: 'POST' })
	.validator((data: { email: string }) => data)
	.handler(({ data }): Promise<ActionResult> =>
		callApi((api) =>
			api.users.forgotPassword({ payload: data }).pipe(
				Effect.map((): ActionResult => ({ ok: true, data: null })),
				Effect.catchAll((err) =>
					Effect.succeed({
						ok: false as const,
						error: formResultFromError(err),
					}),
				),
			),
		),
	)

export const Route = createFileRoute('/forgot')({
	component: ForgotPassword,
})

function ForgotPassword() {
	const [email, setEmail] = useState('')
	const [response, setResponse] = useState<FormResult>()
	const [done, setDone] = useState(false)
	const forgot = useServerFn(forgotFn)

	if (done) {
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
