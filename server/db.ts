import { Context, Effect, Layer, Config, Schedule, Duration } from "effect";
import * as PgKysely from "@effect/sql-kysely/Pg";
import { PgClient } from "@effect/sql-pg";
import type { DB } from "kysely-codegen";
import { sql } from "kysely";
import { camelToSnake, snakeToCamel } from "effect/String";

export { sql } from "kysely";

export type KyselyDB = PgKysely.EffectKysely<DB>;

export const pgConfig: PgClient.PgClientConfig = {
  // transformQueryNames: camelToSnake,
  // transformResultNames: snakeToCamel,
} as const;

const withDatabaseRetry = <E, A, R>(layer: Layer.Layer<E, A, R>) =>
  Layer.retry(
    layer,
    Schedule.identity<Layer.Layer.Error<typeof layer>>().pipe(
      Schedule.check(
        (input) =>
          input &&
          typeof input === "object" &&
          "_tag" in input &&
          input._tag === "SqlError",
      ),
      Schedule.intersect(Schedule.exponential("1 second")),
      Schedule.intersect(Schedule.recurs(2)),
      Schedule.onDecision(([[_error, duration], attempt], decision) =>
        decision._tag === "Continue"
          ? Effect.logInfo(
              `Retrying database connection in ${Duration.format(duration)} (attempt #${++attempt})`,
            )
          : Effect.void,
      ),
    ),
  );

export class PgAuthDB extends Context.Tag("PgAuthDB")<PgAuthDB, KyselyDB>() {
  static Conn = Layer.unwrapEffect(
    Config.redacted("AUTH_DATABASE_URL").pipe(
      Effect.andThen((url) => PgClient.layer({ url, ...pgConfig })),
    ),
  ).pipe(withDatabaseRetry);

  static Kysely = Layer.effect(this, PgKysely.make<DB>());

  static Live = this.Kysely.pipe(Layer.provide(this.Conn));
}

export class PgRootDB extends Context.Tag("PgRootDB")<PgRootDB, KyselyDB>() {
  static Conn = Layer.unwrapEffect(
    Config.redacted("DATABASE_URL").pipe(
      Effect.andThen((url) => PgClient.layer({ url, ...pgConfig })),
    ),
  ).pipe(withDatabaseRetry);

  static Kysely = Layer.effect(this, PgKysely.make<DB>());

  static Live = this.Kysely.pipe(Layer.provide(this.Conn));
}

export const withAuthContext = <A, E = unknown, R = unknown>(
  sid: string,
  cb: Effect.Effect<A, E, R>,
) =>
  Effect.gen(function* () {
    const db = yield* PgAuthDB;
    const databaseVisitor = yield* Config.string("DATABASE_VISITOR");
    return yield* db.withTransaction(
      db
        .selectNoFrom((eb) => [
          eb
            .fn<void>("set_config", [
              sql.lit("role"),
              sql.lit(databaseVisitor),
              eb.lit(false),
            ])
            .as("_1"),
          eb
            .fn<void>("set_config", [
              sql.lit("my.session_id"),
              eb.val(sid),
              eb.lit(true),
            ])
            .as("_2"),
        ])
        .pipe(Effect.andThen(cb)),
    );
  });
