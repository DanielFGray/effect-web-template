import { useEffect, useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { useAtomSet } from '@effect-atom/atom-react'
import { Exit } from 'effect'
import { ApiClient } from '../lib/api.js'
import { Form, formResultFromExit, type FormResult } from '../components.js'

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
	const verify = useAtomSet(ApiClient.mutation('email', 'verifyEmail'), {
		mode: 'promiseExit',
	})

	useEffect(() => {
		if (!(id && token)) return
		let cancelled = false
		void (async () => {
			const exit = await verify({
				path: { id },
				payload: { token },
				reactivityKeys: ['emails', 'currentUser'],
			})
			if (cancelled) return
			if (Exit.isSuccess(exit) && exit.value) {
				setVerified(true)
				setResponse({})
			} else if (Exit.isFailure(exit)) {
				setResponse(formResultFromExit(exit))
			} else {
				setResponse({ formErrors: ['Verification failed'] })
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
