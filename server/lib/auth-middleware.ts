import { Effect } from "effect";
import { SessionService } from "../services/session.js";

/**
 * Helper function to create a session and return both user data and session info
 * This can be used by handlers to create sessions after successful auth operations
 */
export const createUserSession = <T extends { id: string }>(user: T) =>
  Effect.gen(function* () {
    const sessionService = yield* SessionService;
    const session = yield* sessionService.createSession(user.id);

    return {
      user,
      sessionId: session.uuid,
    };
  });
