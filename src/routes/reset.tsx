import { createFileRoute, redirect, useNavigate, useRouter } from '@tanstack/react-router'
import { createServerFn, useServerFn } from '@tanstack/react-start'
import { Effect, Schema } from 'effect'
import { useState } from 'react'

import { Users } from '../../server/services/users.js'
import { formConstraints } from '../../shared/formConstraints.gen.js'
import { ResetPasswordFormPayload, ResetPasswordPayload } from '../../shared/payloads.js'
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

const performReset = (payload: typeof ResetPasswordPayload.Type): Promise<ActionResult> =>
	runServer(
		Users.resetPassword(payload).pipe(
			Effect.map((): ActionResult => ({ ok: true, data: null })),
			Effect.catchAll((err) =>
				Effect.succeed({
					ok: false as const,
					error: formResultFromError(err),
				}),
			),
		),
	)

const resetFn = createServerFn({ method: 'POST' })
	.validator((data: { userId: string; token: string; password: string }) => data)
	.handler(({ data }): Promise<ActionResult> => performReset(data))

export const Route = createFileRoute('/reset')({
	validateSearch: (search: Record<string, unknown>) => ({
		userId: typeof search.userId === 'string' ? search.userId : undefined,
		token: typeof search.token === 'string' ? search.token : undefined,
		redirectTo: typeof search.redirectTo === 'string' ? search.redirectTo : undefined,
	}),
	server: {
		handlers: {
			POST: async ({ request, next }) => {
				const record = formDataRecord(await request.formData())
				// userId/token come from hidden inputs when the email link supplied them
				// in the query string — native submit has no other way to carry them.
				const values = {
					userId: record.userId ?? '',
					token: record.token ?? '',
				}

				const decoded = decodeFormAction(ResetPasswordFormPayload, record, values)
				if (!decoded.ok) {
					return next({
						context: {
							resetAction: decoded.action satisfies FormAction<typeof values>,
						},
					})
				}

				const result = await performReset(decoded.payload)

				if (result.ok) {
					const redirectTo = new URL(request.url).searchParams.get('redirectTo')
					throw redirect({ to: redirectTo || '/' })
				}

				return next({
					context: {
						resetAction: {
							values: {
								userId: decoded.payload.userId,
								token: decoded.payload.token,
							},
							response: result.error,
						} satisfies FormAction<typeof values>,
					},
				})
			},
		},
	},
	beforeLoad: ({ serverContext }) => ({
		resetAction: serverContext?.resetAction,
	}),
	component: ResetPass,
})

function ResetPass() {
	const { resetAction } = Route.useRouteContext()
	const navigate = useNavigate()
	const router = useRouter()
	const { userId: userIdParam, token: tokenParam, redirectTo } = Route.useSearch()
	const [userId, setUserId] = useState(resetAction?.values.userId ?? userIdParam ?? '')
	const [token, setToken] = useState(resetAction?.values.token ?? tokenParam ?? '')
	const [password, setPassword] = useState('')
	const [confirmPassword, setConfirmPassword] = useState('')
	const [response, setResponse] = useState<FormResult | undefined>(resetAction?.response)
	const reset = useServerFn(resetFn)

	return (
		<div>
			<Form
				prefix="reset"
				method="post"
				response={response}
				onSubmit={async (ev) => {
					ev.preventDefault()
					setResponse(undefined)
					const decoded = Schema.decodeUnknownEither(ResetPasswordFormPayload)({
						userId,
						token,
						password,
						confirmPassword,
					})
					if (decoded._tag === 'Left') {
						setResponse(formResultFromParseError(decoded.left))
						return
					}
					const result = await reset({
						data: decoded.right,
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
						{...formConstraints['users.resetPassword'].password}
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
