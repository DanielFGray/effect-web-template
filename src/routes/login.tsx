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

import { formConstraints } from '../../shared/formConstraints.gen.js'
import { LoginPayload } from '../../shared/payloads.js'
import {
	Form,
	formResultFromError,
	formResultFromParseError,
	type FormResult,
} from '../components.js'
import { callApi } from '../lib/api.server.js'

type ActionResult = { ok: true; data: null } | { ok: false; error: FormResult }

/**
 * The outcome of a submission the browser made on its own, without JavaScript.
 * The POST handler puts it on the server context, `beforeLoad` lifts it into
 * route context, and the component seeds its state from it, so a rejected
 * submission renders with its errors and its values still in place. The
 * password is deliberately absent: it must never be written back into the DOM.
 */
type LoginAction = {
	values: { id: string }
	response: FormResult
}

/**
 * The one implementation of logging in. Both entry points below call it: the
 * route's POST handler, which the browser reaches by submitting the form, and
 * the server function, which the hydrated page calls over RPC. They differ only
 * in how the payload arrived on the wire.
 */
const performLogin = (payload: typeof LoginPayload.Type): Promise<ActionResult> =>
	callApi((api) =>
		api.users.login({ payload }).pipe(
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

function formDataRecord(formData: FormData): Record<string, string> {
	const record: Record<string, string> = {}
	for (const [key, value] of formData.entries()) {
		if (typeof value === 'string') {
			record[key] = value
		}
	}
	return record
}

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
			// importing callApi here does not reach the browser.
			POST: async ({ request, next }) => {
				const record = formDataRecord(await request.formData())
				const decoded = Schema.decodeUnknownEither(LoginPayload)(record)
				if (decoded._tag === 'Left') {
					return next({
						context: {
							loginAction: {
								values: { id: record.id ?? '' },
								response: formResultFromParseError(decoded.left),
							} satisfies LoginAction,
						},
					})
				}

				const result = await performLogin(decoded.right)

				if (result.ok) {
					const redirectTo = new URL(request.url).searchParams.get('redirectTo')
					throw redirect({ to: redirectTo || '/' })
				}

				return next({
					context: {
						loginAction: {
							values: { id: decoded.right.id },
							response: result.error,
						} satisfies LoginAction,
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
	const [id, setId] = useState(loginAction?.values.id ?? '')
	const [password, setPassword] = useState('')
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
					setResponse(undefined)
					const decoded = Schema.decodeUnknownEither(LoginPayload)({ id, password })
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
						value={id}
						onChange={(e) => setId(e.target.value)}
					/>
					<Form.Row
						{...formConstraints['users.login'].password}
						type="password"
						name="password"
						value={password}
						onChange={(e) => setPassword(e.target.value)}
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
