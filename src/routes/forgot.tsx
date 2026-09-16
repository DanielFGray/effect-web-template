import { useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { useAtomSet } from '@effect-atom/atom-react'
import { Exit, Schema } from 'effect'
import { ApiClient } from '../lib/api.js'
import { Form, formResultFromExit, type FormResult } from '../components.js'
import { EmailSchema } from '../../shared/schemas.js'

export const Route = createFileRoute('/forgot')({
	component: ForgotPassword,
})

function ForgotPassword() {
	const [email, setEmail] = useState('')
	const [response, setResponse] = useState<FormResult>()
	const [done, setDone] = useState(false)
	const forgot = useAtomSet(ApiClient.mutation('users', 'forgotPassword'), {
		mode: 'promiseExit',
	})

	if (done) {
		return (
			<div>
				We&apos;ve sent a link to your email. Please check your email and click the
				link and follow the instructions. If you don&apos;t receive the link, please
				ensure you entered the email address correctly, and check in your spam folder
				just in case.
			</div>
		)
	}

	return (
		<Form
			response={response}
			prefix="forgot"
			onSubmit={async (ev) => {
				ev.preventDefault()
				setResponse(undefined)
				const emailCheck = Schema.decodeUnknownEither(EmailSchema)(email)
				if (emailCheck._tag === 'Left') {
					setResponse({ fieldErrors: { email: ['Invalid email address'] } })
					return
				}
				const exit = await forgot({
					payload: { email: emailCheck.right },
				})
				if (Exit.isSuccess(exit)) {
					setDone(true)
				} else {
					setResponse(formResultFromExit(exit))
				}
			}}
		>
			<fieldset>
				<legend>forgot password</legend>
				<Form.Row
					name="email"
					type="text"
					autoComplete="email"
					value={email}
					onChange={(e) => setEmail(e.target.value)}
				/>

				<div>
					<Form.Errors />
					<button type="submit" data-cy="forgot-submit-button">
						Reset Password
					</button>
				</div>
			</fieldset>
		</Form>
	)
}
