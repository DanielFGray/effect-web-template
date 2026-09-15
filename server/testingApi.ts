import { Config, Effect, Layer, Schema as S } from "effect";
import {
  HttpApi,
  HttpApiBuilder,
  HttpApiEndpoint,
  HttpApiGroup,
} from "@effect/platform";
import { PgRootDB } from "./db.js";
import { catchSql } from "./db.js";
import { InternalError } from "../shared/errors.js";
import { Users } from "./services/users.js";

const TestingApiGroup = HttpApiGroup.make("TestingApi")
  .add(
    HttpApiEndpoint.get("clearTestUsers", "/clearTestUsers")
      .addSuccess(S.Struct({ success: S.Boolean }))
      .addError(InternalError, { status: 500 }),
  )
  .add(
    HttpApiEndpoint.get("clearTestOrganizations", "/clearTestOrganizations")
      .addSuccess(S.Struct({ success: S.Boolean }))
      .addError(InternalError, { status: 500 }),
  )
  .add(
    HttpApiEndpoint.post("createUser", "/createUser")
      .setPayload(
        S.Struct({
          username: S.optionalWith(S.String, { default: () => "testuser" }),
          email: S.optionalWith(S.String, { default: () => "testuser@example.com" }),
          verified: S.optionalWith(S.Boolean, { default: () => false }),
          name: S.optional(S.String),
          avatarUrl: S.optionalWith(S.NullOr(S.String), { default: () => null }),
          password: S.optionalWith(S.String, { default: () => "TestUserPassword" }),
        }),
      )
      .addSuccess(S.Struct({
        user: S.Object,
        userEmailId: S.String,
        verificationToken: S.NullOr(S.String),
      }))
      .addError(InternalError, { status: 500 }),
  )
  .add(
    HttpApiEndpoint.get("getUserSecrets", "/getUserSecrets")
      .setPayload(S.Struct({ username: S.String }))
      .addSuccess(S.Object)
      .addError(InternalError, { status: 500 }),
  )
  .add(
    HttpApiEndpoint.get("getEmailSecrets", "/getEmailSecrets")
      .setPayload(S.Struct({ email: S.String }))
      .addSuccess(S.Object)
      .addError(InternalError, { status: 500 }),
  )
  .add(
    HttpApiEndpoint.get("verifyUser", "/verifyUser")
      .setPayload(S.Struct({ username: S.String }))
      .addSuccess(S.Struct({ success: S.Boolean }))
      .addError(InternalError, { status: 500 }),
  );

export const TestingApi = HttpApi.make("TestingApi").add(TestingApiGroup);

export const TestingApiGroupLive = HttpApiBuilder.group(
  TestingApi,
  "TestingApi",
  (handlers) =>
    Effect.gen(function* () {
      const db = yield* PgRootDB;
      const userService = yield* Users;

      return handlers
        .handle("clearTestUsers", () =>
          Effect.gen(function* () {
            yield* db
              .deleteFrom("app_public.users")
              .where("username", "like", "testuser%")
              .pipe(catchSql);
            return { success: true };
          }),
        )
        .handle("clearTestOrganizations", () =>
          Effect.gen(function* () {
            yield* db
              .deleteFrom("app_public.organizations")
              .where("slug", "like", "test%")
              .pipe(catchSql);
            return { success: true };
          }),
        )
        .handle("createUser", ({ payload }) =>
          Effect.gen(function* () {
            const user = yield* userService.queries
              .reallyCreateUser({
                username: payload.username ?? "testuser",
                email: payload.email ?? `${payload.username ?? "testuser"}@example.com`,
                verified: payload.verified ?? false,
                name: payload.name ?? payload.username ?? "testuser",
                avatarUrl: payload.avatarUrl ?? null,
                password: payload.password ?? "TestUserPassword",
              })
              .pipe(
                Effect.head,
                catchSql,
                Effect.mapError((error) =>
                  error._tag === "NoSuchElementException"
                    ? new InternalError({ message: "User creation failed" })
                    : error,
                ),
              );

            const lookupEmail = payload.email ?? `${payload.username ?? "testuser"}@example.com`;

            const emailSecrets = yield* db
              .selectFrom("app_private.user_email_secrets")
              .selectAll()
              .where("user_email_id", "=", (eb) =>
                eb
                  .selectFrom("app_public.user_emails")
                  .select("id")
                  .where("email", "=", lookupEmail)
                  .orderBy("id", "desc")
                  .limit(1),
              )
              .pipe(
                Effect.head,
                catchSql,
                Effect.mapError((error) =>
                  error._tag === "NoSuchElementException"
                    ? new InternalError({ message: "Email secrets not found" })
                    : error,
                ),
              );

            return {
              user,
              userEmailId: emailSecrets.user_email_id,
              verificationToken: payload.verified
                ? null
                : emailSecrets.verification_token,
            };
          }),
        )
        .handle("getUserSecrets", ({ payload }) =>
          db
            .selectFrom("app_private.user_secrets")
            .selectAll()
            .where("user_id", "=", (eb) =>
              eb
                .selectFrom("app_public.users")
                .select("id")
                .where("username", "=", payload.username),
            )
            .pipe(
              Effect.head,
              catchSql,
              Effect.mapError((error) =>
                error._tag === "NoSuchElementException"
                  ? new InternalError({ message: "User secrets not found" })
                  : error,
              ),
            ),
        )
        .handle("getEmailSecrets", ({ payload }) =>
          db
            .selectFrom("app_private.user_email_secrets")
            .selectAll()
            .where("user_email_id", "=", (eb) =>
              eb
                .selectFrom("app_public.user_emails")
                .select("id")
                .where("email", "=", payload.email)
                .orderBy("id", "desc")
                .limit(1),
            )
            .pipe(
              Effect.head,
              catchSql,
              Effect.mapError((error) =>
                error._tag === "NoSuchElementException"
                  ? new InternalError({ message: "Email secrets not found" })
                  : error,
              ),
            ),
        )
        .handle("verifyUser", ({ payload }) =>
          Effect.gen(function* () {
            yield* db
              .updateTable("app_public.users")
              .set({ is_verified: true })
              .where("username", "=", payload.username)
              .pipe(catchSql);
            return { success: true };
          }),
        );
    }),
);

export const TestingApiLive = Layer.unwrapEffect(
  Effect.gen(function* () {
    const nodeEnv = yield* Config.string("NODE_ENV").pipe(
      Config.withDefault("development"),
    );
    if (nodeEnv === "production") {
      return yield* Effect.dieMessage(
        "testing API must not run in production",
      );
    }
    return TestingApiGroupLive;
  }),
);
