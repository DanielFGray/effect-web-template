import { Effect, Schema as S, Data } from "effect";
import { Model } from "@effect/sql";
import type { AppPublicUserEmails } from "kysely-codegen";
import type { Selectable } from "kysely";
import { sql, PgRootDB } from "../db.js";

export type Email = string & { __brand: "Email" };

const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;

const isValidEmail = (email: string): email is Email => {
  return emailRegex.test(email);
};

export const Email = S.String.pipe(
  S.filter(isValidEmail, {
    identifier: "Email",
    title: "Email",
    jsonSchema: { format: "email", minLength: 6, /* a@b.xx */ maxLength: 998 },
  }),
);

export class UserEmail extends Model.Class<UserEmail>("UserEmail")({
  id: Model.Generated(S.UUID),
  user_id: S.UUID,
  email: S.String,
  is_verified: S.Boolean,
  is_primary: S.Boolean,
  created_at: Model.Generated(S.Date),
  updated_at: Model.Generated(S.Date),
}) {}

// Email management errors
export class EmailAlreadyTakenError extends Data.TaggedError(
  "EmailAlreadyTaken",
)<{
  readonly message: string;
  readonly email: string;
}> {}

export class CannotDeleteLastEmailError extends Data.TaggedError(
  "CannotDeleteLastEmail",
)<{
  readonly message: string;
}> {}

export class EmailNotOwnedError extends Data.TaggedError("EmailNotOwned")<{
  readonly message: string;
  readonly emailId: string;
}> {}

export class EmailNotVerifiedError extends Data.TaggedError(
  "EmailNotVerified",
)<{
  readonly message: string;
  readonly emailId: string;
}> {}

export class EmailRepo extends Effect.Service<EmailRepo>()("User/Email", {
  effect: Effect.gen(function* () {
    const db = yield* PgRootDB;
    return {
      addEmail: ({ email }: { email: string }) =>
        db
          .insertInto("app_public.user_emails")
          .values({ email })
          .returningAll()
          .pipe(
            Effect.mapError((error) => {
              if (
                error._tag === "SqlError" &&
                "code" in error &&
                error.code === "EMTKN"
              ) {
                return new EmailAlreadyTakenError({
                  message:
                    "An account using that email address has already been created",
                  email,
                });
              }
              return error;
            }),
          ),

      removeEmail: ({ emailId }: { emailId: string }) =>
        db
          .deleteFrom("app_public.user_emails")
          .where("id", "=", emailId)
          .pipe(
            Effect.mapError((error) => {
              if (
                error._tag === "SqlError" &&
                "code" in error &&
                error.code === "CDLEA"
              ) {
                return new CannotDeleteLastEmailError({
                  message:
                    "You must have at least one (verified) email address",
                });
              }
              return error;
            }),
          ),

      verifyEmail: ({ emailId, token }: { emailId: string; token: string }) =>
        db
          .selectFrom((eb) =>
            eb
              .fn<{
                verify_email: boolean | null;
              }>("app_public.verify_email", [
                sql`${emailId}::uuid`,
                eb.val(token),
              ])
              .as("verify_email"),
          )
          .selectAll(),

      resendVerificationEmail: ({ emailId }: { emailId: string }) =>
        db
          .selectFrom((eb) =>
            eb
              .fn<{
                resend_email_verification_code: boolean;
              }>("app_public.resend_email_verification_code", [
                sql`${emailId}::uuid`,
              ])
              .as("result"),
          )
          .selectAll(),

      makeEmailPrimary: ({ emailId }: { emailId: string }) =>
        db
          .selectFrom((eb) =>
            eb
              .fn<
                Selectable<AppPublicUserEmails>
              >("app_public.make_email_primary", [sql`${emailId}::uuid`])
              .as("result"),
          )
          .selectAll()
          .pipe(
            Effect.mapError((error) => {
              if (error._tag === "SqlError" && "code" in error) {
                switch (error.code) {
                  case "DNIED":
                    return new EmailNotOwnedError({
                      message: "That's not your email",
                      emailId,
                    });

                  case "VRFY1":
                    return new EmailNotVerifiedError({
                      message: "You may not make an unverified email primary",
                      emailId,
                    });
                }
              }
              return error;
            }),
          ),
    } as const;
  }),
}) {
  // static Test = makeTestLayer(EmailRepo)({});
  static Live = EmailRepo.Default;
}
