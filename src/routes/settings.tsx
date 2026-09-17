import {
	createFileRoute,
	redirect,
	useNavigate,
	useRouter,
	type ErrorComponentProps,
} from '@tanstack/react-router'
import { createServerFn, useServerFn } from '@tanstack/react-start'
import { Effect, Schema } from 'effect'
import { useState } from 'react'

import { withAuthContext } from '../../server/db.js'
import { Email } from '../../server/services/email.js'
import { Users } from '../../server/services/users.js'
import { formConstraints } from '../../shared/formConstraints.gen.js'
import {
	AddEmailPayload,
	ChangePasswordFormPayload,
	UpdateProfilePayload,
} from '../../shared/payloads.js'
import {
	Form,
	Spinner,
	UnverifiedAccountWarning,
	formResultFromError,
	formResultFromParseError,
	type FormResult,
} from '../components.js'
import { decodeFormAction, formDataRecord, type FormAction } from '../lib/formAction.js'
import { runServer } from '../lib/runtime.server.js'

type ActionResult<T = null> = { ok: true; data: T } | { ok: false; error: FormResult }

type EmailRowData = {
	id: string
	email: string
	is_verified: boolean
	is_primary: boolean
	created_at: string
}

type SettingsAction =
	| { type: 'profile'; values: Record<string, string>; response: FormResult }
	| { type: 'password'; values: Record<string, string>; response: FormResult }
	| { type: 'addEmail'; values: Record<string, string>; response: FormResult }
	| { type: 'email'; values: Record<string, string>; response: FormResult }
	| { type: 'deleteRequest'; values: Record<string, string>; response: FormResult }
	| { type: 'deleteConfirm'; values: Record<string, string>; response: FormResult }

const actionResponse = (
	type: SettingsAction['type'],
	values: Record<string, string>,
	response: FormResult,
) =>
	({
		type,
		values,
		response,
	}) as SettingsAction

const getEmails = createServerFn({ method: 'GET' }).handler(async () => {
	const emails = await runServer(Email.listMine().pipe(withAuthContext))
	return emails.map((email): EmailRowData => ({
		id: email.id,
		email: email.email,
		is_verified: email.is_verified,
		is_primary: email.is_primary,
		created_at:
			email.created_at instanceof Date
				? email.created_at.toISOString()
				: String(email.created_at),
	}))
})

const performUpdateProfile = (data: {
	username: string
	name: string | null
	avatar_url: string | null
	bio: string | null
}): Promise<ActionResult> =>
	runServer(
		Users.updateProfile(data).pipe(
			withAuthContext,
			Effect.as({ ok: true as const, data: null }),
			Effect.catchAll((err) =>
				Effect.succeed({ ok: false as const, error: formResultFromError(err) }),
			),
		),
	)

const updateProfileFn = createServerFn({ method: 'POST' })
	.validator(
		(data: {
			username: string
			name: string | null
			avatar_url: string | null
			bio: string | null
		}) => data,
	)
	.handler(({ data }): Promise<ActionResult> => performUpdateProfile(data))

const performChangePassword = (data: {
	oldPassword: string
	newPassword: string
}): Promise<ActionResult> =>
	runServer(
		Users.changePassword(data).pipe(
			withAuthContext,
			Effect.as({ ok: true as const, data: null }),
			Effect.catchAll((err) =>
				Effect.succeed({ ok: false as const, error: formResultFromError(err) }),
			),
		),
	)

const changePasswordFn = createServerFn({ method: 'POST' })
	.validator((data: { oldPassword: string; newPassword: string }) => data)
	.handler(({ data }): Promise<ActionResult> => performChangePassword(data))

const performAddEmail = (data: { email: string }): Promise<ActionResult> =>
	runServer(
		Email.addEmail(data).pipe(
			withAuthContext,
			Effect.as({ ok: true as const, data: null }),
			Effect.catchAll((err) =>
				Effect.succeed({ ok: false as const, error: formResultFromError(err) }),
			),
		),
	)

const addEmailFn = createServerFn({ method: 'POST' })
	.validator((data: { email: string }) => data)
	.handler(({ data }): Promise<ActionResult> => performAddEmail(data))

const performResendVerification = (data: { id: string }): Promise<ActionResult> =>
	runServer(
		Email.resendVerificationEmail({ emailId: data.id }).pipe(
			withAuthContext,
			Effect.as({ ok: true as const, data: null }),
			Effect.catchAll((err) =>
				Effect.succeed({ ok: false as const, error: formResultFromError(err) }),
			),
		),
	)

const performRemoveEmail = (data: { id: string }): Promise<ActionResult> =>
	runServer(
		Email.removeEmail({ emailId: data.id }).pipe(
			withAuthContext,
			Effect.as({ ok: true as const, data: null }),
			Effect.catchAll((err) =>
				Effect.succeed({ ok: false as const, error: formResultFromError(err) }),
			),
		),
	)

const performMakeEmailPrimary = (data: { id: string }): Promise<ActionResult> =>
	runServer(
		Email.makeEmailPrimary({ emailId: data.id }).pipe(
			withAuthContext,
			Effect.as({ ok: true as const, data: null }),
			Effect.catchAll((err) =>
				Effect.succeed({ ok: false as const, error: formResultFromError(err) }),
			),
		),
	)

const requestDeletionFn = createServerFn({ method: 'POST' }).handler(
	(): Promise<ActionResult> =>
		runServer(
			Users.requestAccountDeletion().pipe(
				withAuthContext,
				Effect.as({ ok: true as const, data: null }),
				Effect.catchAll((err) =>
					Effect.succeed({
						ok: false as const,
						error: formResultFromError(err),
					}),
				),
			),
		),
)

const performRequestDeletion = (): Promise<ActionResult> =>
	runServer(
		Users.requestAccountDeletion().pipe(
			withAuthContext,
			Effect.as({ ok: true as const, data: null }),
			Effect.catchAll((err) =>
				Effect.succeed({ ok: false as const, error: formResultFromError(err) }),
			),
		),
	)

const performConfirmDeletion = (data: {
	token: string
}): Promise<ActionResult<{ confirm_account_deletion: boolean }>> =>
	runServer(
		Users.confirmAccountDeletion(data).pipe(
			withAuthContext,
			Effect.map((result): ActionResult<{ confirm_account_deletion: boolean }> => ({
				ok: true,
				data: result,
			})),
			Effect.catchAll((err) =>
				Effect.succeed({ ok: false as const, error: formResultFromError(err) }),
			),
		),
	)

const confirmDeletionFn = createServerFn({ method: 'POST' })
	.validator((data: { token: string }) => data)
	.handler(({ data }): Promise<ActionResult<{ confirm_account_deletion: boolean }>> =>
		runServer(
			Users.confirmAccountDeletion(data).pipe(
				withAuthContext,
				Effect.map((result): ActionResult<{ confirm_account_deletion: boolean }> => ({
					ok: true,
					data: result,
				})),
				Effect.catchAll((err) =>
					Effect.succeed({
						ok: false as const,
						error: formResultFromError(err),
					}),
				),
			),
		),
	)

export const Route = createFileRoute('/settings')({
	validateSearch: (search: Record<string, unknown>) => ({
		delete_token:
			typeof search.delete_token === 'string' ? search.delete_token : undefined,
		showAddEmail: search.showAddEmail != null ? String(search.showAddEmail) : undefined,
		passwordUpdated: search.passwordUpdated === '1' ? true : undefined,
	}),
	beforeLoad: ({ context, serverContext }) => {
		if (!context.user) throw redirect({ to: '/login' })
		return { settingsAction: serverContext?.settingsAction }
	},
	server: {
		handlers: {
			POST: async ({ request, next }) => {
				const record = formDataRecord(await request.formData())
				const action = record.action
				const values = { ...record }
				delete values.action
				const invalidAction = (type: SettingsAction['type']) =>
					next({
						context: {
							settingsAction: actionResponse(type, values, {
								formErrors: ['Invalid form submission'],
							}) satisfies FormAction<typeof values>,
						},
					})

				switch (action) {
					case 'profile': {
						const decoded = decodeFormAction(UpdateProfilePayload, values, values)
						if (!decoded.ok) {
							return next({
								context: {
									settingsAction: actionResponse(
										'profile',
										values,
										decoded.action.response,
									),
								},
							})
						}
						const result = await performUpdateProfile(decoded.payload)
						if (result.ok)
							throw redirect({ to: '/settings', search: { passwordUpdated: true } })
						return next({
							context: {
								settingsAction: actionResponse('profile', values, result.error),
							},
						})
					}
					case 'password': {
						const decoded = decodeFormAction(ChangePasswordFormPayload, values, {})
						if (!decoded.ok) {
							return next({
								context: {
									settingsAction: actionResponse('password', {}, decoded.action.response),
								},
							})
						}
						const result = await performChangePassword(decoded.payload)
						if (result.ok)
							throw redirect({ to: '/settings', search: { passwordUpdated: true } })
						return next({
							context: { settingsAction: actionResponse('password', {}, result.error) },
						})
					}
					case 'addEmail': {
						const decoded = decodeFormAction(AddEmailPayload, values, values)
						if (!decoded.ok) {
							return next({
								context: {
									settingsAction: actionResponse(
										'addEmail',
										values,
										decoded.action.response,
									),
								},
							})
						}
						const result = await performAddEmail(decoded.payload)
						if (result.ok) throw redirect({ to: '/settings' })
						return next({
							context: {
								settingsAction: actionResponse('addEmail', values, result.error),
							},
						})
					}
					case 'resendVerification': {
						const decoded = decodeFormAction(
							Schema.Struct({ id: Schema.String }),
							values,
							values,
						)
						if (!decoded.ok)
							return next({
								context: {
									settingsAction: actionResponse(
										'email',
										values,
										decoded.action.response,
									),
								},
							})
						const result = await performResendVerification(decoded.payload)
						if (result.ok) throw redirect({ to: '/settings' })
						return next({
							context: { settingsAction: actionResponse('email', values, result.error) },
						})
					}
					case 'deleteEmail': {
						const decoded = decodeFormAction(
							Schema.Struct({ id: Schema.String }),
							values,
							values,
						)
						if (!decoded.ok)
							return next({
								context: {
									settingsAction: actionResponse(
										'email',
										values,
										decoded.action.response,
									),
								},
							})
						const result = await performRemoveEmail(decoded.payload)
						if (result.ok) throw redirect({ to: '/settings' })
						return next({
							context: { settingsAction: actionResponse('email', values, result.error) },
						})
					}
					case 'makePrimary': {
						const decoded = decodeFormAction(
							Schema.Struct({ id: Schema.String }),
							values,
							values,
						)
						if (!decoded.ok)
							return next({
								context: {
									settingsAction: actionResponse(
										'email',
										values,
										decoded.action.response,
									),
								},
							})
						const result = await performMakeEmailPrimary(decoded.payload)
						if (result.ok) throw redirect({ to: '/settings' })
						return next({
							context: { settingsAction: actionResponse('email', values, result.error) },
						})
					}
					case 'deleteRequest': {
						const result = await performRequestDeletion()
						if (result.ok) {
							return next({
								context: {
									settingsAction: actionResponse(
										'deleteRequest',
										{},
										{ formMessages: ['request sent'] },
									),
								},
							})
						}
						return next({
							context: {
								settingsAction: actionResponse('deleteRequest', {}, result.error),
							},
						})
					}
					case 'deleteConfirm': {
						const decoded = decodeFormAction(
							Schema.Struct({ token: Schema.String }),
							values,
							values,
						)
						if (!decoded.ok)
							return next({
								context: {
									settingsAction: actionResponse(
										'deleteConfirm',
										values,
										decoded.action.response,
									),
								},
							})
						const result = await performConfirmDeletion(decoded.payload)
						if (result.ok && result.data.confirm_account_deletion)
							throw redirect({ to: '/' })
						if (!result.ok)
							return next({
								context: {
									settingsAction: actionResponse('deleteConfirm', values, result.error),
								},
							})
						return next({
							context: {
								settingsAction: actionResponse('deleteConfirm', values, {
									formErrors: ['Account deletion was not confirmed'],
								}),
							},
						})
					}
					default:
						return invalidAction('profile')
				}
			},
		},
	},
	loader: () => getEmails(),
	pendingComponent: Pending,
	errorComponent: RouteError,
	component: Settings,
})

type AuthUser = NonNullable<ReturnType<typeof Route.useRouteContext>['user']>

function Pending() {
	return <Spinner />
}

function RouteError({ error }: ErrorComponentProps) {
	return (
		<div className="field-error">
			{error instanceof Error ? error.message : 'Failed to load settings'}
		</div>
	)
}

function Settings() {
	const { user } = Route.useRouteContext()
	const emails = Route.useLoaderData()

	if (!user) return null

	return (
		<>
			<ProfileSettings currentUser={user} />
			<PasswordSettings />
			<EmailSettings currentUser={user} emails={emails} />
			<DeleteAccount />
		</>
	)
}

function ProfileSettings({ currentUser }: { currentUser: AuthUser }) {
	const action = Route.useRouteContext().settingsAction
	const profileAction = action?.type === 'profile' ? action : undefined
	const [username, setUsername] = useState(
		profileAction?.values.username ?? currentUser.username,
	)
	const [name, setName] = useState(profileAction?.values.name ?? currentUser.name ?? '')
	const [avatarUrl, setAvatarUrl] = useState(
		profileAction?.values.avatar_url ?? currentUser.avatar_url ?? '',
	)
	const [bio, setBio] = useState(profileAction?.values.bio ?? '')
	const [response, setResponse] = useState<FormResult | undefined>(
		profileAction?.response,
	)
	const updateProfile = useServerFn(updateProfileFn)
	const router = useRouter()

	return (
		<Form
			prefix="profile"
			method="post"
			response={response}
			onSubmit={async (ev) => {
				ev.preventDefault()
				setResponse(undefined)
				const decoded = Schema.decodeUnknownEither(UpdateProfilePayload)({
					username,
					name,
					avatar_url: avatarUrl,
					bio,
				})
				if (decoded._tag === 'Left') {
					setResponse(formResultFromParseError(decoded.left))
					return
				}
				const result = await updateProfile({
					data: decoded.right,
				})
				if (result.ok) {
					await router.invalidate()
				} else {
					setResponse(result.error)
				}
			}}
		>
			<input type="hidden" name="action" value="profile" />
			<fieldset>
				<legend>profile settings</legend>
				<Form.Row
					{...formConstraints['users.updateProfile'].username}
					name="username"
					type="text"
					value={username}
					onChange={(e) => setUsername(e.target.value)}
				/>
				<Form.Row
					{...formConstraints['users.updateProfile'].name}
					name="name"
					type="text"
					value={name}
					onChange={(e) => setName(e.target.value)}
				/>
				<Form.Row
					{...formConstraints['users.updateProfile'].avatar_url}
					label="avatar"
					name="avatar_url"
					type="text"
					value={avatarUrl}
					onChange={(e) => setAvatarUrl(e.target.value)}
				/>
				<Form.Row
					{...formConstraints['users.updateProfile'].bio}
					name="bio"
					type="textarea"
					value={bio}
					onChange={(e) => setBio(e.target.value)}
				/>
				<div>
					<Form.Errors />
					<button type="submit">update</button>
				</div>
			</fieldset>
		</Form>
	)
}

function PasswordSettings() {
	const action = Route.useRouteContext().settingsAction
	const passwordAction = action?.type === 'password' ? action : undefined
	const { passwordUpdated } = Route.useSearch()
	const [response, setResponse] = useState<FormResult | undefined>(
		passwordAction?.response ??
			(passwordUpdated ? { formMessages: ['Password updated'] } : undefined),
	)
	const changePassword = useServerFn(changePasswordFn)

	return (
		<Form
			prefix="settings"
			method="post"
			response={response}
			onSubmit={async (ev) => {
				ev.preventDefault()
				const form = ev.currentTarget
				setResponse(undefined)
				const decoded = Schema.decodeUnknownEither(ChangePasswordFormPayload)(
					Object.fromEntries(new FormData(form).entries()),
				)
				if (decoded._tag === 'Left') {
					setResponse(formResultFromParseError(decoded.left))
					return
				}
				const result = await changePassword({
					data: decoded.right,
				})
				if (result.ok) {
					form.reset()
					setResponse({ formMessages: ['Password updated'] })
				} else {
					setResponse(result.error)
				}
			}}
			data-cy="settings-password-form"
		>
			<input type="hidden" name="action" value="password" />
			<fieldset>
				<legend>password settings</legend>

				<Form.Row
					{...formConstraints['users.changePassword'].oldPassword}
					label="old password"
					type="password"
					name="oldPassword"
					autoComplete="current-password"
					defaultValue={passwordAction?.values.oldPassword ?? ''}
				/>

				<Form.Row
					{...formConstraints['users.changePassword'].newPassword}
					label="new password"
					type="password"
					name="newPassword"
					autoComplete="new-password"
				/>

				<Form.Row
					label="confirm password"
					type="password"
					name="confirmPassword"
					autoComplete="new-password"
				/>

				<div>
					<Form.Errors />
					<button type="submit" data-cy="settings-change-password-submit">
						update
					</button>
				</div>
			</fieldset>
		</Form>
	)
}

function EmailSettings({
	currentUser,
	emails,
}: {
	currentUser: AuthUser
	emails: ReadonlyArray<EmailRowData>
}) {
	return (
		<fieldset>
			<legend>email settings</legend>
			<ul data-cy="email-settings-list">
				{emails.map((email) => (
					<EmailRow key={email.id} email={email} hasOtherEmails={emails.length > 1} />
				))}
			</ul>
			<div>
				{currentUser.is_verified ? null : <UnverifiedAccountWarning />}
				<AddEmailForm />
			</div>
		</fieldset>
	)
}

function EmailRow({
	email,
	hasOtherEmails,
}: {
	email: EmailRowData
	hasOtherEmails: boolean
}) {
	const action = Route.useRouteContext().settingsAction
	const response =
		action?.type === 'email' && action.values.id === email.id
			? action.response
			: undefined
	const canDelete = !email.is_primary && hasOtherEmails

	return (
		<li
			className="flex-row justify-between"
			data-cy={`email-settings-item-${email.email.replace(/\W/g, '-')}`}
		>
			<div>
				{`✉️ ${email.email} `}
				<span
					title={
						email.is_verified
							? 'Verified'
							: 'Pending verification (please check your inbox / spam folder'
					}
				>
					{email.is_verified ? (
						'✅ '
					) : (
						<span data-cy="email-settings-indicator-unverified">(unverified)</span>
					)}
				</span>
				<div>Added {new Date(email.created_at).toLocaleString()}</div>
			</div>
			<div>
				{response?.formErrors?.map((error: string) => (
					<div className="field-error" key={error}>
						{error}
					</div>
				))}
				{email.is_primary && (
					<span className="primary_indicator" data-cy="email-settings-indicator-primary">
						Primary
					</span>
				)}
				{canDelete && (
					<form method="post">
						<input type="hidden" name="action" value="deleteEmail" />
						<input type="hidden" name="id" value={email.id} />
						<button type="submit" data-cy="email-settings-button-delete">
							Delete
						</button>
					</form>
				)}
				{!email.is_verified && (
					<form method="post">
						<input type="hidden" name="action" value="resendVerification" />
						<input type="hidden" name="id" value={email.id} />
						<button type="submit">Resend verification</button>
					</form>
				)}
				{email.is_verified && !email.is_primary && (
					<form method="post">
						<input type="hidden" name="action" value="makePrimary" />
						<input type="hidden" name="id" value={email.id} />
						<button type="submit" data-cy="email-settings-button-makeprimary">
							Make primary
						</button>
					</form>
				)}
			</div>
		</li>
	)
}

function AddEmailForm() {
	const { showAddEmail } = Route.useSearch()
	const action = Route.useRouteContext().settingsAction
	const addEmailAction = action?.type === 'addEmail' ? action : undefined
	const [showForm, setShowForm] = useState(
		Boolean(showAddEmail) || Boolean(addEmailAction),
	)
	const [email, setEmail] = useState(addEmailAction?.values.email ?? '')
	const [response, setResponse] = useState<FormResult | undefined>(
		addEmailAction?.response,
	)
	const addEmail = useServerFn(addEmailFn)
	const router = useRouter()

	if (!showForm) {
		return (
			<a href="/settings?showAddEmail=1" data-cy="settings-show-add-email-button">
				Add email
			</a>
		)
	}

	return (
		<Form
			prefix="settings"
			method="post"
			response={response}
			data-cy="settings-email-form"
			onSubmit={async (ev) => {
				ev.preventDefault()
				setResponse(undefined)
				const decoded = Schema.decodeUnknownEither(AddEmailPayload)({ email })
				if (decoded._tag === 'Left') {
					setResponse(formResultFromParseError(decoded.left))
					return
				}
				const result = await addEmail({
					data: decoded.right,
				})
				if (result.ok) {
					setEmail('')
					setShowForm(false)
					await router.invalidate()
				} else {
					setResponse(result.error)
				}
			}}
		>
			<input type="hidden" name="action" value="addEmail" />
			<Form.Row
				{...formConstraints['email.addEmail'].email}
				label="new email"
				name="email"
				value={email}
				onChange={(e) => setEmail(e.target.value)}
			/>
			<div>
				<Form.Errors />
				<button type="submit" data-cy="settings-email-submit">
					add email
				</button>
			</div>
		</Form>
	)
}

function DeleteAccount() {
	const action = Route.useRouteContext().settingsAction
	const deleteRequestAction = action?.type === 'deleteRequest' ? action : undefined
	const deleteConfirmAction = action?.type === 'deleteConfirm' ? action : undefined
	const [response, setResponse] = useState<FormResult | undefined>(
		deleteConfirmAction?.response ?? deleteRequestAction?.response,
	)
	const [requested, setRequested] = useState(Boolean(deleteRequestAction))
	const { delete_token: token } = Route.useSearch()
	const navigate = useNavigate()
	const requestDeletion = useServerFn(requestDeletionFn)
	const confirmDeletion = useServerFn(confirmDeletionFn)

	if (token) {
		return (
			<form
				method="post"
				onSubmit={async (ev) => {
					ev.preventDefault()
					setResponse(undefined)
					const result = await confirmDeletion({ data: { token } })
					if (result.ok && result.data.confirm_account_deletion) {
						void navigate({ to: '/' })
					} else if (!result.ok) {
						setResponse(result.error)
					}
				}}
			>
				<input type="hidden" name="action" value="deleteConfirm" />
				<input type="hidden" name="token" value={token} />
				<fieldset>
					<legend>danger zone</legend>
					<p>
						This is it. <b>Press this button and your account will be deleted.</b>{' '}
						We&apos;re sorry to see you go, please don&apos;t hesitate to reach out and
						let us know why you no longer want your account.
					</p>
					{response?.formErrors?.map((e) => (
						<div className="field-error" key={e}>
							{e}
						</div>
					))}
					<p>
						<button type="submit" data-cy="account-delete-confirm-button">
							PERMANENTLY DELETE MY ACCOUNT
						</button>
					</p>
				</fieldset>
			</form>
		)
	}

	if (requested) {
		return (
			<fieldset>
				<legend>danger zone</legend>
				<div>
					You&apos;ve been sent an email with a confirmation link in it, you must click it
					to confirm that you are the account holder so that you may continue deleting
					your account.
				</div>
			</fieldset>
		)
	}

	return (
		<form
			method="post"
			onSubmit={async (ev) => {
				ev.preventDefault()
				setResponse(undefined)
				const result = await requestDeletion()
				if (result.ok) {
					setRequested(true)
				} else {
					setResponse(result.error)
				}
			}}
		>
			<input type="hidden" name="action" value="deleteRequest" />
			<fieldset>
				<legend>danger zone</legend>
				<div>
					{response?.formErrors?.map((e) => (
						<div className="field-error" key={e}>
							{e}
						</div>
					))}
					<button type="submit" name="submit" data-cy="account-delete-request-button">
						I want to delete my account
					</button>
				</div>
			</fieldset>
		</form>
	)
}
