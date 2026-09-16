import { FetchHttpClient } from '@effect/platform'
import { AtomHttpApi } from '@effect-atom/atom-react'
import { Contract } from '../../shared/httpApi.js'

export class ApiClient extends AtomHttpApi.Tag<ApiClient>()('ApiClient', {
	api: Contract,
	httpClient: FetchHttpClient.layer,
	// Effect HttpClient requires an absolute URL; Contract already carries /api.
	baseUrl: import.meta.env.VITE_ROOT_URL,
}) {}

export const currentUserAtom = ApiClient.query('users', 'me', {
	reactivityKeys: ['currentUser'],
})

export const postsListAtom = ApiClient.query('posts', 'list', {
	urlParams: {},
	reactivityKeys: ['posts'],
})

export const emailsListAtom = ApiClient.query('email', 'list', {
	reactivityKeys: ['emails'],
})
