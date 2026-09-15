import { Effect } from "effect";
import { HttpApiBuilder } from "@effect/platform";
import { Email } from "../services/email.js";
import { withAuthContext } from "../db.js";
import { Contract } from "../../shared/httpApi.js";

export const EmailApiGroupLive = HttpApiBuilder.group(Contract, "email", (handlers) =>
  handlers
    .handle("addEmail", ({ payload }) =>
      Effect.gen(function* () {
        const email = yield* Email;
        return yield* email.addEmail(payload);
      }).pipe(withAuthContext),
    )
    .handle("makeEmailPrimary", ({ path: { id } }) =>
      Effect.gen(function* () {
        const email = yield* Email;
        return yield* email.makeEmailPrimary({ emailId: id });
      }).pipe(withAuthContext),
    )
    .handle("removeEmail", ({ path: { id } }) =>
      Effect.gen(function* () {
        const email = yield* Email;
        return yield* email.removeEmail({ emailId: id });
      }).pipe(withAuthContext),
    )
    .handle("resendVerification", ({ path: { id } }) =>
      Effect.gen(function* () {
        const email = yield* Email;
        return yield* email.resendVerificationEmail({ emailId: id });
      }).pipe(withAuthContext),
    )
    .handle("verifyEmail", ({ path: { id }, payload: { token } }) =>
      Effect.gen(function* () {
        const email = yield* Email;
        return yield* email.verifyEmail({ emailId: id, token });
      }).pipe(withAuthContext),
    ),
);
