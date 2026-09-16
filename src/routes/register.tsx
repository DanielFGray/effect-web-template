import { createFileRoute, Link, useNavigate, useRouter } from '@tanstack/react-router'
import { createServerFn, useServerFn } from '@tanstack/react-start'
import { Effect } from 'effect'
import { useState } from 'react'

import { formConstraints } from '../../shared/formConstraints.gen.js'
import { Form, formResultFromError, type FormResult } from '../components.js'
import { callApi } from '../lib/api.server.js'

type ActionResult = { ok: true; data: null } | { ok: false; error: FormResult }

const registerFn = createServerFn({ method: 'POST' })
	.validator((data: { username: string; password: string; email: string | null }) => data)
	.handler(({ data }): Promise<ActionResult> =>
		callApi((api) =>
			api.users.register({ payload: data }).pipe(
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

export const Route = createFileRoute('/register')({
	validateSearch: (search: Record<string, unknown>) => ({
		redirectTo: typeof search.redirectTo === 'string' ? search.redirectTo : undefined,
	}),
	component: Register,
})

function Register() {
	const [username, setUsername] = useState('')
	const [email, setEmail] = useState('')
	const [password, setPassword] = useState('')
	const [confirmPassword, setConfirmPassword] = useState('')
	const [response, setResponse] = useState<FormResult>()
	const { user } = Route.useRouteContext()
	const navigate = useNavigate()
	const router = useRouter()
	const { redirectTo } = Route.useSearch()
	const register = useServerFn(registerFn)

	if (user) {
		void navigate({ to: redirectTo || '/' })
		return null
	}

	return (
		<>
			<Form
				prefix="register"
				response={response}
				onSubmit={async (ev) => {
					ev.preventDefault()
					setResponse(undefined)

					if (password !== confirmPassword) {
						setResponse({
							fieldErrors: { confirmPassword: ['Passwords do not match'] },
						})
						return
					}

					const result = await register({
						data: {
							username,
							password,
							email: email.trim() === '' ? null : email,
						},
					})
					if (result.ok) {
						await router.invalidate()
						void navigate({ to: redirectTo || '/' })
					} else {
						setResponse(result.error)
					}
				}}
			>
				<fieldset>
					<legend>register</legend>

					<Form.Row
						{...formConstraints['users.register'].username}
						name="username"
						type="text"
						value={username}
						onChange={(e) => setUsername(e.target.value)}
					/>
					<Form.Row
						{...formConstraints['users.register'].email}
						name="email"
						value={email}
						onChange={(e) => setEmail(e.target.value)}
					/>
					<Form.Row
						{...formConstraints['users.register'].password}
						name="password"
						type="password"
						autoComplete="new-password"
						value={password}
						onChange={(e) => setPassword(e.target.value)}
					/>
					<Form.Row
						name="confirmPassword"
						label="confirm password"
						type="password"
						autoComplete="new-password"
						value={confirmPassword}
						onChange={(e) => setConfirmPassword(e.target.value)}
					/>

					<div>
						{response?.formErrors?.map((e) => (
							<div className="field-error" key={e}>
								{e}
							</div>
						))}
						<button type="submit" data-cy="register-submit-button">
							register
						</button>
					</div>
					<Form.Errors />
				</fieldset>
			</Form>

			<div className="text-center">
				<Link to="/login" search={redirectTo ? { redirectTo } : undefined}>
					log in with existing account
				</Link>
			</div>
		</>
	)
}
