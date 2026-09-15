import { Context, Effect, Layer, Config, Schedule, Duration, Option } from "effect";
import * as pg from "pg";
import * as PgKysely from "@effect/sql-kysely/Pg";
import { PgClient } from "@effect/sql-pg";
import { SqlError } from "@effect/sql";
import type { DB } from "../generated/db.js";
import { sql } from "kysely";
import { camelToSnake, snakeToCamel } from "effect/String";
import { HttpServerRequest } from "@effect/platform/HttpServerRequest";
import { PostgresError } from "pg-error-enum";
import { CookieSigner } from "./services/cookie-signer.js";
import { InternalError } from "../shared/errors.js";

export { sql } from "kysely";

export type KyselyDB = PgKysely.EffectKysely<DB>;

const types: pg.CustomTypesConfig = {
  getTypeParser: (oid, format) =>
    oid === pg.types.builtins.INT8 ? BigInt : pg.types.getTypeParser(oid, format),
};

export const pgConfig: PgClient.PgClientConfig = {
  // transformQueryNames: camelToSnake,
  // transformResultNames: snakeToCamel,
  types,
} as const;

const withDatabaseRetry = <E, A, R>(layer: Layer.Layer<E, A, R>) =>
  Layer.retry(
    layer,
    Schedule.identity<Layer.Layer.Error<typeof layer>>().pipe(
      Schedule.check(
        (input) =>
          input && typeof input === "object" && "_tag" in input && input._tag === "SqlError",
      ),
      Schedule.intersect(Schedule.exponential("100 millis")),
      Schedule.intersect(Schedule.forever),
      Schedule.jittered,
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

export class CurrentDb extends Context.Tag("CurrentDb")<CurrentDb, KyselyDB>() {}

export const withAuthContext = <A, E>(effect: Effect.Effect<A, E, any>) =>
  Effect.gen(function* () {
    const db = yield* PgAuthDB;
    const databaseVisitor = yield* Config.string("DATABASE_VISITOR").pipe(
      Effect.mapError(() => new InternalError({ message: "Database configuration error" })),
    );
    const req = yield* HttpServerRequest;

    // Get the signed session cookie and verify it
    const signedSessionCookie = req.cookies["session"];
    const sessionId = signedSessionCookie
      ? yield* CookieSigner.verify(signedSessionCookie).pipe(
          Effect.catchTag("InvalidCookieSignature", () => Effect.succeed(null)),
        )
      : null;

    return yield* db.withTransaction(
      Effect.gen(function* () {
        yield* db.selectNoFrom((eb) => [
          eb
            .fn<void>("set_config", [sql.lit("role"), sql.lit(databaseVisitor), eb.lit(false)])
            .as("_1"),
          eb
            .fn<void>("set_config", [sql.lit("my.session_id"), eb.val(sessionId), eb.lit(true)])
            .as("_2"),
        ]);
        return yield* effect.pipe(Effect.provide(Layer.succeed(CurrentDb, db)));
      }),
    );
  }).pipe(catchSql);

export { PostgresError } from "pg-error-enum";

const SafeErrCodes = new Set([
  "CREDS",
  "LOCKD",
  "WEAKP",
  "LOGIN",
  "DNIED",
  "MDEML",
  "MDPWD",
  "TAKEN",
  "EMTKN",
  "CDLEA",
  "VRFY1",
  "VRFY2",
  "ISMBR",
  "NTFND",
  "OWNER",
] as const);

export type SafeErrorCode = typeof SafeErrCodes extends ReadonlySet<infer T> ? T : never;

export const isSqlError = (error: unknown) => error instanceof SqlError.SqlError;

export const postgresErrorCode = (error: unknown): Option.Option<string> => {
  if (!isSqlError(error)) return Option.none();
  return error.cause instanceof pg.DatabaseError
    ? Option.fromNullable(error.cause.code)
    : Option.none();
};

export const safeDbMessage = (error: unknown): Option.Option<string> => {
  if (!isSqlError(error)) return Option.none();
  if (!(error.cause instanceof pg.DatabaseError)) return Option.none();
  const code = error.cause.code;
  if (!code) return Option.none();
  return SafeErrCodes.has(code as SafeErrorCode) ? Option.some(error.cause.message) : Option.none();
};

type DbErrorFactory = (message: string) => unknown;
type FactoryRecord = Readonly<Partial<Record<SafeErrorCode, DbErrorFactory>>>;
type MappedDbError<M extends FactoryRecord> = ReturnType<
  NonNullable<Extract<M[keyof M], DbErrorFactory>>
>;

export const mapDbErrors =
  <const M extends FactoryRecord>(map: M) =>
  <E>(error: E): E | MappedDbError<M> =>
    Option.all([postgresErrorCode(error), safeDbMessage(error)]).pipe(
      Option.match({
        onNone: () => error,
        onSome: ([code, msg]) => {
          const factory = map[code as SafeErrorCode] as
            | ((message: string) => MappedDbError<M>)
            | undefined;
          return factory ? factory(msg) : error;
        },
      }),
    );

export const mapUniqueViolation =
  <E2>(factory: () => E2) =>
  <A, E, R>(self: Effect.Effect<A, E, R>): Effect.Effect<A, E | E2, R> =>
    self.pipe(
      Effect.catchIf(
        (error) => Option.getOrNull(postgresErrorCode(error)) === PostgresError.UNIQUE_VIOLATION,
        () => Effect.fail(factory()),
      ),
    );

export const catchSql = <A, E, R>(
  self: Effect.Effect<A, E, R>,
): Effect.Effect<A, Exclude<E, SqlError.SqlError> | InternalError, R> =>
  self.pipe(
    Effect.tapError((error) =>
      isSqlError(error) ? Effect.logError("Database error", error.cause) : Effect.void,
    ),
    Effect.mapError((error) =>
      isSqlError(error) ? new InternalError({ message: "An internal error occurred" }) : error,
    ),
  ) as Effect.Effect<A, Exclude<E, SqlError.SqlError> | InternalError, R>;
