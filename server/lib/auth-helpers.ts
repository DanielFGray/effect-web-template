import { Effect, Option, Data } from "effect";
import { HttpServerRequest } from "@effect/platform";
import { SessionService, type AuthenticatedUser } from "../services/session.js";
import { provideCurrentUser, provideMaybeCurrentUser } from "./auth-context.js";
import type { PgAuthDB } from "#server/db.js";

/**
 * Authentication errors
 */
export class UnauthorizedError extends Data.TaggedError("UnauthorizedError")<{
  readonly message: string;
}> {}

export class ForbiddenError extends Data.TaggedError("ForbiddenError")<{
  readonly message: string;
}> {}

/**
 * Extract session ID from request cookies or Authorization header
 */
const extractSessionId = (
  request: HttpServerRequest.HttpServerRequest,
): Option.Option<string> => {
  // Try cookie first (for web browsers)
  const sessionCookie = request.cookies?.session;
  if (sessionCookie) {
    return Option.some(sessionCookie);
  }

  // Try Authorization header (for API clients)
  const authHeader = request.headers.authorization;
  if (authHeader && authHeader.startsWith("Bearer ")) {
    return Option.some(authHeader.slice(7)); // Remove "Bearer " prefix
  }

  return Option.none();
};

/**
 * Authenticate request and return user if valid session
 * Returns None if no session or invalid session
 */
export const authenticateRequest = (
  request: HttpServerRequest.HttpServerRequest,
): Effect.Effect<
  Option.Option<AuthenticatedUser>,
  never,
  PgAuthDB | SessionService
> =>
  Effect.gen(function* () {
    const sessionService = yield* SessionService;
    const sessionId = extractSessionId(request);

    if (Option.isNone(sessionId)) {
      return Option.none();
    }

    const userResult = yield* sessionService
      .validateSession(sessionId.value)
      .pipe(Effect.either);

    return userResult._tag === "Right"
      ? Option.some(userResult.right)
      : Option.none();
  });

/**
 * Require authentication - fails if not authenticated
 */
export const requireAuthentication = (
  request: HttpServerRequest.HttpServerRequest,
): Effect.Effect<
  AuthenticatedUser,
  UnauthorizedError,
  PgAuthDB | SessionService
> =>
  Effect.gen(function* () {
    const sessionService = yield* SessionService;
    const sessionId = extractSessionId(request);

    if (Option.isNone(sessionId)) {
      return yield* Effect.fail(
        new UnauthorizedError({ message: "Authentication required" }),
      );
    }

    return yield* sessionService
      .validateSession(sessionId.value)
      .pipe(
        Effect.mapError(
          () => new UnauthorizedError({ message: "Invalid session" }),
        ),
      );
  });

/**
 * Require admin role - fails if not admin
 */
export const requireAdmin = (
  user: AuthenticatedUser,
): Effect.Effect<AuthenticatedUser, ForbiddenError, never> =>
  user.role === "admin"
    ? Effect.succeed(user)
    : Effect.fail(new ForbiddenError({ message: "Admin access required" }));

/**
 * Require specific role - fails if not correct role
 */
export const requireRole = (
  user: AuthenticatedUser,
  requiredRole: "user" | "admin",
): Effect.Effect<AuthenticatedUser, ForbiddenError, never> =>
  user.role === "admin" || user.role === requiredRole
    ? Effect.succeed(user)
    : Effect.fail(
        new ForbiddenError({ message: `Role '${requiredRole}' required` }),
      );

/**
 * Require ownership or admin - fails if not owner/admin
 */
export const requireOwnership = (
  user: AuthenticatedUser,
  resourceUserId: string,
): Effect.Effect<AuthenticatedUser, ForbiddenError, never> =>
  user.role === "admin" || user.userId === resourceUserId
    ? Effect.succeed(user)
    : Effect.fail(
        new ForbiddenError({
          message: "Access denied - resource ownership required",
        }),
      );

/**
 * Helper to run an effect with optional authentication context
 */
export const withOptionalAuth = <A, E, R>(
  request: HttpServerRequest.HttpServerRequest,
  effect: Effect.Effect<A, E, R>,
): Effect.Effect<A, E, R | PgAuthDB | SessionService> =>
  Effect.gen(function* () {
    const maybeUser = yield* authenticateRequest(request);
    return yield* provideMaybeCurrentUser(maybeUser, effect);
  });

/**
 * Helper to run an effect with required authentication context
 */
export const withRequiredAuth = <A, E, R>(
  request: HttpServerRequest.HttpServerRequest,
  effect: Effect.Effect<A, E, R>,
): Effect.Effect<A, E | UnauthorizedError, R | PgAuthDB | SessionService> =>
  Effect.gen(function* () {
    const user = yield* requireAuthentication(request);
    return yield* provideCurrentUser(user, effect);
  });

/**
 * Helper to run an effect with admin authentication context
 */
export const withAdminAuth = <A, E, R>(
  request: HttpServerRequest.HttpServerRequest,
  effect: Effect.Effect<A, E, R>,
): Effect.Effect<
  A,
  E | UnauthorizedError | ForbiddenError,
  R | PgAuthDB | SessionService
> =>
  Effect.gen(function* () {
    const user = yield* requireAuthentication(request);
    yield* requireAdmin(user);
    return yield* provideCurrentUser(user, effect);
  });
