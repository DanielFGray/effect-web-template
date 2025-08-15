import { Effect, Layer } from "effect";
import {
  HttpApi,
  HttpApiBuilder,
  HttpApiEndpoint,
  HttpApiGroup,
  HttpApiSchema,
  HttpServerResponse,
} from "@effect/platform";
import { Schema as S } from "effect";
import { User, UsersRepo } from "../services/users.js";
import { Email } from "../services/email.js";
import { SessionService } from "../services/session.js";
import { withRequiredAuth } from "../lib/auth-helpers.js";
import { getCurrentUserId } from "../lib/auth-context.js";
import { createUserSession } from "../lib/auth-middleware.js";

const idParam = HttpApiSchema.param("id", S.UUID);

function isValidPassword(password: unknown) {
  // Password validation logic: at least 8 characters
  return typeof password === "string" && password.length >= 8;
}

const Password = S.NonEmptyTrimmedString.pipe(
  S.filter(isValidPassword, {
    identifier: "Password",
    title: "Password",
    jsonSchema: { minLength: 8 },
  }),
);

export const UsersApiGroup = HttpApiGroup.make("users")
  .add(
    HttpApiEndpoint.post("register", "/auth/register")
      .setPayload(
        S.Struct({
          username: S.NonEmptyTrimmedString,
          password: Password,
          email: S.NullOr(Email),
        }),
      )
      .addSuccess(User.select, { status: 201 }),
  )

  .add(
    HttpApiEndpoint.post("login", "/auth/login")
      .setPayload(
        S.Struct({
          id: S.NonEmptyTrimmedString,
          password: S.NonEmptyTrimmedString,
        }),
      )
      .addSuccess(User.select),
  )

  .add(HttpApiEndpoint.post("logout", "/auth/logout").addSuccess(S.Void))

  .add(
    HttpApiEndpoint.post(
      "request-deletion",
      "/auth/request-deletion",
    ).addSuccess(S.Struct({ request_account_deletion: S.Boolean })),
  )

  .add(
    HttpApiEndpoint.post("confirm-deletion", "/auth/confirm-deletion")
      .setPayload(
        S.Struct({
          token: S.NonEmptyTrimmedString,
        }),
      )
      .addSuccess(
        S.Struct({
          confirm_account_deletion: S.Boolean,
        }),
      ),
  )

  .add(
    HttpApiEndpoint.post("forgot-password", "/auth/forgot-password")
      .setPayload(S.Struct({ email: Email }))
      .addSuccess(S.Void),
  )

  .add(
    HttpApiEndpoint.post("reset-password", "/auth/reset-password")
      .setPayload(
        S.Struct({
          userId: S.UUID,
          token: S.NonEmptyTrimmedString,
          password: Password,
        }),
      )
      .addSuccess(
        S.Struct({
          reset_password: S.Boolean,
        }),
      ),
  )

  .add(
    HttpApiEndpoint.post("change-password", "/auth/change-password")
      .setPayload(
        S.Struct({
          oldPassword: S.NonEmptyTrimmedString,
          newPassword: Password,
        }),
      )
      .addSuccess(
        S.Struct({
          change_password: S.Boolean,
        }),
      ),
  )

  .add(
    HttpApiEndpoint.patch("update-profile", "/profile")
      .setPayload(User.update.pick("username", "name", "avatar_url", "bio"))
      .addSuccess(User.select),
  )

  .add(
    HttpApiEndpoint.post(
      "oauth-link",
    )`/auth/${HttpApiSchema.param("provider", S.String)}`
      .setPayload(
        S.Struct({
          userId: S.NullOr(S.String),
          username: S.String,
          serviceData: S.Record({ key: S.String, value: S.Unknown }),
          profile: S.Record({ key: S.String, value: S.Unknown }),
          tokens: S.Record({ key: S.String, value: S.Unknown }),
        }),
      )
      .addSuccess(S.Void),
  )

  .add(
    HttpApiEndpoint.del("oauth-unlink")`/oauth/${idParam}`.addSuccess(
      S.Boolean,
    ),
  );

export const UsersApi = HttpApi.make("UsersApi").add(UsersApiGroup);

export const UsersApiGroupLive = HttpApiBuilder.group(
  UsersApi,
  "users",
  (handlers) =>
    Effect.gen(function* () {
      const repo = yield* UsersRepo;
      const sessionService = yield* SessionService;
      return handlers
        .handle("register", ({ payload }) =>
          Effect.gen(function* () {
            const user = yield* repo.register(payload).pipe(Effect.head);
            const session = yield* sessionService.createSession(user.id);

            // Create response with session cookie set
            return yield* HttpServerResponse.json(user, { status: 201 }).pipe(
              HttpServerResponse.setCookie("session", session.uuid, {
                httpOnly: true,
                secure: false, // Set to true in production with HTTPS
                sameSite: "lax",
                path: "/",
                maxAge: "30 days",
              }),
            );
          }),
        )
        .handle("login", ({ payload }) =>
          Effect.gen(function* () {
            const user = yield* repo.login(payload).pipe(Effect.head);
            const session = yield* sessionService.createSession(user.id);

            return yield* HttpServerResponse.json(user).pipe(
              HttpServerResponse.setCookie("session", session.uuid, {
                httpOnly: true,
                secure: false, // Set to true in production with HTTPS
                sameSite: "lax",
                path: "/",
                maxAge: "30 days",
              }),
            );
          }),
        )
        .handle("logout", ({ request }) =>
          withRequiredAuth(request, repo.logout()).pipe(
            Effect.head,
            Effect.map((first) => first.result),
          ),
        )
        .handle("request-deletion", ({ request }) =>
          withRequiredAuth(request, repo.requestAccountDeletion()).pipe(
            Effect.head,
          ),
        )
        .handle("confirm-deletion", ({ request, payload }) =>
          withRequiredAuth(request, repo.confirmAccountDeletion(payload)).pipe(
            Effect.head,
            Effect.map((first) => ({
              confirm_account_deletion: first.confirm_account_deletion,
            })),
          ),
        )
        .handle("forgot-password", ({ payload }) =>
          repo.forgotPassword(payload).pipe(
            Effect.head,
            Effect.map((first) => first.result),
          ),
        )
        .handle("reset-password", ({ payload }) =>
          repo.resetPassword(payload).pipe(
            Effect.head,
            Effect.map(({ result }) => ({
              reset_password: Boolean(result.reset_password),
            })),
          ),
        )
        .handle("change-password", ({ request, payload }) =>
          withRequiredAuth(request, repo.changePassword(payload)).pipe(
            Effect.head,
            Effect.map(({ result }) => ({
              change_password: Boolean(result.change_password),
            })),
          ),
        )
        .handle("update-profile", ({ request, payload }) =>
          withRequiredAuth(
            request,
            Effect.gen(function* () {
              const userId = yield* getCurrentUserId();
              return yield* repo.updateProfile({ ...payload, userId });
            }),
          ).pipe(Effect.head),
        )
        .handle("oauth-link", ({ payload }) =>
          repo.oauthLink(payload).pipe(
            Effect.head,
            Effect.map(() => undefined as void),
          ),
        )
        .handle("oauth-unlink", ({ path: { id }, request }) =>
          withRequiredAuth(request, repo.oauthUnlink({ id })).pipe(
            Effect.head,
            Effect.map((result) => result.numDeletedRows > 0),
          ),
        );
    }),
);

// Layer for the complete Users API
export const UsersApiLive = HttpApiBuilder.api(UsersApi).pipe(
  Layer.provide(UsersApiGroupLive),
  Layer.provide(UsersRepo.Live),
);
