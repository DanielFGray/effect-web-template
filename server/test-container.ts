import { Console, Context, Effect, Layer, Redacted } from "effect";
import { NodeContext } from "@effect/platform-node";
import { Command } from "@effect/platform";
import * as Pg from "@effect/sql-pg";
import {
  PostgreSqlContainer,
  type StartedPostgreSqlContainer,
} from "@testcontainers/postgresql";

export class PgContainer extends Context.Tag("test/PgContainer")<
  PgContainer,
  StartedPostgreSqlContainer
>() {
  static Live = Layer.scoped(
    this,
    Effect.acquireRelease(
      Effect.promise(() =>
        new PostgreSqlContainer("postgres:16-alpine").start(),
      ),
      (container) => Effect.promise(() => container.stop()),
    ),
  ).pipe(Layer.provide(NodeContext.layer));

  static ClientLive = Layer.unwrapEffect(
    Effect.gen(function* () {
      const container = yield* PgContainer;
      return Pg.PgClient.layer({
        url: Redacted.make(container.getConnectionUri()),
      });
    }),
  ).pipe(Layer.provide(this.Live));

  static ClientLiveWithMigrations = Layer.unwrapEffect(
    Effect.gen(function* () {
      const container = yield* PgContainer;
      const connectionUri = container.getConnectionUri();

      const env = {
        ROOT_DATABASE_URL: connectionUri,
        DATABASE_URL: connectionUri.replace(/\/test$/, "/test_db"),
        SHADOW_DATABASE_URL: connectionUri.replace(
          /\/test$/,
          "/test_db_shadow",
        ),
        DATABASE_NAME: "test_db",
        DATABASE_OWNER: "test_owner",
        DATABASE_OWNER_PASSWORD: "test_pass",
        DATABASE_AUTHENTICATOR: "test_auth",
        DATABASE_AUTHENTICATOR_PASSWORD: "test_auth_pass",
        DATABASE_VISITOR: "test_visitor",
        NOCONFIRM: "true",
      };

      yield* Command.make("bun", "scripts/dbSetup.mjs").pipe(
        Command.env(env),
        Command.runInShell(true),
        Command.exitCode,
      );
      // yield* Console.log(`Database setup exit code: ${setup}`);

      // Run migrations reset
      yield* Command.make("bun", "run", "gm", "reset", "--erase").pipe(
        Command.env(env),
        Command.exitCode,
        // Command.string,
      );
      // yield* Console.log(`Migration reset output: ${resetOutput}`);

      yield* Command.make("bun", "run", "gm", "watch", "--once").pipe(
        Command.env(env),
        Command.exitCode,
        // Command.string
      );
      // yield* Console.log(`Migration migrate output: ${migrateOutput}`);

      return Pg.PgClient.layer({
        url: Redacted.make(env.DATABASE_URL),
      });
    }),
  ).pipe(Layer.provide(Layer.merge(this.Live, NodeContext.layer)));
}
