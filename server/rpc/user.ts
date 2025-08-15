import { Rpc, RpcGroup } from "@effect/rpc";
import { Effect, Schema as S } from "effect";
import { User, UsersRepo } from "../services/users.js";
import { PgRootDB } from "../db.js";

export class UserRpcs extends RpcGroup.make(
  Rpc.make("AccountConfirmDeletion", {
    success: S.Struct({
      confirm_account_deletion: S.Boolean,
    }),
    payload: S.Struct({
      token: S.NonEmptyTrimmedString,
    }),
  }),
  Rpc.make("AccountLogin", {
    success: User.select,
    payload: S.Struct({
      id: S.NonEmptyTrimmedString,
      password: S.NonEmptyTrimmedString,
    }),
  }),
  Rpc.make("AccountRegister", {
    payload: S.Struct({
      username: S.NonEmptyTrimmedString,
      password: S.NonEmptyTrimmedString,
      email: S.NullOr(S.NonEmptyTrimmedString),
    }),
    success: User.select,
  }),
  Rpc.make("AccountRequestDeletion", {
    success: S.Struct({ request_account_deletion: S.Void }),
    payload: S.Void,
  }),
  Rpc.make("EmailAdd", {
    success: S.Struct({
      email: S.NonEmptyTrimmedString,
      is_primary: S.Boolean,
    }),
    payload: S.Struct({ email: S.NonEmptyTrimmedString }),
  }),
  Rpc.make("EmailMakePrimary", {
    success: S.Struct({ emailId: S.NonEmptyTrimmedString }),
    payload: S.Struct({ emailId: S.NonEmptyTrimmedString }),
  }),
  Rpc.make("EmailRemove", {
    success: S.Struct({ emailId: S.NonEmptyTrimmedString }),
    payload: S.Struct({ emailId: S.NonEmptyTrimmedString }),
  }),
  Rpc.make("EmailResendVerification", {
    success: S.Struct({ emailId: S.NonEmptyTrimmedString }),
    payload: S.Struct({ emailId: S.NonEmptyTrimmedString }),
  }),
  Rpc.make("EmailVerify", {
    success: S.Struct({
      email: S.NonEmptyTrimmedString,
      is_verified: S.Boolean,
    }),
    payload: S.Struct({
      emailId: S.NonEmptyTrimmedString,
      token: S.NonEmptyTrimmedString,
    }),
  }),
  Rpc.make("OauthLink", {}),
  Rpc.make("OauthUnlink", {
    payload: S.Struct({ id: S.NonEmptyTrimmedString }),
    success: S.Void,
  }),
  Rpc.make("PasswordChange", {
    payload: S.Struct({
      oldPassword: S.NonEmptyTrimmedString,
      newPassword: S.NonEmptyTrimmedString,
    }),
    success: S.Struct({
      change_password: S.Boolean,
    }),
  }),
  Rpc.make("PasswordForgot", {
    payload: S.Struct({ email: S.NonEmptyTrimmedString }),
    success: S.Struct({
      forgot_password: S.Boolean,
    }),
  }),
  Rpc.make("PasswordReset", {
    payload: S.Struct({
      userId: S.NonEmptyTrimmedString,
      token: S.NonEmptyTrimmedString,
      password: S.NonEmptyTrimmedString,
    }),
    success: S.Struct({
      reset_password: S.Boolean,
    }),
  }),
  Rpc.make("ProfileUpdate", {
    payload: User.update.pick("username", "name", "avatar_url", "bio"),
    success: User.select,
  }),
) {}

export const Users = Effect.gen(function* () {
  const repo = yield* UsersRepo;
  return {
    AccountConfirmDeletion: repo.confirmAccountDeletion,
    AccountLogin: repo.login,
    AccountRegister: repo.register,
    AccountRequestDeletion: repo.requestAccountDeletion,
    EmailAdd: repo.addEmail,
    EmailMakePrimary: repo.makeEmailPrimary,
    EmailRemove: repo.removeEmail,
    EmailResendVerification: repo.resendVerificationEmail,
    EmailVerify: repo.verifyEmail,
    OauthLink: repo.oauthLink,
    OauthUnlink: repo.oauthUnlink,
    PasswordChange: repo.changePassword,
    PasswordForgot: repo.forgotPassword,
    PasswordReset: repo.resetPassword,
    ProfileUpdate: repo.updateProfile,
  };
}).pipe(
  Effect.provide([PgRootDB.Live, UsersRepo.Default]),
  Effect.orDie,
  // comment to preserve newlines (i hate prettier sometimes)
);

export const UsersLive = UserRpcs.toLayer(Users);
