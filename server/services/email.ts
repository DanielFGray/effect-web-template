import { Effect } from "effect";
import type { AppPublicUserEmails } from "../../generated/db.js";
import type { Selectable } from "kysely";
import { sql, CurrentDb, catchSql, mapDbErrors } from "../db.js";
import {
  EmailAlreadyTaken,
  CannotDeleteLastEmail,
  EmailNotOwned,
  EmailNotVerified,
  InternalError,
} from "../../shared/errors.js";

export class Email extends Effect.Service<Email>()("User/Email", {
  accessors: true,
  effect: Effect.gen(function* () {
    return {
      addEmail: ({ email }: { email: string }) =>
        Effect.gen(function* () {
          const db = yield* CurrentDb;
          return yield* db
            .insertInto("app_public.user_emails")
            .values({ email })
            .returningAll()
            .pipe(
              Effect.head,
              Effect.mapError(
                mapDbErrors({
                  EMTKN: (msg) => new EmailAlreadyTaken({ message: msg }),
                }),
              ),
              Effect.mapError((error) =>
                error._tag === "NoSuchElementException"
                  ? new InternalError({ message: "Failed to add email" })
                  : error,
              ),
              catchSql,
            );
        }),

      removeEmail: ({ emailId }: { emailId: string }) =>
        Effect.gen(function* () {
          const db = yield* CurrentDb;
          return yield* db
            .deleteFrom("app_public.user_emails")
            .where("id", "=", emailId)
            .pipe(
              Effect.head,
              Effect.map((first) => first.numDeletedRows > 0),
              Effect.mapError(
                mapDbErrors({
                  CDLEA: (msg) => new CannotDeleteLastEmail({ message: msg }),
                }),
              ),
              Effect.mapError((error) =>
                error._tag === "NoSuchElementException"
                  ? new InternalError({ message: "Failed to remove email" })
                  : error,
              ),
              catchSql,
            );
        }),

      verifyEmail: ({ emailId, token }: { emailId: string; token: string }) =>
        Effect.gen(function* () {
          const db = yield* CurrentDb;
          return yield* db
            .selectFrom((eb) =>
              eb
                .fn<{
                  verify_email: boolean | null;
                }>("app_public.verify_email", [sql`${emailId}::uuid`, eb.val(token)])
                .as("verify_email"),
            )
            .selectAll()
            .pipe(
              Effect.head,
              Effect.map((first) => Boolean(first.verify_email)),
              catchSql,
              Effect.mapError((error) =>
                error._tag === "NoSuchElementException"
                  ? new InternalError({ message: "Email verification failed" })
                  : error,
              ),
            );
        }),

      resendVerificationEmail: ({ emailId }: { emailId: string }) =>
        Effect.gen(function* () {
          const db = yield* CurrentDb;
          return yield* db
            .selectFrom((eb) =>
              eb
                .fn<{
                  resend_email_verification_code: boolean;
                }>("app_public.resend_email_verification_code", [sql`${emailId}::uuid`])
                .as("result"),
            )
            .selectAll()
            .pipe(
              Effect.head,
              Effect.map((first) => first.resend_email_verification_code),
              catchSql,
              Effect.mapError((error) =>
                error._tag === "NoSuchElementException"
                  ? new InternalError({ message: "Failed to resend verification" })
                  : error,
              ),
            );
        }),

      makeEmailPrimary: ({ emailId }: { emailId: string }) =>
        Effect.gen(function* () {
          const db = yield* CurrentDb;
          return yield* db
            .selectFrom((eb) =>
              eb
                .fn<Selectable<AppPublicUserEmails>>("app_public.make_email_primary", [
                  sql`${emailId}::uuid`,
                ])
                .as("result"),
            )
            .selectAll()
            .pipe(
              Effect.head,
              Effect.mapError(
                mapDbErrors({
                  DNIED: (msg) => new EmailNotOwned({ message: msg }),
                  VRFY1: (msg) => new EmailNotVerified({ message: msg }),
                }),
              ),
              Effect.mapError((error) =>
                error._tag === "NoSuchElementException"
                  ? new InternalError({ message: "Failed to make email primary" })
                  : error,
              ),
              catchSql,
            );
        }),
    };
  }),
}) {
  // static Test = makeTestLayer(EmailRepo)({});
  static Live = Email.Default;
}
