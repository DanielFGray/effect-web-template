import { useState } from 'react'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useAtomSet } from '@effect-atom/atom-react'
import { Exit, Schema } from 'effect'
import { ApiClient } from '../lib/api.js'
import { Form, formResultFromExit, type FormResult } from '../components.js'
import { Password } from '../../shared/schemas.js'

export const Route = createFileRoute('/reset')({
	validateSearch: (search: Record<string, unknown>) => ({
		userId: typeof search.userId === 'string' ? search.userId : undefined,
		token: typeof search.token === 'string' ? search.token : undefined,
		redirectTo: typeof search.redirectTo === 'string' ? search.redirectTo : undefined,
	}),
	component: ResetPass,
})

function ResetPass() {
	const navigate = useNavigate()
	const { userId: userIdParam, token: tokenParam, redirectTo } = Route.useSearch()
	const [userId, setUserId] = useState(userIdParam ?? '')
	const [token, setToken] = useState(tokenParam ?? '')
	const [password, setPassword] = useState('')
	const [confirmPassword, setConfirmPassword] = useState('')
	const [response, setResponse] = useState<FormResult>()
	const reset = useAtomSet(ApiClient.mutation('users', 'resetPassword'), {
		mode: 'promiseExit',
	})

	return (
		<div>
			<Form
				prefix="reset"
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
					const exit = await reset({
						payload: {
							userId,
							token,
							password: passwordCheck.right,
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
					<legend>reset password</legend>
					{userIdParam ? (
						<input name="userId" type="hidden" value={userId} />
					) : (
						<Form.Row
							name="userId"
							type="text"
							label="Enter your user id"
							value={userId}
							onChange={(e) => setUserId(e.target.value)}
						/>
					)}
					{tokenParam ? (
						<input name="token" type="hidden" value={token} />
					) : (
						<Form.Row
							name="token"
							type="text"
							label="Enter your reset token"
							value={token}
							onChange={(e) => setToken(e.target.value)}
						/>
					)}
					<Form.Row
						name="password"
						type="password"
						label="new password"
						autoComplete="new-password"
						value={password}
						onChange={(e) => setPassword(e.target.value)}
					/>
					<Form.Row
						name="confirmPassword"
						type="password"
						label="confirm password"
						autoComplete="new-password"
						value={confirmPassword}
						onChange={(e) => setConfirmPassword(e.target.value)}
					/>

					<div>
						<Form.Errors />
						<button type="submit" data-cy="reset-submit-button">
							reset password
						</button>
					</div>
				</fieldset>
			</Form>
		</div>
	)
}
