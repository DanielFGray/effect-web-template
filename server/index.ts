import { DevTools } from '@effect/experimental'
import { HttpApiBuilder, HttpServer, Path, Etag } from '@effect/platform'
import {
	BunHttpServer,
	BunRuntime,
	BunFileSystem,
	BunHttpPlatform,
} from '@effect/platform-bun'
import { Config, Effect, Layer, Logger, LogLevel } from 'effect'

import { Contract } from '../shared/httpApi.js'
import { EmailApiGroupLive } from './api/email.js'
import { OrganizationsApiGroupLive } from './api/organizations.js'
import { PostsApiGroupLive } from './api/posts.js'
import { UsersApiGroupLive } from './api/users.js'
import { PgAuthDB, PgRootDB } from './db.js'
import { DevToolsLive } from './devTools.js'
import { CookieSigner } from './services/cookie-signer.js'
import { Email } from './services/email.js'
import { Organizations } from './services/organizations.js'
import { Posts } from './services/posts.js'
import { Sessions } from './services/session.js'
import { Users } from './services/users.js'
import { TestingApi, TestingApiLive } from './testingApi.js'
import { TracingLayer } from './tracing.js'

const ApiLive = HttpApiBuilder.api(Contract.addHttpApi(TestingApi)).pipe(
	Layer.provide(PostsApiGroupLive),
	Layer.provide(UsersApiGroupLive),
	Layer.provide(EmailApiGroupLive),
	Layer.provide(OrganizationsApiGroupLive),
	Layer.provide(Posts.Default),
	Layer.provide(Users.Live),
	Layer.provide(Email.Default),
	Layer.provide(Organizations.Default),
)

const ServerLive = HttpApiBuilder.serve().pipe(
	Layer.provide(ApiLive),
	Layer.provide(TestingApiLive),
	Layer.provide(Sessions.Default),
	Layer.provide(CookieSigner.Live),
	Layer.provide(Users.Live),
	Layer.provide(PgRootDB.Live),
	Layer.provide(PgAuthDB.Live),
	HttpServer.withLogAddress,
	Layer.provide(
		Layer.unwrapEffect(
			Effect.andThen(Config.string('PORT'), (port) =>
				BunHttpServer.layerServer({ port }),
			),
		),
	),
	Layer.provide(Logger.minimumLogLevel(LogLevel.All)),
	Layer.provide(TracingLayer),
	Layer.provide(DevToolsLive),
	Layer.provide([BunFileSystem.layer, BunHttpPlatform.layer, Path.layer, Etag.layer]),
	Layer.provide(DevTools.layer()),
)

const program = Effect.never.pipe(Effect.provide(ServerLive)) as Effect.Effect<never>

BunRuntime.runMain(program, {
	disableErrorReporting: false,
})
