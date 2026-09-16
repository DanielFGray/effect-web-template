import { HttpApiMiddleware } from '@effect/platform'
import { Context, Effect } from 'effect'

/**
 * Request-scoped session cookie transport. No @effect/platform request/response
 * types — adapters close over those outside this interface.
 */
export class SessionCookie extends Context.Tag('SessionCookie')<
	SessionCookie,
	{
		/** Raw signed cookie value, before CookieSigner.verify. */
		readonly read: Effect.Effect<string | null>
		readonly write: (sessionId: string) => Effect.Effect<void>
		readonly clear: Effect.Effect<void>
	}
>() {}

/** HTTP adapter middleware: builds SessionCookie per request and provides it. */
export class SessionCookieHttp extends HttpApiMiddleware.Tag<SessionCookieHttp>()(
	'SessionCookieHttp',
	{ provides: SessionCookie },
) {}
