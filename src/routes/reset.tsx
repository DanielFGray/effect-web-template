import { createFileRoute, useNavigate, useRouter } from '@tanstack/react-router'
import { createServerFn, useServerFn } from '@tanstack/react-start'
import { Effect } from 'effect'
import { useState } from 'react'

import { isValidPassword } from '../../shared/validation.js'
import { Form, formResultFromError, type FormResult } from '../components.js'
import { callApi } from '../lib/api.server.js'

type ActionResult = { ok: true; data: null } | { ok: false; error: FormResult }

const resetFn = createServerFn({ method: 'POST' })
	.validator((data: { userId: string; token: string; password: string }) => data)
	.handler(({ data }): Promise<ActionResult> =>
		callApi((api) =>
			api.users.resetPassword({ payload: data }).pipe(
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
	const router = useRouter()
	const { userId: userIdParam, token: tokenParam, redirectTo } = Route.useSearch()
	const [userId, setUserId] = useState(userIdParam ?? '')
	const [token, setToken] = useState(tokenParam ?? '')
	const [password, setPassword] = useState('')
	const [confirmPassword, setConfirmPassword] = useState('')
	const [response, setResponse] = useState<FormResult>()
	const reset = useServerFn(resetFn)

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
					if (!isValidPassword(password)) {
						setResponse({
							fieldErrors: {
								password: ['Password must be at least 8 characters'],
							},
						})
						return
					}
					const result = await reset({
						data: {
							userId,
							token,
							password,
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
