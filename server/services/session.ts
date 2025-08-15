import { Effect, Schema as S, Data } from "effect";
import { Model } from "@effect/sql";
import { PgRootDB, withAuthContext, sql } from "../db.js";

export class Session extends Model.Class<Session>("Session")({
  uuid: S.UUID,
  user_id: S.UUID,
  created_at: Model.Generated(S.Date),
  last_active: Model.Generated(S.Date),
}) {}

export const AuthenticatedUser = S.Struct({
  sessionId: S.UUID,
  userId: S.UUID,
  username: S.NonEmptyTrimmedString,
  name: S.NullOr(S.NonEmptyTrimmedString),
  avatar_url: S.NullOr(S.NonEmptyTrimmedString),
  role: S.Union(S.Literal("user"), S.Literal("admin")),
  is_verified: S.Boolean,
});

export type AuthenticatedUser = S.Schema.Type<typeof AuthenticatedUser>;

export class SessionNotFoundError extends Data.TaggedError(
  "SessionNotFoundError",
)<{
  readonly message: string;
}> {}

export class InvalidSessionError extends Data.TaggedError(
  "InvalidSessionError",
)<{
  readonly message: string;
}> {}

export class SessionService extends Effect.Service<SessionService>()(
  "Auth/SessionService",
  {
    effect: Effect.gen(function* () {
      const db = yield* PgRootDB;

      return {
        /**
         * Lookup and validate a session by session ID
         * Returns authenticated user data if session is valid
         */
        validateSession: (sessionId: string) =>
          withAuthContext(
            sessionId,
            db
              .selectFrom("app_private.sessions as s")
              .innerJoin("app_public.users as u", "u.id", "s.user_id")
              .select([
                "s.uuid as session_id",
                "u.id as user_id",
                "u.username",
                "u.name",
                "u.avatar_url",
                "u.role",
                "u.is_verified",
              ])
              .where("s.uuid", "=", sessionId)
              .where(sql<boolean>`s.last_active > now() - '30 days'::interval`)
              .pipe(
                Effect.head,
                Effect.map(
                  (result) =>
                    ({
                      sessionId: result.session_id,
                      userId: result.user_id,
                      username: result.username,
                      name: result.name,
                      avatar_url: result.avatar_url,
                      role: result.role,
                      is_verified: result.is_verified,
                    }) as AuthenticatedUser,
                ),
                Effect.catchTag("NoSuchElementException", () =>
                  Effect.fail(
                    new SessionNotFoundError({
                      message: "Session not found or expired",
                    }),
                  ),
                ),
                Effect.tap(() =>
                  // Update last_active timestamp
                  db
                    .updateTable("app_private.sessions")
                    .set({ last_active: new Date() })
                    .where("uuid", "=", sessionId),
                ),
              ),
          ),

        /**
         * Create a new session for a user
         */
        createSession: (userId: string) =>
          db
            .insertInto("app_private.sessions")
            .values({ user_id: userId })
            .returning(["uuid", "user_id", "created_at", "last_active"])
            .pipe(Effect.map((result) => result[0])),

        /**
         * Delete a session (logout)
         */
        deleteSession: (sessionId: string) =>
          withAuthContext(
            sessionId,
            db
              .deleteFrom("app_private.sessions")
              .where("uuid", "=", sessionId)
              .pipe(
                Effect.map(
                  (result) => Number(result[0]?.numDeletedRows || 0) > 0,
                ),
              ),
          ),

        /**
         * Get all active sessions for a user
         */
        getUserSessions: (userId: string) =>
          db
            .selectFrom("app_private.sessions")
            .selectAll()
            .where("user_id", "=", userId)
            .where(
              "last_active",
              ">",
              new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
            )
            .orderBy("last_active", "desc"),

        /**
         * Delete all sessions for a user (logout everywhere)
         */
        deleteAllUserSessions: (userId: string) =>
          db
            .deleteFrom("app_private.sessions")
            .where("user_id", "=", userId)
            .pipe(
              Effect.map((result) => Number(result[0]?.numDeletedRows || 0)),
            ),
      } as const;
    }),
  },
) {
  static Live = SessionService.Default;

  static Test = Effect.succeed({
    validateSession: () =>
      Effect.fail(
        new SessionNotFoundError({ message: "Session not found or expired" }),
      ),
    createSession: () =>
      Effect.succeed({
        uuid: "test-session",
        user_id: "test-user",
        created_at: new Date(),
        last_active: new Date(),
      }),
    deleteSession: () => Effect.succeed(true),
    getUserSessions: () => Effect.succeed([]),
    deleteAllUserSessions: () => Effect.succeed(0),
  } as const);
}
