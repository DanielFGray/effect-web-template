import { Model } from "@effect/sql";
import { Effect, Schema as S, Data } from "effect";
import { PgRootDB, sql } from "../db.js";

export class User extends Model.Class<User>("User")({
  id: Model.Generated(S.UUID),
  username: S.NonEmptyTrimmedString,
  name: S.NullOr(S.NonEmptyTrimmedString),
  avatar_url: S.NullOr(S.NonEmptyTrimmedString),
  bio: S.NullOr(S.NonEmptyTrimmedString),
  role: S.Union(S.Literal("user"), S.Literal("admin")),
  is_verified: S.Boolean,
  created_at: Model.Generated(S.Date),
  updated_at: Model.Generated(S.Date),
}) {}

type SelectableUser = typeof User.select.Type;

// Authentication and account security errors
export class AccountLockedError extends Data.TaggedError("AccountLocked")<{
  readonly message: string;
  readonly lockType: "login_attempts" | "password_reset";
}> {}

export class WeakPasswordError extends Data.TaggedError("WeakPassword")<{
  readonly message: string;
  readonly requirements?: string[];
}> {}

export class AuthenticationRequiredError extends Data.TaggedError(
  "AuthenticationRequired",
)<{
  readonly message: string;
  readonly action: string;
}> {}

export class InvalidCredentialsError extends Data.TaggedError(
  "InvalidCredentials",
)<{
  readonly message: string;
}> {}

export class MissingDataError extends Data.TaggedError("MissingData")<{
  readonly message: string;
  readonly field: "email" | "password" | "username";
}> {}

export class AccountAlreadyLinkedError extends Data.TaggedError(
  "AccountAlreadyLinked",
)<{
  readonly message: string;
  readonly service: string;
}> {}

export class AccessDeniedError extends Data.TaggedError("AccessDenied")<{
  readonly message: string;
  readonly reason: "invalid_token" | "expired_token" | "wrong_account";
}> {}

export class UsersRepo extends Effect.Service<UsersRepo>()("User/Accounts", {
  effect: Effect.gen(function* () {
    const db = yield* PgRootDB;

    return {
      login: ({ id, password }: { id: string; password: string }) =>
        db
          .selectFrom((eb) =>
            eb
              .fn<
                typeof User.Type
              >("app_private.login", [sql`${id}::citext`, eb.val(password)])
              .as("u"),
          )
          .selectAll()
          // @ts-expect-error: Kysely doesn't seem to allow referencing tables directly
          .where((eb) => eb.not(eb(eb.ref("u"), "is", null)))
          .pipe(
            Effect.mapError((error) => {
              if (
                error._tag === "SqlError" &&
                "code" in error &&
                error.code === "LOCKD"
              ) {
                return new AccountLockedError({
                  message:
                    "User account locked - too many login attempts. Try again after 5 minutes.",
                  lockType: "login_attempts",
                });
              }
              return error;
            }),
          ),

      logout: () =>
        db.selectNoFrom((eb) => [
          eb.fn<void>("app_public.logout", []).as("result"),
        ]),

      register: ({
        username,
        password,
        email,
      }: {
        username: string;
        password: string;
        email?: string | null;
      }) =>
        db
          .selectFrom(
            sql<typeof User.Type>`
          app_private.really_create_user(
            username => ${username}::citext,
            email => ${email || null},
            email_is_verified => false,
            name => null,
            avatar_url => null,
            password => ${password}::text
          )`.as("u"),
          )
          .selectAll()
          // @ts-expect-error: Kysely doesn't seem to allow referencing tables directly
          .where((eb) => eb.not(eb(eb.ref("u"), "is", null)))
          .pipe(
            Effect.mapError((error) => {
              if (error._tag === "SqlError" && "code" in error) {
                switch (error.code) {
                  case "MODAT":
                    return new MissingDataError({
                      message: "Email is required",
                      field: "email",
                    });

                  case "MODAT":
                    return new MissingDataError({
                      message: "Password is required",
                      field: "password",
                    });

                  case "WEAKP":
                    return new WeakPasswordError({
                      message: "Password is too weak",
                      requirements: ["At least 8 characters"],
                    });

                  case "TAKEN":
                    return new AccountAlreadyLinkedError({
                      message:
                        "A different user already has this account linked",
                      service: "oauth",
                    });
                }
              }
              return error;
            }),
          ),

      updateProfile: ({
        userId,
        username,
        name,
        bio,
        avatar_url,
      }: {
        userId: string;
        username: string;
        name?: string | null;
        bio?: string | null;
        avatar_url?: string | null;
      }) =>
        db
          .updateTable("app_public.users")
          .set({ username, name, bio, avatar_url })
          .where("id", "=", userId)
          .returningAll(),

      changePassword: ({
        oldPassword,
        newPassword,
      }: {
        oldPassword: string;
        newPassword: string;
      }) =>
        db
          .selectNoFrom((eb) => [
            eb
              .fn<{
                change_password: boolean | null;
              }>("app_public.change_password", [
                eb.val(oldPassword),
                eb.val(newPassword),
              ])
              .as("result"),
          ])
          .pipe(
            Effect.mapError((error) => {
              if (error._tag === "SqlError" && "code" in error) {
                switch (error.code) {
                  case "LOGIN":
                    return new AuthenticationRequiredError({
                      message: "You must log in to change your password",
                      action: "change_password",
                    });

                  case "CREDS": {
                    return new InvalidCredentialsError({
                      message: "Incorrect password",
                    });
                  }
                  case "WEAKP": {
                    return new WeakPasswordError({
                      message: "Password is too weak",
                      requirements: ["At least 8 characters"],
                    });
                  }
                }
              }
              return error;
            }),
          ),

      forgotPassword: ({ email }: { email: string }) =>
        db.selectNoFrom((eb) => [
          eb
            .fn<void>("app_public.forgot_password", [eb.val(email)])
            .as("result"),
        ]),

      resetPassword: ({
        userId,
        token,
        password,
      }: {
        userId: string;
        token: string;
        password: string;
      }) =>
        db.selectNoFrom((eb) => [
          eb
            .fn<{
              reset_password: boolean | null;
            }>("app_private.reset_password", [
              sql`${userId}::uuid`,
              eb.val(token),
              eb.val(password),
            ])
            .as("result"),
        ]),

      oauthLink: ({
        userId,
        serviceData,
        username,
        profile,
        tokens,
      }: {
        userId: string | null;
        username: string;
        serviceData: Record<string, unknown>;
        profile: Record<string, unknown>;
        tokens: Record<string, unknown>;
      }) =>
        db
          .selectFrom((eb) =>
            eb
              .fn<SelectableUser>("app_private.link_or_register_user", [
                sql`f_user_id => ${userId ?? null}`,
                sql`f_service => ${serviceData}`,
                sql`f_identifier => ${username}`,
                sql`f_profile => ${JSON.stringify(profile)}`,
                sql`f_auth_details => ${JSON.stringify(tokens)}`,
              ])
              .as("u"),
          )
          .selectAll(),

      oauthUnlink: ({ id }: { id: string }) =>
        db.deleteFrom("app_public.user_authentications").where("id", "=", id),

      requestAccountDeletion: () =>
        db
          .selectFrom((eb) =>
            eb
              .fn<{
                request_account_deletion: boolean;
              }>("app_public.request_account_deletion", [])
              .as("request_account_deletion"),
          )
          .selectAll(),

      confirmAccountDeletion: ({ token }: { token: string }) =>
        db
          .selectFrom((eb) =>
            eb
              .fn<{
                confirm_account_deletion: boolean;
              }>("app_public.confirm_account_deletion", [eb.val(token)])
              .as("confirm_account_deletion"),
          )
          .selectAll(),
    } as const;
  }),
}) {
  // static Test = makeTestLayer(UsersRepo)({});
  static Live = UsersRepo.Default;
}
