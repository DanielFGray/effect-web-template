import { useState } from 'react'
import {
	createFileRoute,
	Link,
	useNavigate,
} from '@tanstack/react-router'
import { Result, useAtomSet, useAtomValue } from '@effect-atom/atom-react'
import { Exit, Schema } from 'effect'
import { ApiClient, currentUserAtom } from '../lib/api.js'
import { Form, formResultFromExit, type FormResult } from '../components.js'
import { Password, EmailSchema } from '../../shared/schemas.js'

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
	const userResult = useAtomValue(currentUserAtom)
	const navigate = useNavigate()
	const { redirectTo } = Route.useSearch()
	const register = useAtomSet(ApiClient.mutation('users', 'register'), {
		mode: 'promiseExit',
	})

	if (Result.isSuccess(userResult) && userResult.value) {
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

					const passwordCheck = Schema.decodeUnknownEither(Password)(password)
					if (passwordCheck._tag === 'Left') {
						setResponse({
							fieldErrors: {
								password: ['Password must be at least 8 characters'],
							},
						})
						return
					}

					let emailPayload: string | null = null
					if (email.trim() !== '') {
						const emailCheck = Schema.decodeUnknownEither(EmailSchema)(email)
						if (emailCheck._tag === 'Left') {
							setResponse({
								fieldErrors: { email: ['Invalid email address'] },
							})
							return
						}
						emailPayload = emailCheck.right
					}

					const exit = await register({
						payload: {
							username,
							password: passwordCheck.right,
							email: emailPayload,
						},
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
					<legend>register</legend>

					<Form.Row
						name="username"
						type="text"
						value={username}
						onChange={(e) => setUsername(e.target.value)}
					/>
					<Form.Row
						name="email"
						type="text"
						value={email}
						onChange={(e) => setEmail(e.target.value)}
					/>
					<Form.Row
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
