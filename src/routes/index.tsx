import { useState } from 'react'
import {
	createFileRoute,
	Link,
	useRouter,
	type ErrorComponentProps,
} from '@tanstack/react-router'
import { createServerFn, useServerFn } from '@tanstack/react-start'
import { Effect } from 'effect'
import { callApi } from '../lib/api.server.js'
import {
	Form,
	Spinner,
	UnverifiedAccountWarning,
	formResultFromError,
	type FormResult,
} from '../components.js'

type ActionResult<T = null> =
	| { ok: true; data: T }
	| { ok: false; error: FormResult }

type FeedPost = {
	id: string
	body: string
	privacy: 'public' | 'secret' | 'private'
	user: { username: string | null; avatar_url: string | null }
}

const getPosts = createServerFn({ method: 'GET' }).handler(async () => {
	const posts = await callApi((api) => api.posts.list({ urlParams: {} }))
	return posts.map(
		(post): FeedPost => ({
			id: String(post.id),
			body: post.body,
			privacy: post.privacy,
			user: post.user,
		}),
	)
})

const createPostFn = createServerFn({ method: 'POST' })
	.validator((data: { body: string; privacy: 'public' | 'private' | 'secret' }) => data)
	.handler(({ data }): Promise<ActionResult<{ id: string }>> =>
		callApi((api) =>
			api.posts.create({ payload: data }).pipe(
				Effect.map(
					(created): ActionResult<{ id: string }> => ({
						ok: true,
						data: { id: String(created.id) },
					}),
				),
				Effect.catchAll((err) =>
					Effect.succeed({
						ok: false as const,
						error: formResultFromError(err),
					}),
				),
			),
		),
	)

export const Route = createFileRoute('/')({
	loader: (): Promise<ReadonlyArray<FeedPost>> => getPosts(),
	pendingComponent: Pending,
	errorComponent: RouteError,
	component: Home,
})

function Pending() {
	return <Spinner />
}

function RouteError({ error }: ErrorComponentProps) {
	return (
		<div className="field-error">
			{error instanceof Error ? error.message : 'Failed to load posts'}
		</div>
	)
}

function Home() {
	const { user } = Route.useRouteContext()
	const posts: ReadonlyArray<FeedPost> = Route.useLoaderData()

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
			<ul data-cy="posts-list">
				{posts.map((post) => (
					<li key={post.id} data-cy="post-item">
						<div>
							<strong>{post.user.username ?? 'anonymous'}</strong>
							{' · '}
							<small>{post.privacy}</small>
						</div>
						<p>{post.body}</p>
					</li>
				))}
			</ul>
		</>
	)
}

function NewPost() {
	const [body, setBody] = useState('')
	const [privacy, setPrivacy] = useState<'public' | 'private' | 'secret'>('public')
	const [response, setResponse] = useState<FormResult>()
	const createPost = useServerFn(createPostFn)
	const router = useRouter()

	return (
		<Form
			prefix="newpost"
			response={response}
			onSubmit={async (ev) => {
				ev.preventDefault()
				setResponse(undefined)
				const result = await createPost({ data: { body, privacy } })
				if (result.ok) {
					setBody('')
					setResponse(undefined)
					await router.invalidate()
				} else {
					setResponse(result.error)
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
