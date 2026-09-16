import {
  HttpApi,
  HttpApiEndpoint,
  HttpApiGroup,
  HttpApiSchema,
} from "@effect/platform";
import { Schema as S } from "effect";
import {
  User,
  Post,
  PostWithDetails,
  UserEmail,
  Password,
  EmailSchema,
  AuthenticatedUser,
} from "./schemas.js";
import {
  InternalError,
  InvalidCredentials,
  AccountLocked,
  WeakPassword,
  MissingData,
  AccountAlreadyLinked,
  UsernameTaken,
  AuthenticationRequired,
  EmailAlreadyTaken,
  EmailNotOwned,
  EmailNotVerified,
  CannotDeleteLastEmail,
} from "./errors.js";

const idParam = HttpApiSchema.param("id", S.BigInt);
const uuidParam = HttpApiSchema.param("id", S.UUID);

const PostsGroup = HttpApiGroup.make("posts")
  .add(
    HttpApiEndpoint.get("list", "/posts")
      .setUrlParams(
        S.partial(
          S.Struct({
            username: S.NonEmptyTrimmedString,
            sort: S.Union(
              S.Literal("created_at"),
              S.Literal("updated_at"),
              S.Literal("stars"),
            ),
          }),
        ),
      )
      .addSuccess(S.Array(PostWithDetails)),
  )
  .add(
    HttpApiEndpoint.get("getById")`/posts/${idParam}`.addSuccess(
      S.NullOr(PostWithDetails),
    ),
  )
  .add(
    HttpApiEndpoint.post("create", "/posts")
      .setPayload(Post.insert)
      .addSuccess(S.NullOr(Post.select.pick("id")), { status: 201 }),
  );

const UsersGroup = HttpApiGroup.make("users")
  .add(HttpApiEndpoint.get("me", "/auth/me").addSuccess(S.NullOr(AuthenticatedUser)))
  .add(
    HttpApiEndpoint.post("register", "/auth/register")
      .setPayload(
        S.Struct({
          username: S.NonEmptyTrimmedString,
          password: Password,
          email: S.NullOr(EmailSchema),
        }),
      )
      .addSuccess(User.select, { status: 201 })
      .addError(MissingData, { status: 400 })
      .addError(WeakPassword, { status: 400 })
      .addError(AccountAlreadyLinked, { status: 409 })
      .addError(UsernameTaken, { status: 409 }),
  )
  .add(
    HttpApiEndpoint.post("login", "/auth/login")
      .setPayload(
        S.Struct({
          id: S.NonEmptyTrimmedString,
          password: S.NonEmptyTrimmedString,
        }),
      )
      .addSuccess(User.select)
      .addError(InvalidCredentials, { status: 401 })
      .addError(AccountLocked, { status: 423 }),
  )
  .add(HttpApiEndpoint.post("logout", "/auth/logout").addSuccess(S.Void))
  .add(
    HttpApiEndpoint.post(
      "requestDeletion",
      "/auth/request-deletion",
    ).addSuccess(S.Struct({ request_account_deletion: S.Boolean })),
  )
  .add(
    HttpApiEndpoint.post("confirmDeletion", "/auth/confirm-deletion")
      .setPayload(S.Struct({ token: S.NonEmptyTrimmedString }))
      .addSuccess(S.Struct({ confirm_account_deletion: S.Boolean })),
  )
  .add(
    HttpApiEndpoint.post("forgotPassword", "/auth/forgot-password")
      .setPayload(S.Struct({ email: EmailSchema }))
      .addSuccess(S.Void),
  )
  .add(
    HttpApiEndpoint.post("resetPassword", "/auth/reset-password")
      .setPayload(
        S.Struct({
          userId: S.UUID,
          token: S.NonEmptyTrimmedString,
          password: Password,
        }),
      )
      .addSuccess(S.Struct({ reset_password: S.Boolean })),
  )
  .add(
    HttpApiEndpoint.post("changePassword", "/auth/change-password")
      .setPayload(
        S.Struct({
          oldPassword: S.NonEmptyTrimmedString,
          newPassword: Password,
        }),
      )
      .addSuccess(S.Struct({ change_password: S.Boolean }))
      .addError(AuthenticationRequired, { status: 401 })
      .addError(InvalidCredentials, { status: 401 })
      .addError(WeakPassword, { status: 400 }),
  )
  .add(
    HttpApiEndpoint.patch("updateProfile", "/profile")
      .setPayload(User.select.pick("username", "name", "avatar_url", "bio"))
      .addSuccess(User.select),
  )
  .add(
    HttpApiEndpoint.post(
      "oauthLink",
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
      .addSuccess(User.select),
  )
  .add(
    HttpApiEndpoint.del("oauthUnlink")`/oauth/${uuidParam}`.addSuccess(
      S.Boolean,
    ),
  );

const EmailGroup = HttpApiGroup.make("email")
  .add(
    HttpApiEndpoint.post("addEmail", "/emails")
      .setPayload(S.Struct({ email: EmailSchema }))
      .addSuccess(UserEmail, { status: 201 })
      .addError(EmailAlreadyTaken, { status: 409 }),
  )
  .add(
    HttpApiEndpoint.patch("makeEmailPrimary")`/emails/${uuidParam}/primary`
      .addSuccess(UserEmail.select)
      .addError(EmailNotOwned, { status: 403 })
      .addError(EmailNotVerified, { status: 400 }),
  )
  .add(
    HttpApiEndpoint.del("removeEmail")`/emails/${uuidParam}`
      .addSuccess(S.Boolean)
      .addError(CannotDeleteLastEmail, { status: 400 }),
  )
  .add(
    HttpApiEndpoint.post(
      "resendVerification",
    )`/emails/${uuidParam}/resend`.addSuccess(S.Boolean),
  )
  .add(
    HttpApiEndpoint.post("verifyEmail")`/emails/${uuidParam}/verify`
      .setPayload(S.Struct({ token: S.NonEmptyTrimmedString }))
      .addSuccess(S.Boolean),
  );

export const Contract = HttpApi.make("Contract")
  .addError(InternalError, { status: 500 })
  .add(PostsGroup)
  .add(UsersGroup)
  .add(EmailGroup);
