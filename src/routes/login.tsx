import { useState } from 'react'
import {
	createFileRoute,
	Link,
	useNavigate,
} from '@tanstack/react-router'
import { Result, useAtomSet, useAtomValue } from '@effect-atom/atom-react'
import { Exit } from 'effect'
import { ApiClient, currentUserAtom } from '../lib/api.js'
import { Form, formResultFromExit, type FormResult } from '../components.js'

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
	const userResult = useAtomValue(currentUserAtom)
	const navigate = useNavigate()
	const { redirectTo } = Route.useSearch()
	const login = useAtomSet(ApiClient.mutation('users', 'login'), {
		mode: 'promiseExit',
	})

	if (Result.isSuccess(userResult) && userResult.value) {
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
					const exit = await login({
						payload: { id, password },
						reactivityKeys: ['currentUser'],
					})
					if (Exit.isSuccess(exit)) {
						void navigate({ to: redirectTo || '/' })
					} else {
						setResponse(formResultFromExit(exit))
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
