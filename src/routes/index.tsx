import { useState } from 'react'
import { createFileRoute, Link } from '@tanstack/react-router'
import { Result, useAtomSet, useAtomValue } from '@effect-atom/atom-react'
import { Exit } from 'effect'
import { ApiClient, currentUserAtom, postsListAtom } from '../lib/api.js'
import {
	Form,
	Spinner,
	UnverifiedAccountWarning,
	formResultFromExit,
	type FormResult,
} from '../components.js'

export const Route = createFileRoute('/')({
	component: Home,
})

function Home() {
	const userResult = useAtomValue(currentUserAtom)
	const postsResult = useAtomValue(postsListAtom)

	const user = Result.isSuccess(userResult) ? userResult.value : null
	const postsLoading =
		Result.isInitial(postsResult) ||
		(Result.isWaiting(postsResult) && !Result.isSuccess(postsResult))

	return (
		<>
			<h1>Home</h1>
			{user && !user.is_verified ? <UnverifiedAccountWarning /> : null}
			{user ? (
				<NewPost />
			) : (
				<p>
					<Link to="/login">Log in</Link> to create a post.
				</p>
			)}
			{postsLoading ? (
				<Spinner />
			) : Result.isFailure(postsResult) ? (
				<div className="field-error">Failed to load posts</div>
			) : Result.isSuccess(postsResult) ? (
				<ul data-cy="posts-list">
					{postsResult.value.map((post) => (
						<li key={String(post.id)} data-cy="post-item">
							<div>
								<strong>{post.user.username ?? 'anonymous'}</strong>
								{' · '}
								<small>{String(post.privacy)}</small>
							</div>
							<p>{post.body}</p>
						</li>
					))}
				</ul>
			) : (
				<Spinner />
			)}
		</>
	)
}

function NewPost() {
	const [body, setBody] = useState('')
	const [privacy, setPrivacy] = useState<'public' | 'private' | 'secret'>('public')
	const [response, setResponse] = useState<FormResult>()
	const createPost = useAtomSet(ApiClient.mutation('posts', 'create'), {
		mode: 'promiseExit',
	})

	return (
		<Form
			prefix="newpost"
			response={response}
			onSubmit={async (ev) => {
				ev.preventDefault()
				setResponse(undefined)
				const exit = await createPost({
					payload: { body, privacy },
					reactivityKeys: ['posts'],
				})
				if (Exit.isSuccess(exit)) {
					setBody('')
					setResponse(undefined)
				} else {
					setResponse(formResultFromExit(exit))
				}
			}}
		>
			<fieldset>
				<legend>new post</legend>
				<div>
					<textarea
						name="body"
						value={body}
						onChange={(e) => setBody(e.target.value)}
						aria-describedby="newpost-body-help"
						aria-invalid={Boolean(response?.fieldErrors?.body)}
						className="w-full"
						data-cy="newpost-body-input"
						placeholder="what's on your mind?"
					/>
					{response?.fieldErrors?.body?.map((e) => (
						<div className="field-error" key={e} id="newpost-body-help">
							{e}
						</div>
					))}
				</div>

				<div className="form-row">
					<label htmlFor="newpost-privacy-input">privacy: </label>
					<div>
						<select
							className="w-full"
							name="privacy"
							id="newpost-privacy-input"
							data-cy="newpost-privacy-input"
							value={privacy}
							onChange={(e) =>
								setPrivacy(e.target.value as 'public' | 'private' | 'secret')
							}
						>
							<option value="public">public</option>
							<option value="private">private</option>
							<option value="secret">secret</option>
						</select>
					</div>
				</div>

				<button type="submit" data-cy="newpost-submit-button">
					send
				</button>
				<Form.Errors />
			</fieldset>
		</Form>
	)
}
