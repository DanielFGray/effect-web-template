import { useState } from 'react'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { Result, useAtomSet, useAtomValue } from '@effect-atom/atom-react'
import { Exit, Schema } from 'effect'
import {
	ApiClient,
	currentUserAtom,
	emailsListAtom,
} from '../lib/api.js'
import {
	Form,
	Spinner,
	UnverifiedAccountWarning,
	formResultFromExit,
	type FormResult,
} from '../components.js'
import {
	EmailSchema,
	Password,
	AuthenticatedUser,
	UserEmail,
} from '../../shared/schemas.js'

type AuthUser = Schema.Schema.Type<typeof AuthenticatedUser>
type EmailRowData = UserEmail

export const Route = createFileRoute('/settings')({
	validateSearch: (search: Record<string, unknown>) => ({
		delete_token:
			typeof search.delete_token === 'string' ? search.delete_token : undefined,
		showAddEmail: search.showAddEmail != null ? String(search.showAddEmail) : undefined,
	}),
	component: Settings,
})

function Settings() {
	const userResult = useAtomValue(currentUserAtom)
	const emailsResult = useAtomValue(emailsListAtom)
	const navigate = useNavigate()

	if (Result.isInitial(userResult) || Result.isWaiting(userResult)) {
		return <Spinner />
	}
	if (!Result.isSuccess(userResult) || !userResult.value) {
		void navigate({ to: '/login', search: { redirectTo: '/settings' } })
		return null
	}

	const user = userResult.value
	const emailsLoading =
		Result.isInitial(emailsResult) ||
		(Result.isWaiting(emailsResult) && !Result.isSuccess(emailsResult))

	return (
		<>
			<ProfileSettings currentUser={user} />
			<PasswordSettings />
			{emailsLoading ? (
				<Spinner />
			) : Result.isFailure(emailsResult) ? (
				<div className="field-error">Failed to load emails</div>
			) : Result.isSuccess(emailsResult) ? (
				<EmailSettings currentUser={user} emails={emailsResult.value} />
			) : (
				<Spinner />
			)}
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
	const updateProfile = useAtomSet(ApiClient.mutation('users', 'updateProfile'), {
		mode: 'promiseExit',
	})

	return (
		<Form
			prefix="profile"
			response={response}
			onSubmit={async (ev) => {
				ev.preventDefault()
				setResponse(undefined)
				const exit = await updateProfile({
					payload: {
						username,
						name: name.trim() === '' ? null : name,
						avatar_url: avatarUrl.trim() === '' ? null : avatarUrl,
						bio: bio.trim() === '' ? null : bio,
					},
					reactivityKeys: ['currentUser'],
				})
				if (Exit.isFailure(exit)) {
					setResponse(formResultFromExit(exit))
				}
			}}
		>
			<fieldset>
				<legend>profile settings</legend>
				<Form.Row
					name="username"
					type="text"
					value={username}
					onChange={(e) => setUsername(e.target.value)}
				/>
				<Form.Row
					name="name"
					type="text"
					value={name}
					onChange={(e) => setName(e.target.value)}
				/>
				<Form.Row
					label="avatar"
					name="avatar_url"
					type="text"
					value={avatarUrl}
					onChange={(e) => setAvatarUrl(e.target.value)}
				/>
				<Form.Row
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
	const changePassword = useAtomSet(ApiClient.mutation('users', 'changePassword'), {
		mode: 'promiseExit',
	})

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
				const passwordCheck = Schema.decodeUnknownEither(Password)(password)
				if (passwordCheck._tag === 'Left') {
					setResponse({
						fieldErrors: {
							password: ['Password must be at least 8 characters'],
						},
					})
					return
				}
				const exit = await changePassword({
					payload: {
						oldPassword,
						newPassword: passwordCheck.right,
					},
				})
				if (Exit.isSuccess(exit)) {
					setOldPassword('')
					setPassword('')
					setConfirmPassword('')
					setResponse({ formMessages: ['Password updated'] })
				} else {
					setResponse(formResultFromExit(exit))
				}
			}}
			data-cy="settings-password-form"
		>
			<fieldset>
				<legend>password settings</legend>

				<Form.Row
					label="old password"
					type="password"
					name="oldPassword"
					autoComplete="current-password"
					value={oldPassword}
					onChange={(e) => setOldPassword(e.target.value)}
				/>

				<Form.Row
					label="new password"
					type="password"
					name="password"
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
					<EmailRow
						key={email.id}
						email={email}
						hasOtherEmails={emails.length > 1}
					/>
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
	const resend = useAtomSet(ApiClient.mutation('email', 'resendVerification'), {
		mode: 'promiseExit',
	})
	const remove = useAtomSet(ApiClient.mutation('email', 'removeEmail'), {
		mode: 'promiseExit',
	})
	const makePrimary = useAtomSet(ApiClient.mutation('email', 'makeEmailPrimary'), {
		mode: 'promiseExit',
	})

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
					let exit: Exit.Exit<unknown, unknown>
					switch (type) {
						case 'resendValidation':
							exit = await resend({
								path: { id: email.id },
								reactivityKeys: ['emails'],
							})
							break
						case 'deleteEmail':
							exit = await remove({
								path: { id: email.id },
								reactivityKeys: ['emails'],
							})
							break
						case 'makePrimary':
							exit = await makePrimary({
								path: { id: email.id },
								reactivityKeys: ['emails'],
							})
							break
						default:
							return
					}
					if (Exit.isFailure(exit)) {
						setResponse(formResultFromExit(exit))
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
	const addEmail = useAtomSet(ApiClient.mutation('email', 'addEmail'), {
		mode: 'promiseExit',
	})

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
				const emailCheck = Schema.decodeUnknownEither(EmailSchema)(email)
				if (emailCheck._tag === 'Left') {
					setResponse({ fieldErrors: { email: ['Invalid email address'] } })
					return
				}
				const exit = await addEmail({
					payload: { email: emailCheck.right },
					reactivityKeys: ['emails', 'currentUser'],
				})
				if (Exit.isSuccess(exit)) {
					setEmail('')
					setShowForm(false)
				} else {
					setResponse(formResultFromExit(exit))
				}
			}}
		>
			<Form.Row
				label="new email"
				name="email"
				type="email"
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
	const requestDeletion = useAtomSet(ApiClient.mutation('users', 'requestDeletion'), {
		mode: 'promiseExit',
	})
	const confirmDeletion = useAtomSet(ApiClient.mutation('users', 'confirmDeletion'), {
		mode: 'promiseExit',
	})

	if (token) {
		return (
			<form
				onSubmit={async (ev) => {
					ev.preventDefault()
					setResponse(undefined)
					const exit = await confirmDeletion({
						payload: { token },
						reactivityKeys: ['currentUser'],
					})
					if (Exit.isSuccess(exit) && exit.value.confirm_account_deletion) {
						void navigate({ to: '/' })
					} else if (Exit.isFailure(exit)) {
						setResponse(formResultFromExit(exit))
					}
				}}
			>
				<fieldset>
					<legend>danger zone</legend>
					<p>
						This is it. <b>Press this button and your account will be deleted.</b>{' '}
						We&apos;re sorry to see you go, please don&apos;t hesitate to reach out
						and let us know why you no longer want your account.
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
					You&apos;ve been sent an email with a confirmation link in it, you must
					click it to confirm that you are the account holder so that you may
					continue deleting your account.
				</div>
			</fieldset>
		)
	}

	return (
		<form
			onSubmit={async (ev) => {
				ev.preventDefault()
				setResponse(undefined)
				const exit = await requestDeletion({})
				if (Exit.isSuccess(exit)) {
					setRequested(true)
				} else {
					setResponse(formResultFromExit(exit))
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
					<button
						type="submit"
						name="submit"
						data-cy="account-delete-request-button"
					>
						I want to delete my account
					</button>
				</div>
			</fieldset>
		</form>
	)
}
