import { Effect, Layer, Schema as S } from "effect";
import {
  HttpApi,
  HttpApiBuilder,
  HttpApiEndpoint,
  HttpApiGroup,
  HttpApiSchema,
} from "@effect/platform";
import { Email, EmailRepo, UserEmail } from "../services/email.js";
import { withRequiredAuth } from "../lib/auth-helpers.js";

const idParam = HttpApiSchema.param("id", S.UUID);

export const EmailApiGroup = HttpApiGroup.make("email")
  .add(
    HttpApiEndpoint.post("add-email", "/emails")
      .setPayload(S.Struct({ email: Email }))
      .addSuccess(UserEmail, { status: 201 }),
  )

  .add(
    HttpApiEndpoint.patch(
      "make-email-primary",
    )`/emails/${idParam}/primary`.addSuccess(UserEmail.select),
  )

  .add(
    HttpApiEndpoint.del("remove-email")`/emails/${idParam}`.addSuccess(
      S.Boolean,
    ),
  )

  .add(
    HttpApiEndpoint.post(
      "resend-verification",
    )`/emails/${idParam}/resend`.addSuccess(S.Boolean),
  )

  .add(
    HttpApiEndpoint.post("verify-email")`/emails/${idParam}/verify`
      .setPayload(
        S.Struct({
          token: S.NonEmptyTrimmedString,
        }),
      )
      .addSuccess(S.Boolean),
  );

export const EmailApi = HttpApi.make("EmailApi").add(EmailApiGroup);

export const EmailApiGroupLive = HttpApiBuilder.group(
  EmailApi,
  "email",
  (handlers) =>
    Effect.gen(function* () {
      const repo = yield* EmailRepo;
      return handlers
        .handle("add-email", ({ request, payload }) =>
          withRequiredAuth(request, repo.addEmail(payload)).pipe(
            Effect.head,
            Effect.orDie,
          ),
        )
        .handle("make-email-primary", ({ request, path: { id } }) =>
          withRequiredAuth(
            request,
            repo.makeEmailPrimary({ emailId: id }),
          ).pipe(Effect.head, Effect.orDie),
        )
        .handle("remove-email", ({ request, path: { id } }) =>
          withRequiredAuth(request, repo.removeEmail({ emailId: id })).pipe(
            Effect.head,
            Effect.map((first) => first.numDeletedRows > 0),
            Effect.orDie,
          ),
        )
        .handle("resend-verification", ({ request, path: { id } }) =>
          withRequiredAuth(
            request,
            repo.resendVerificationEmail({ emailId: id }),
          ).pipe(
            Effect.head,
            Effect.map((first) => first.resend_email_verification_code),
            Effect.orDie,
          ),
        )
        .handle(
          "verify-email",
          ({ request, path: { id }, payload: { token } }) =>
            withRequiredAuth(
              request,
              repo.verifyEmail({ emailId: id, token }).pipe(
                Effect.head,
                Effect.map((first) => Boolean(first.verify_email)),
                Effect.orDie,
              ),
            ),
        );
    }),
);

// Layer for the complete Email API
export const EmailApiLive = HttpApiBuilder.api(EmailApi).pipe(
  Layer.provide(EmailApiGroupLive),
  Layer.provide(EmailRepo.Default),
);
