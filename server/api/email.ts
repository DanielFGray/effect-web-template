import { HttpApiBuilder } from "@effect/platform";
import { Email } from "../services/email.js";
import { withAuthContext } from "../db.js";
import { Contract } from "../../shared/httpApi.js";

export const EmailApiGroupLive = HttpApiBuilder.group(Contract, "email", (handlers) =>
  handlers
    .handle("addEmail", ({ payload }) => Email.addEmail(payload).pipe(withAuthContext))
    .handle("makeEmailPrimary", ({ path: { id } }) =>
      Email.makeEmailPrimary({ emailId: id }).pipe(withAuthContext),
    )
    .handle("removeEmail", ({ path: { id } }) =>
      Email.removeEmail({ emailId: id }).pipe(withAuthContext),
    )
    .handle("resendVerification", ({ path: { id } }) =>
      Email.resendVerificationEmail({ emailId: id }).pipe(withAuthContext),
    )
    .handle("verifyEmail", ({ path: { id }, payload: { token } }) =>
      Email.verifyEmail({ emailId: id, token }).pipe(withAuthContext),
    ),
);
