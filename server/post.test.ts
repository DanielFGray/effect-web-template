import { Config, ConfigProvider, Context, Effect, Layer, Logger, LogLevel, Redacted, RequestResolver } from "effect";
import { suite, expect, it } from "@effect/vitest";
import { RpcResolver, RpcRouter } from "@effect/rpc";
import { PgClient } from "@effect/sql-pg";
import { appRouter } from "./router";
import { CreatePost, PostList } from "./request";
import { PgRootDB, PgRootLive } from "./db";
import {
  PostgreSqlContainer,
  type StartedPostgreSqlContainer,
} from "@testcontainers/postgresql";

class PgContainer extends Context.Tag("test/PgContainer")<
  PgContainer,
  StartedPostgreSqlContainer
>() {
  static Live = Layer.scoped(
    this,
    Effect.acquireRelease(
      Effect.promise(() => new PostgreSqlContainer("postgres:alpine").start()),
      (container) => Effect.promise(() => container.stop())
    )
  )

  static ClientLive = Layer.unwrapEffect(
    Effect.gen(function* () {
      const container = yield* PgContainer
      return PgClient.layer({
        url: Config.succeed(Redacted.make(container.getConnectionUri()))
      })
    })
  ).pipe(Layer.provide(this.Live))
}

const handler = RpcRouter.toHandler(appRouter);
const resolver = RpcResolver.make(handler)<typeof appRouter>()
const withCtx = RequestResolver.contextFromServices(PgRootDB)(resolver)
const client = RpcResolver.toClient(withCtx)

suite("posts", () => {
  it.live("can make a new post", () =>
    Effect.gen(function* () {
      const result = yield* client(new CreatePost({ body: "hello world" }));
      Effect.log(result)
      expect(result).toBeInstanceOf(Object);
      expect(result.body).toEqual("hello world");
    }).pipe(
      Effect.provide(PgRootLive),
      Effect.provide(PgClient.layer({ url: Config.redacted("TEST_DATABASE_URL") })),
      Effect.provide(Logger.pretty),
      Logger.withMinimumLogLevel(LogLevel.All),
    )
  );

  it.live("can make a request", () =>
    Effect.gen(function* () {
      const result = yield* client(new PostList());
      Effect.log(result)
      expect(result).toBeInstanceOf(Array);
      expect(result.length).toBeGreaterThan(0);
    }).pipe(
      Effect.provide(PgRootLive),
      Effect.provide(PgClient.layer({ url: Config.redacted("TEST_DATABASE_URL") })),
      // Effect.provide(PgContainer.ClientLive),
      Effect.provide(Logger.pretty),
      Logger.withMinimumLogLevel(LogLevel.All),
      // Effect.provide(Layer.setConfigProvider(ConfigProvider.fromEnv())),
    )
  );
});
