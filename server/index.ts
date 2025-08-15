import { Config, Effect, Layer, Logger, LogLevel } from "effect";
import { HttpApiBuilder, HttpServer, Path, Etag } from "@effect/platform";
import {
  BunHttpServer,
  BunRuntime,
  BunFileSystem,
  BunHttpPlatform,
} from "@effect/platform-bun";
import { PgAuthDB, PgRootDB } from "./db.js";
import { PostsApiLive } from "./api/posts.js";
import { UsersApiLive } from "./api/users.js";
import { EmailApiLive } from "./api/email.js";
import { SessionService } from "./services/session.js";

const ServerLive = HttpApiBuilder.serve().pipe(
  Layer.provide([PostsApiLive, UsersApiLive, EmailApiLive]),
  Layer.provide(SessionService.Default),
  Layer.provide(PgRootDB.Live),
  Layer.provide(PgAuthDB.Live),
  HttpServer.withLogAddress,
  Layer.provide(
    Layer.unwrapEffect(
      Effect.andThen(Config.string("PORT"), (port) =>
        BunHttpServer.layerServer({ port }),
      ),
    ),
  ),
  Layer.provide(Logger.minimumLogLevel(LogLevel.All)),
  Layer.provide([
    BunFileSystem.layer,
    BunHttpPlatform.layer,
    Path.layer,
    Etag.layer,
  ]),
);

BunRuntime.runMain(Layer.launch(ServerLive));
