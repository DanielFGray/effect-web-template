import { Effect, Config } from "effect";
import { HttpApiBuilder, HttpServerResponse } from "@effect/platform";
import { Users } from "../services/users.js";
import { Sessions } from "../services/session.js";
import { CookieSigner } from "../services/cookie-signer.js";
import { withAuthContext } from "../db.js";
import { Contract } from "../../shared/httpApi.js";

const withSessionCookie = Effect.fnUntraced(function* (
  sessionId: string,
  response: HttpServerResponse.HttpServerResponse,
) {
  const signedSessionId = yield* CookieSigner.sign(sessionId);
  return yield* HttpServerResponse.setCookie(response, "session", signedSessionId, {
    httpOnly: true,
    secure: (yield* Config.string("NODE_ENV")) === "production",
    sameSite: "lax",
    path: "/",
    maxAge: "30 days",
  });
}, Effect.orDie);

export const UsersApiGroupLive = HttpApiBuilder.group(Contract, "users", (handlers) =>
  handlers
    .handle(
      "register",
      Effect.fnUntraced(function* ({ payload }) {
        const user = yield* Users.register(payload);
        const session = yield* Sessions.createSession(user.id);
        return yield* withSessionCookie(
          session.uuid,
          yield* HttpServerResponse.json(user, { status: 201 }).pipe(Effect.orDie),
        );
      }),
    )
    .handle(
      "login",
      Effect.fnUntraced(function* ({ payload }) {
        const user = yield* Users.login(payload);
        const session = yield* Sessions.createSession(user.id);
        return yield* withSessionCookie(
          session.uuid,
          yield* HttpServerResponse.json(user).pipe(Effect.orDie),
        );
      }),
    )
    .handle("resetPassword", ({ payload }) => Users.resetPassword(payload))
    .handle("logout", () => Users.logout())
    .handle("requestDeletion", () => Users.requestAccountDeletion().pipe(withAuthContext))
    .handle("confirmDeletion", ({ payload }) =>
      Users.confirmAccountDeletion(payload).pipe(withAuthContext),
    )
    .handle("forgotPassword", ({ payload }) => Users.forgotPassword(payload))
    .handle("changePassword", ({ payload }) => Users.changePassword(payload).pipe(withAuthContext))
    .handle("updateProfile", ({ payload }) => Users.updateProfile(payload).pipe(withAuthContext))
    .handle("oauthLink", ({ payload }) => Users.oauthLink(payload))
    .handle("oauthUnlink", ({ path: { id } }) => Users.oauthUnlink({ id }).pipe(withAuthContext)),
);
