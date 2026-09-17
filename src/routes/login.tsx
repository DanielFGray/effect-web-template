import {
	createFileRoute,
	Link,
	redirect,
	useNavigate,
	useRouter,
} from '@tanstack/react-router'
import { createServerFn, useServerFn } from '@tanstack/react-start'
import { Effect, Schema } from 'effect'
import { useState } from 'react'

import { loginAndCreateSession } from '../../server/auth.js'
import { formConstraints } from '../../shared/formConstraints.gen.js'
import { LoginPayload } from '../../shared/payloads.js'
import {
	Form,
	formResultFromError,
	formResultFromParseError,
	type FormResult,
} from '../components.js'
import {
	type ActionResult,
	decodeFormAction,
	type FormAction,
	formDataRecord,
} from '../lib/formAction.js'
import { runServer } from '../lib/runtime.server.js'

/**
 * The one implementation of logging in. Both entry points below call it: the
 * route's POST handler, which the browser reaches by submitting the form, and
 * the server function, which the hydrated page calls over RPC. They differ only
 * in how the payload arrived on the wire.
 */
const performLogin = (payload: typeof LoginPayload.Type): Promise<ActionResult> =>
	runServer(
		loginAndCreateSession(payload).pipe(
			Effect.map((): ActionResult => ({ ok: true, data: null })),
			Effect.catchAll((err) =>
				Effect.succeed({
					ok: false as const,
					error: formResultFromError(err),
				}),
			),
		),
	)

const loginFn = createServerFn({ method: 'POST' })
	.validator((data: { id: string; password: string }) => data)
	.handler(({ data }): Promise<ActionResult> => performLogin(data))

export const Route = createFileRoute('/login')({
	validateSearch: (search: Record<string, unknown>) => ({
		redirectTo: typeof search.redirectTo === 'string' ? search.redirectTo : undefined,
	}),
	server: {
		handlers: {
			// Where a submission lands when JavaScript never ran. Calling `next` rather
			// than returning a Response hands control back to the router, which then
			// renders this route's component — the failure path is a re-render of the
			// page, not a redirect. Only a route that has a component may do this.
			// The whole `server` property is stripped from the client bundle, so
			// importing runServer here does not reach the browser.
			POST: async ({ request, next }) => {
				const record = formDataRecord(await request.formData())
				const values = { id: record.id ?? '' }
				const decoded = decodeFormAction(LoginPayload, record, values)
				if (!decoded.ok) {
					return next({
						context: { loginAction: decoded.action satisfies FormAction<typeof values> },
					})
				}

				const result = await performLogin(decoded.payload)

				if (result.ok) {
					const redirectTo = new URL(request.url).searchParams.get('redirectTo')
					throw redirect({ to: redirectTo || '/' })
				}

				return next({
					context: {
						loginAction: {
							values: { id: decoded.payload.id },
							response: result.error,
						} satisfies FormAction<typeof values>,
					},
				})
			},
		},
	},
	beforeLoad: ({ serverContext }) => ({
		loginAction: serverContext?.loginAction,
	}),
	component: Login,
})

function Login() {
	const { user, loginAction } = Route.useRouteContext()
	const [response, setResponse] = useState<FormResult | undefined>(loginAction?.response)
	const navigate = useNavigate()
	const router = useRouter()
	const { redirectTo } = Route.useSearch()
	const login = useServerFn(loginFn)

	if (user) {
		void navigate({ to: redirectTo || '/' })
		return null
	}

	return (
		<>
			<Form
				prefix="login"
				// No `action`: a form without one posts to the current URL, which keeps
				// ?redirectTo= on the request so the handler can honour it. Naming the
				// route explicitly would drop the query string.
				method="post"
				response={response}
				onSubmit={async (ev) => {
					ev.preventDefault()
					const form = ev.currentTarget
					setResponse(undefined)
					const decoded = Schema.decodeUnknownEither(LoginPayload)(
						Object.fromEntries(new FormData(form).entries()),
					)
					if (decoded._tag === 'Left') {
						setResponse(formResultFromParseError(decoded.left))
						return
					}
					const result = await login({ data: decoded.right })
					if (result.ok) {
						await router.invalidate()
						void navigate({ to: redirectTo || '/' })
					} else {
						setResponse(result.error)
					}
				}}
			>
				<fieldset>
					<legend>log in</legend>
					{redirectTo ? (
						<div className="field-error">you must be logged in to do that!</div>
					) : null}
					<Form.Row
						{...formConstraints['users.login'].id}
						type="text"
						label="username or email"
						name="id"
						defaultValue={loginAction?.values.id ?? ''}
					/>
					<Form.Row
						{...formConstraints['users.login'].password}
						type="password"
						name="password"
					/>
					<div>
						{response?.formErrors?.map((e) => (
							<div className="field-error" key={e}>
								{e}
							</div>
						))}
						<button type="submit" data-cy="login-submit-button">
							login
						</button>
						{response?.formErrors ? (
							<>
								{' '}
								<Link to="/forgot" data-cy="login-forgot-link">
									I forgot my password
								</Link>
							</>
						) : null}
					</div>
				</fieldset>
			</Form>
			<div className="text-center">
				<div>
					<Link to="/register" search={redirectTo ? { redirectTo } : undefined}>
						I need an account
					</Link>
				</div>
			</div>
		</>
	)
}
