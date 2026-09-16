import { useState } from 'react'
import {
	createFileRoute,
	Link,
	useNavigate,
	useRouter,
} from '@tanstack/react-router'
import { createServerFn, useServerFn } from '@tanstack/react-start'
import { Effect } from 'effect'
import { callApi } from '../lib/api.server.js'
import { Form, formResultFromError, type FormResult } from '../components.js'

type ActionResult =
	| { ok: true; data: null }
	| { ok: false; error: FormResult }

const loginFn = createServerFn({ method: 'POST' })
	.validator((data: { id: string; password: string }) => data)
	.handler(({ data }): Promise<ActionResult> =>
		callApi((api) =>
			api.users.login({ payload: data }).pipe(
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

export const Route = createFileRoute('/login')({
	validateSearch: (search: Record<string, unknown>) => ({
		redirectTo: typeof search.redirectTo === 'string' ? search.redirectTo : undefined,
	}),
	component: Login,
})

function Login() {
	const [id, setId] = useState('')
	const [password, setPassword] = useState('')
	const [response, setResponse] = useState<FormResult>()
	const { user } = Route.useRouteContext()
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
				response={response}
				onSubmit={async (ev) => {
					ev.preventDefault()
					setResponse(undefined)
					const result = await login({ data: { id, password } })
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
						type="text"
						label="username or email"
						name="id"
						value={id}
						onChange={(e) => setId(e.target.value)}
					/>
					<Form.Row
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
					<Link
						to="/register"
						search={redirectTo ? { redirectTo } : undefined}
					>
						I need an account
					</Link>
				</div>
			</div>
		</>
	)
}
