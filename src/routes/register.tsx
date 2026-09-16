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
import { RegisterFormPayload, RegisterPayload } from '../../shared/payloads.js'
import {
	Form,
	formResultFromError,
	formResultFromParseError,
	type FormResult,
} from '../components.js'
import { callApi } from '../lib/api.server.js'
import {
	type ActionResult,
	decodeFormAction,
	type FormAction,
	formDataRecord,
} from '../lib/formAction.js'

const performRegister = (payload: typeof RegisterPayload.Type): Promise<ActionResult> =>
	callApi((api) =>
		api.users.register({ payload }).pipe(
			Effect.map((): ActionResult => ({ ok: true, data: null })),
			Effect.catchAll((err) =>
				Effect.succeed({
					ok: false as const,
					error: formResultFromError(err),
				}),
			),
		),
	)

const registerFn = createServerFn({ method: 'POST' })
	.validator((data: { username: string; password: string; email: string | null }) => data)
	.handler(({ data }): Promise<ActionResult> => performRegister(data))

export const Route = createFileRoute('/register')({
	validateSearch: (search: Record<string, unknown>) => ({
		redirectTo: typeof search.redirectTo === 'string' ? search.redirectTo : undefined,
	}),
	server: {
		handlers: {
			POST: async ({ request, next }) => {
				const record = formDataRecord(await request.formData())
				const values = {
					username: record.username ?? '',
					email: record.email ?? '',
				}

				const decoded = decodeFormAction(RegisterFormPayload, record, values)
				if (!decoded.ok) {
					return next({
						context: {
							registerAction: decoded.action satisfies FormAction<typeof values>,
						},
					})
				}

				const result = await performRegister(decoded.payload)

				if (result.ok) {
					const redirectTo = new URL(request.url).searchParams.get('redirectTo')
					throw redirect({ to: redirectTo || '/' })
				}

				return next({
					context: {
						registerAction: {
							values: {
								username: decoded.payload.username,
								email: decoded.payload.email ?? '',
							},
							response: result.error,
						} satisfies FormAction<typeof values>,
					},
				})
			},
		},
	},
	beforeLoad: ({ serverContext }) => ({
		registerAction: serverContext?.registerAction,
	}),
	component: Register,
})

function Register() {
	const { user, registerAction } = Route.useRouteContext()
	const [username, setUsername] = useState(registerAction?.values.username ?? '')
	const [email, setEmail] = useState(registerAction?.values.email ?? '')
	const [password, setPassword] = useState('')
	const [confirmPassword, setConfirmPassword] = useState('')
	const [response, setResponse] = useState<FormResult | undefined>(
		registerAction?.response,
	)
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
				method="post"
				response={response}
				onSubmit={async (ev) => {
					ev.preventDefault()
					setResponse(undefined)

					const decoded = Schema.decodeUnknownEither(RegisterFormPayload)({
						username,
						password,
						email,
						confirmPassword,
					})
					if (decoded._tag === 'Left') {
						setResponse(formResultFromParseError(decoded.left))
						return
					}

					const result = await register({ data: decoded.right })
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
