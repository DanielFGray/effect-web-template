import {
	createFileRoute,
	redirect,
	useNavigate,
	useRouter,
} from '@tanstack/react-router'
import { createServerFn, useServerFn } from '@tanstack/react-start'
import { Effect } from 'effect'
import { useState } from 'react'

import { logoutAndClearSession } from '../../server/auth.js'
import { Form, formResultFromError, type FormResult } from '../components.js'
import { type ActionResult, type FormAction } from '../lib/formAction.js'
import { runServer } from '../lib/runtime.server.js'

type LogoutValues = Record<string, never>

/**
 * The one implementation of logging out. Both entry points below call it: the
 * route's POST handler, which the browser reaches by submitting the form, and
 * the server function, which the hydrated page calls over RPC.
 */
const performLogout = (): Promise<ActionResult> =>
	runServer(
		logoutAndClearSession.pipe(
			Effect.map((): ActionResult => ({ ok: true, data: null })),
			Effect.catchAll((err) =>
				Effect.succeed({
					ok: false as const,
					error: formResultFromError(err),
				}),
			),
		),
	)

const logoutFn = createServerFn({ method: 'POST' }).handler((): Promise<ActionResult> =>
	performLogout(),
)

export const Route = createFileRoute('/logout')({
	server: {
		handlers: {
			// Where a submission lands when JavaScript never ran. Success redirects;
			// failure re-renders this route with the error in context.
			POST: async ({ next }) => {
				const result = await performLogout()

				if (result.ok) {
					throw redirect({ to: '/' })
				}

				return next({
					context: {
						logoutAction: {
							values: {},
							response: result.error,
						} satisfies FormAction<LogoutValues>,
					},
				})
			},
		},
	},
	beforeLoad: ({ serverContext }) => ({
		logoutAction: serverContext?.logoutAction,
	}),
	component: Logout,
})

function Logout() {
	const { logoutAction } = Route.useRouteContext()
	const [response, setResponse] = useState<FormResult | undefined>(logoutAction?.response)
	const navigate = useNavigate()
	const router = useRouter()
	const logout = useServerFn(logoutFn)

	return (
		<Form
			prefix="logout"
			method="post"
			response={response}
			onSubmit={async (ev) => {
				ev.preventDefault()
				setResponse(undefined)
				const result = await logout()
				if (result.ok) {
					await router.invalidate()
					void navigate({ to: '/' })
				} else {
					setResponse(result.error)
				}
			}}
		>
			<fieldset>
				<legend>log out</legend>
				<div>
					{response?.formErrors?.map((e) => (
						<div className="field-error" key={e}>
							{e}
						</div>
					))}
					<button type="submit" data-cy="logout-submit">
						log out
					</button>
				</div>
			</fieldset>
		</Form>
	)
}
