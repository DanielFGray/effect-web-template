import { Context, Effect, Option } from "effect";
import type { AuthenticatedUser } from "../services/session.js";

/**
 * Current authenticated user context
 * Available throughout the request lifecycle for authenticated requests
 */
export class CurrentUser extends Context.Tag("CurrentUser")<
  CurrentUser,
  AuthenticatedUser
>() {}

/**
 * Optional current user context
 * Available for requests that may or may not be authenticated
 */
export class MaybeCurrentUser extends Context.Tag("MaybeCurrentUser")<
  MaybeCurrentUser,
  Option.Option<AuthenticatedUser>
>() {}

/**
 * Get the current authenticated user
 * Fails if no user is authenticated
 */
export const getCurrentUser = (): Effect.Effect<
  AuthenticatedUser,
  never,
  CurrentUser
> => CurrentUser;

/**
 * Get the current user if authenticated, otherwise None
 * Never fails - returns Option
 */
export const getMaybeCurrentUser = (): Effect.Effect<
  Option.Option<AuthenticatedUser>,
  never,
  MaybeCurrentUser
> => MaybeCurrentUser;

/**
 * Check if current user has admin role
 */
export const isAdmin = (): Effect.Effect<boolean, never, CurrentUser> =>
  Effect.map(getCurrentUser(), (user) => user.role === "admin");

/**
 * Check if current user has specific role
 */
export const hasRole = (
  role: "user" | "admin",
): Effect.Effect<boolean, never, CurrentUser> =>
  Effect.map(getCurrentUser(), (user) => user.role === role);

/**
 * Get current user ID
 */
export const getCurrentUserId = (): Effect.Effect<string, never, CurrentUser> =>
  Effect.map(getCurrentUser(), (user) => user.userId);

/**
 * Get current session ID
 */
export const getCurrentSessionId = (): Effect.Effect<
  string,
  never,
  CurrentUser
> => Effect.map(getCurrentUser(), (user) => user.sessionId);

/**
 * Check if current user owns a resource by user ID
 */
export const isOwner = (
  resourceUserId: string,
): Effect.Effect<boolean, never, CurrentUser> =>
  Effect.map(getCurrentUser(), (user) => user.userId === resourceUserId);

/**
 * Check if current user is admin OR owns a resource
 */
export const isAdminOrOwner = (
  resourceUserId: string,
): Effect.Effect<boolean, never, CurrentUser> =>
  Effect.map(
    getCurrentUser(),
    (user) => user.role === "admin" || user.userId === resourceUserId,
  );

/**
 * Provide CurrentUser context from authenticated user
 */
export const provideCurrentUser = <A, E, R>(
  user: AuthenticatedUser,
  effect: Effect.Effect<A, E, R>,
): Effect.Effect<A, E, Exclude<R, CurrentUser>> =>
  Effect.provideService(effect, CurrentUser, user);

/**
 * Provide MaybeCurrentUser context
 */
export const provideMaybeCurrentUser = <A, E, R>(
  user: Option.Option<AuthenticatedUser>,
  effect: Effect.Effect<A, E, R>,
): Effect.Effect<A, E, Exclude<R, MaybeCurrentUser>> =>
  Effect.provideService(effect, MaybeCurrentUser, user);
