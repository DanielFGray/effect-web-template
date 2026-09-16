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

import { formConstraints } from '../../shared/formConstraints.gen.js'
import {
	AddEmailPayload,
	ChangePasswordPayload,
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
import { callApi } from '../lib/api.server.js'

type ActionResult<T = null> = { ok: true; data: T } | { ok: false; error: FormResult }

type EmailRowData = {
	id: string
	email: string
	is_verified: boolean
	is_primary: boolean
	created_at: string
}

const getEmails = createServerFn({ method: 'GET' }).handler(async () => {
	const emails = await callApi((api) => api.email.list())
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

const updateProfileFn = createServerFn({ method: 'POST' })
	.validator(
		(data: {
			username: string
			name: string | null
			avatar_url: string | null
			bio: string | null
		}) => data,
	)
	.handler(({ data }): Promise<ActionResult> =>
		callApi((api) =>
			api.users.updateProfile({ payload: data }).pipe(
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

const changePasswordFn = createServerFn({ method: 'POST' })
	.validator((data: { oldPassword: string; newPassword: string }) => data)
	.handler(({ data }): Promise<ActionResult> =>
		callApi((api) =>
			api.users.changePassword({ payload: data }).pipe(
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

const addEmailFn = createServerFn({ method: 'POST' })
	.validator((data: { email: string }) => data)
	.handler(({ data }): Promise<ActionResult> =>
		callApi((api) =>
			api.email.addEmail({ payload: data }).pipe(
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

const resendVerificationFn = createServerFn({ method: 'POST' })
	.validator((data: { id: string }) => data)
	.handler(({ data }): Promise<ActionResult> =>
		callApi((api) =>
			api.email.resendVerification({ path: { id: data.id } }).pipe(
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

const removeEmailFn = createServerFn({ method: 'POST' })
	.validator((data: { id: string }) => data)
	.handler(({ data }): Promise<ActionResult> =>
		callApi((api) =>
			api.email.removeEmail({ path: { id: data.id } }).pipe(
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

const makeEmailPrimaryFn = createServerFn({ method: 'POST' })
	.validator((data: { id: string }) => data)
	.handler(({ data }): Promise<ActionResult> =>
		callApi((api) =>
			api.email.makeEmailPrimary({ path: { id: data.id } }).pipe(
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

const requestDeletionFn = createServerFn({ method: 'POST' }).handler(
	(): Promise<ActionResult> =>
		callApi((api) =>
			api.users.requestDeletion().pipe(
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

const confirmDeletionFn = createServerFn({ method: 'POST' })
	.validator((data: { token: string }) => data)
	.handler(({ data }): Promise<ActionResult<{ confirm_account_deletion: boolean }>> =>
		callApi((api) =>
			api.users.confirmDeletion({ payload: data }).pipe(
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
	}),
	beforeLoad: ({ context }) => {
		if (!context.user) throw redirect({ to: '/login' })
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
	const [username, setUsername] = useState(currentUser.username)
	const [name, setName] = useState(currentUser.name ?? '')
	const [avatarUrl, setAvatarUrl] = useState(currentUser.avatar_url ?? '')
	const [bio, setBio] = useState('')
	const [response, setResponse] = useState<FormResult>()
	const updateProfile = useServerFn(updateProfileFn)
	const router = useRouter()

	return (
		<Form
			prefix="profile"
			response={response}
			onSubmit={async (ev) => {
				ev.preventDefault()
				setResponse(undefined)
				const decoded = Schema.decodeUnknownEither(UpdateProfilePayload)({
					username,
					name: name.trim() === '' ? null : name,
					avatar_url: avatarUrl.trim() === '' ? null : avatarUrl,
					bio: bio.trim() === '' ? null : bio,
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
	const [oldPassword, setOldPassword] = useState('')
	const [password, setPassword] = useState('')
	const [confirmPassword, setConfirmPassword] = useState('')
	const [response, setResponse] = useState<FormResult>()
	const changePassword = useServerFn(changePasswordFn)

	return (
		<Form
			prefix="settings"
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
				const decoded = Schema.decodeUnknownEither(ChangePasswordPayload)({
					oldPassword,
					newPassword: password,
				})
				if (decoded._tag === 'Left') {
					setResponse(formResultFromParseError(decoded.left))
					return
				}
				const result = await changePassword({
					data: decoded.right,
				})
				if (result.ok) {
					setOldPassword('')
					setPassword('')
					setConfirmPassword('')
					setResponse({ formMessages: ['Password updated'] })
				} else {
					setResponse(result.error)
				}
			}}
			data-cy="settings-password-form"
		>
			<fieldset>
				<legend>password settings</legend>

				<Form.Row
					{...formConstraints['users.changePassword'].oldPassword}
					label="old password"
					type="password"
					name="oldPassword"
					autoComplete="current-password"
					value={oldPassword}
					onChange={(e) => setOldPassword(e.target.value)}
				/>

				<Form.Row
					{...formConstraints['users.changePassword'].newPassword}
					label="new password"
					type="password"
					name="newPassword"
					autoComplete="new-password"
					value={password}
					onChange={(e) => setPassword(e.target.value)}
				/>

				<Form.Row
					label="confirm password"
					type="password"
					name="confirmPassword"
					autoComplete="new-password"
					value={confirmPassword}
					onChange={(e) => setConfirmPassword(e.target.value)}
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
	const [response, setResponse] = useState<FormResult>()
	const canDelete = !email.is_primary && hasOtherEmails
	const resend = useServerFn(resendVerificationFn)
	const remove = useServerFn(removeEmailFn)
	const makePrimary = useServerFn(makeEmailPrimaryFn)
	const router = useRouter()

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
			<Form
				prefix="settings"
				response={response}
				onSubmit={async (ev) => {
					ev.preventDefault()
					setResponse(undefined)
					const submitter = (ev.nativeEvent as SubmitEvent).submitter
					const type =
						submitter instanceof HTMLButtonElement
							? submitter.getAttribute('value')
							: null
					let result: ActionResult
					switch (type) {
						case 'resendValidation':
							result = await resend({ data: { id: email.id } })
							break
						case 'deleteEmail':
							result = await remove({ data: { id: email.id } })
							break
						case 'makePrimary':
							result = await makePrimary({ data: { id: email.id } })
							break
						default:
							return
					}
					if (result.ok) {
						await router.invalidate()
					} else {
						setResponse(result.error)
					}
				}}
			>
				<Form.Errors />
				{email.is_primary && (
					<span className="primary_indicator" data-cy="email-settings-indicator-primary">
						Primary
					</span>
				)}
				{canDelete && (
					<button
						type="submit"
						name="type"
						value="deleteEmail"
						data-cy="email-settings-button-delete"
					>
						Delete
					</button>
				)}
				{!email.is_verified && (
					<button type="submit" name="type" value="resendValidation">
						Resend verification
					</button>
				)}
				{email.is_verified && !email.is_primary && (
					<button
						type="submit"
						name="type"
						value="makePrimary"
						data-cy="email-settings-button-makeprimary"
					>
						Make primary
					</button>
				)}
			</Form>
		</li>
	)
}

function AddEmailForm() {
	const { showAddEmail } = Route.useSearch()
	const [showForm, setShowForm] = useState(Boolean(showAddEmail))
	const [email, setEmail] = useState('')
	const [response, setResponse] = useState<FormResult>()
	const addEmail = useServerFn(addEmailFn)
	const router = useRouter()

	if (!showForm) {
		return (
			<form
				onSubmit={(ev) => {
					ev.preventDefault()
					setShowForm(true)
				}}
			>
				<button
					type="submit"
					name="showAddEmail"
					value="1"
					data-cy="settings-show-add-email-button"
				>
					Add email
				</button>
			</form>
		)
	}

	return (
		<Form
			prefix="settings"
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
	const [response, setResponse] = useState<FormResult>()
	const [requested, setRequested] = useState(false)
	const { delete_token: token } = Route.useSearch()
	const navigate = useNavigate()
	const requestDeletion = useServerFn(requestDeletionFn)
	const confirmDeletion = useServerFn(confirmDeletionFn)

	if (token) {
		return (
			<form
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
