import {
  Console,
  Context,
  Effect,
  Layer,
  Redacted,
  Stream,
  String,
} from "effect";
import { NodeContext } from "@effect/platform-node";
import { Command } from "@effect/platform";
import * as Pg from "@effect/sql-pg";
import {
  PostgreSqlContainer,
  type StartedPostgreSqlContainer,
} from "@testcontainers/postgresql";
import { pgConfig } from "./db.js";

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
        ...pgConfig,
        url: Redacted.make(container.getConnectionUri()),
      });
    }),
  ).pipe(Layer.provide(this.Live));

  static ClientLiveWithMigrations = Layer.unwrapEffect(
    Effect.gen(function* () {
      const container = yield* PgContainer;
      const connectionUri = container.getConnectionUri();

      yield* Console.log(`Started PostgreSQL container at ${connectionUri}`);
      const env = {
        ROOT_DATABASE_URL: connectionUri.replace(/test$/, "template1"),
        DATABASE_URL: connectionUri,
        SHADOW_DATABASE_URL: connectionUri.replace(
          /\/test$/,
          "/test_db_shadow",
        ),
        DATABASE_NAME: "test",
        DATABASE_OWNER: "test_owner",
        DATABASE_OWNER_PASSWORD: "test_pass",
        DATABASE_AUTHENTICATOR: "test_auth",
        DATABASE_AUTHENTICATOR_PASSWORD: "test_auth_pass",
        DATABASE_VISITOR: "test_visitor",
        NOCONFIRM: "true",
      };

      const scripts = [
        {
          name: "dbSetup",
          args: ["scripts/dbSetup.mjs"],
        },
        {
          name: "reset",
          args: ["run", "gm", "reset", "--erase"],
        },
        {
          name: "migrate",
          args: ["run", "gm", "watch", "--once"],
        },
      ] as const;

      for (const script of scripts) {
        yield* Console.log(`Running ${script.name} script`);
        const exitCode = yield* Command.make("bun", ...script.args).pipe(
          Command.env(env),
          Command.runInShell(true),
          Command.stdout("inherit"),
          Command.exitCode,
        );
        if (exitCode !== 0) {
          return yield* Effect.fail(
            `${script.name} script failed with exit code ${exitCode}`,
          );
        }
      }

      return Pg.PgClient.layer({
        url: Redacted.make(env.DATABASE_URL),
      });
    }),
  ).pipe(Layer.provide(Layer.merge(this.Live, NodeContext.layer)));
}
