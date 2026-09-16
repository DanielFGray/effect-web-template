import {
	Cookies,
	FetchHttpClient,
	HttpApiClient,
	HttpClient,
	HttpClientRequest,
	type HttpClientResponse,
} from '@effect/platform'
import { getRequestHeader, setResponseHeader } from '@tanstack/react-start/server'
import { Effect } from 'effect'

import { Contract } from '../../shared/httpApi.js'

/**
 * Thin transport: run an HttpApiClient call against the Effect API with the
 * browser's cookie forwarded, and relay any Set-Cookie back to the caller.
 *
 * Only ever called from inside a `createServerFn().handler()` body. The
 * `.server.` suffix keeps the module out of the client bundle, which matters
 * because importing it pulls in the whole Effect graph.
 */
export const callApi = <A, E>(f: (api: ApiClient) => Effect.Effect<A, E>): Promise<A> =>
	Effect.gen(function* () {
		const api = yield* makeApiClient()
		return yield* f(api)
	}).pipe(Effect.runPromise)

// Contract already prefixes /api — baseUrl must be origin only.
const rootUrl = import.meta.env.VITE_ROOT_URL
if (!rootUrl) {
	throw new Error('env var VITE_ROOT_URL is missing')
}
const apiOrigin = new URL(rootUrl).origin

const makeApiClient = () => {
	const cookie = getRequestHeader('cookie')
	return HttpApiClient.make(Contract, {
		baseUrl: apiOrigin,
		transformClient: (client) =>
			client.pipe(
				HttpClient.mapRequest((req) =>
					cookie ? HttpClientRequest.setHeader(req, 'cookie', cookie) : req,
				),
				HttpClient.transformResponse((effect) =>
					Effect.tap(effect, (response) =>
						Effect.sync(() => {
							forwardSetCookie(response)
						}),
					),
				),
			),
	}).pipe(Effect.provide(FetchHttpClient.layer))
}

type ApiClient = Effect.Effect.Success<ReturnType<typeof makeApiClient>>

/** Copy Set-Cookie from the Effect API's response onto the TanStack Start response. */
const forwardSetCookie = (response: HttpClientResponse.HttpClientResponse): void => {
	const setCookieHeaders = Cookies.toSetCookieHeaders(response.cookies)
	if (setCookieHeaders.length > 0) {
		setResponseHeader('set-cookie', setCookieHeaders)
	}
}
