import { createFileRoute } from '@tanstack/react-router'
import { createServerFn, useServerFn } from '@tanstack/react-start'
import { Effect } from 'effect'
import { useEffect, useState } from 'react'

import { withAuthContext } from '../../server/db.js'
import { Email } from '../../server/services/email.js'
import { Form, formResultFromError, type FormResult } from '../components.js'
import { runServer } from '../lib/runtime.server.js'

type ActionResult = { ok: true; data: null } | { ok: false; error: FormResult }

const verifyFn = createServerFn({ method: 'POST' })
	.validator((data: { id: string; token: string }) => data)
	.handler(({ data }): Promise<ActionResult> =>
		runServer(
			Email.verifyEmail({ emailId: data.id, token: data.token }).pipe(
				withAuthContext,
				Effect.map((verified): ActionResult =>
					verified
						? { ok: true, data: null }
						: {
								ok: false,
								error: { formErrors: ['Verification failed'] },
							},
				),
				Effect.catchAll((err) =>
					Effect.succeed({
						ok: false as const,
						error: formResultFromError(err),
					}),
				),
			),
		),
	)

export const Route = createFileRoute('/verify')({
	validateSearch: (search: Record<string, unknown>) => ({
		id: typeof search.id === 'string' ? search.id : undefined,
		token: typeof search.token === 'string' ? search.token : undefined,
	}),
	component: Verify,
})

function Verify() {
	const { id, token } = Route.useSearch()
	const [response, setResponse] = useState<FormResult>(() =>
		id && token ? {} : { formErrors: ['Missing id or token'] },
	)
	const [verified, setVerified] = useState(false)
	const verify = useServerFn(verifyFn)

	useEffect(() => {
		if (!(id && token)) return
		let cancelled = false
		void (async () => {
			const result = await verify({ data: { id, token } })
			if (cancelled) return
			if (result.ok) {
				setVerified(true)
				setResponse({})
			} else {
				setResponse(result.error)
			}
		})()
		return () => {
			cancelled = true
		}
	}, [id, token, verify])

	return (
		<Form prefix="verify" response={response} className="items-center p-4">
			{verified ? (
				<div data-cy="email-verified">Thank you for verifying your email address.</div>
			) : null}
			<Form.Errors />
		</Form>
	)
}
