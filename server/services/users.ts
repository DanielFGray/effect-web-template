import { Model } from "@effect/sql";
import { Effect, Schema as S } from "effect";
import type { Selectable } from "kysely";
import type { AppPublicUserEmails } from "kysely-codegen";
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

export class UsersRepo extends Effect.Service<UsersRepo>()("Auth/Accounts", {
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
          .where((eb) => eb.not(eb(eb.ref("u"), "is", null))),

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
          .where((eb) => eb.not(eb(eb.ref("u"), "is", null))),

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
        db.selectNoFrom((eb) => [
          eb
            .fn<{
              change_password: boolean | null;
            }>("app_public.change_password", [
              eb.val(oldPassword),
              eb.val(newPassword),
            ])
            .as("result"),
        ]),

      forgotPassword: ({ email }: { email: string }) =>
        db.selectNoFrom((eb) => [
          eb
            .fn<{
              forgot_password: unknown | null;
            }>("app_public.forgot_password", [eb.val(email)])
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
              eb.val(userId),
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
          .with("create_user", (eb) =>
            eb
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
          )
          .with("create_session", (eb) =>
            eb
              .insertInto("app_private.sessions")
              .expression((eb) => eb.selectFrom("create_user").select(["id"]))
              .returning((eb) => [eb.ref("uuid"), eb.ref("user_id")]),
          )
          .selectNoFrom((eb) => [
            eb
              .fn<{
                user_id: string;
                session_id: string;
              }>("json_build_object", [
                sql.lit("user_id"),
                eb.selectFrom("create_user").select(["user_id"]),
                sql.lit("session_id"),
                eb.selectFrom("create_session").select(["uuid"]),
              ])
              .as("result"),
          ]),

      oauthUnlink: ({ id }: { id: string }) =>
        db.deleteFrom("app_public.user_authentications").where("id", "=", id),

      addEmail: ({ email }: { email: string }) =>
        db
          .insertInto("app_public.user_emails")
          .values({ email })
          .returningAll(),

      removeEmail: ({ emailId }: { emailId: string }) =>
        db
          .deleteFrom("app_public.user_emails")
          .where("id", "=", emailId)
          .returningAll(),

      verifyEmail: ({ emailId, token }: { emailId: string; token: string }) =>
        db
          .selectFrom((eb) =>
            eb
              .fn<{
                verify_email: boolean | null;
              }>("app_public.verify_email", [eb.val(emailId), eb.val(token)])
              .as("verify_email"),
          )
          .selectAll(),

      makeEmailPrimary: ({ emailId }: { emailId: string }) =>
        db
          .selectFrom((eb) =>
            eb
              .fn<
                Selectable<AppPublicUserEmails>
              >("app_public.make_email_primary", [eb.val(emailId)])
              .as("result"),
          )
          .selectAll(),

      resendVerificationEmail: ({ emailId }: { emailId: string }) =>
        db
          .selectNoFrom((eb) => [
            eb
              .fn<{
                resend_email_verification_code: boolean;
              }>("app_public.resend_email_verification_code", [eb.val(emailId)])
              .as("result"),
          ])
          .selectAll(),

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
}
