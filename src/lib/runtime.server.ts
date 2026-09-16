import { Etag, HttpLayerRouter, Path } from '@effect/platform'
import { NodeFileSystem, NodeHttpPlatform } from '@effect/platform-node'
import { Config, Effect, Layer, Logger, LogLevel, ManagedRuntime } from 'effect'

import { EmailApiGroupLive } from '../../server/api/email.js'
import { OrganizationsApiGroupLive } from '../../server/api/organizations.js'
import { PostsApiGroupLive } from '../../server/api/posts.js'
import { UsersApiGroupLive } from '../../server/api/users.js'
import { PgAuthDB, PgRootDB } from '../../server/db.js'
import { DevToolsLive } from '../../server/devTools.js'
import { CookieSigner } from '../../server/services/cookie-signer.js'
import { Email } from '../../server/services/email.js'
import { Organizations } from '../../server/services/organizations.js'
import { Posts } from '../../server/services/posts.js'
import {
	SessionCookieHttpLive,
	SessionCookieStartLive,
} from '../../server/services/session-cookie.js'
import { Sessions } from '../../server/services/session.js'
import { Users } from '../../server/services/users.js'
import { ContractWithTesting, TestingApiLive } from '../../server/testingApi.js'
import { TracingLayer } from '../../server/tracing.js'
import { Contract } from '../../shared/httpApi.js'
import { SessionCookie } from '../../shared/sessionCookie.js'

/**
 * Process-scoped domain + DB layers. Shared with the HTTP handler through the
 * same memoMap so Pg pools are built once per process.
 */
const AppLayer = Layer.mergeAll(
	Sessions.Default,
	Users.Live,
	Email.Default,
	Organizations.Default,
	Posts.Default,
).pipe(
	Layer.provideMerge(CookieSigner.Live),
	Layer.provideMerge(PgRootDB.Live),
	Layer.provideMerge(PgAuthDB.Live),
)

const PlatformLive = Layer.mergeAll(
	NodeFileSystem.layer,
	NodeHttpPlatform.layer,
	Path.layer,
	Etag.layer,
)

const provideCommon = <A, E, R>(layer: Layer.Layer<A, E, R>) =>
	layer.pipe(
		Layer.provide(PostsApiGroupLive),
		Layer.provide(UsersApiGroupLive),
		Layer.provide(EmailApiGroupLive),
		Layer.provide(OrganizationsApiGroupLive),
		Layer.provide(SessionCookieHttpLive),
		Layer.provide(AppLayer),
		Layer.provide(CookieSigner.Live),
		Layer.provide(PgRootDB.Live),
		Layer.provide(PgAuthDB.Live),
		Layer.provide(Logger.minimumLogLevel(LogLevel.All)),
		Layer.provide(TracingLayer),
		Layer.provide(DevToolsLive),
		Layer.provide(PlatformLive),
	)

/** TestingApi only outside production — same NODE_ENV guard as TestingApiLive. */
const HttpApiLive = Layer.unwrapEffect(
	Effect.gen(function* () {
		const nodeEnv = yield* Config.string('NODE_ENV').pipe(
			Config.withDefault('development'),
		)
		if (nodeEnv === 'production') {
			return provideCommon(HttpLayerRouter.addHttpApi(Contract))
		}
		return provideCommon(
			HttpLayerRouter.addHttpApi(ContractWithTesting).pipe(Layer.provide(TestingApiLive)),
		)
	}),
)

const globalForEffect = globalThis as typeof globalThis & {
	__effectWebRuntime?: {
		readonly dispose: () => Promise<void>
	}
}

const memoMap = Effect.runSync(Layer.makeMemoMap)

if (globalForEffect.__effectWebRuntime) {
	await globalForEffect.__effectWebRuntime.dispose()
}

const serverRuntime = ManagedRuntime.make(AppLayer, memoMap)
const web = HttpLayerRouter.toWebHandler(HttpApiLive, { memoMap })

globalForEffect.__effectWebRuntime = {
	dispose: async () => {
		await web.dispose()
		await serverRuntime.dispose()
	},
}

export const handler = (request: Request): Promise<Response> => web.handler(request)

type AppContext = ManagedRuntime.ManagedRuntime.Context<typeof serverRuntime>

/**
 * Run a domain Effect against the process ManagedRuntime (shared memoMap / pools).
 * Provides SessionCookie from the current Start request/response.
 */
export const runServer = <A, E>(
	effect: Effect.Effect<A, E, AppContext | SessionCookie>,
): Promise<A> => serverRuntime.runPromise(Effect.provide(effect, SessionCookieStartLive))
