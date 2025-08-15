import { Effect, Ref, Option, Config } from "effect";
import { suite, expect, it } from "@effect/vitest";
import {
  HttpClient,
  Cookies,
  HttpClientResponse,
  HttpClientRequest,
} from "@effect/platform";
import { FetchHttpClient } from "@effect/platform";
import { User } from "./services/users.js";

// Test layer that provides HTTP client for testing against running server
const TestHttpClientLive = FetchHttpClient.layer;

const baseUrl = Config.string("VITE_ROOT_URL");

suite("user registration HTTP flow", () => {
  it.live("POST /auth/register returns user and sets session cookie", () =>
    Effect.gen(function* () {
      const client = yield* HttpClient.HttpClient;
      const cookiesRef = yield* Ref.make(Cookies.empty);
      const clientWithCookies = client.pipe(
        HttpClient.withCookiesRef(cookiesRef),
      );

      // Make the registration request
      const response = yield* HttpClientRequest.post(
        `${baseUrl}/auth/register`,
      ).pipe(
        HttpClientRequest.bodyJson({
          username: "testuser",
          password: "password123",
          email: "test@example.com",
        }),
        Effect.flatMap(clientWithCookies.execute),
      );

      // Check response status
      expect(response.status).toBe(201);

      // Check that user data was returned
      const user = yield* HttpClientResponse.schemaBodyJson(User.select)(
        response,
      );
      expect(user).toBeTypeOf("object");
      expect(user).toHaveProperty("id");
      expect(user).toHaveProperty("username", "testuser");
      expect(user).toHaveProperty("role", "user");
      expect(user).toHaveProperty("is_verified", false);
      expect(user.created_at).toBeInstanceOf(Date);

      // Check that session cookie was set
      const cookies = yield* Ref.get(cookiesRef);
      const sessionCookie = Cookies.get(cookies, "session");
      expect(Option.isSome(sessionCookie)).toBe(true);

      if (Option.isSome(sessionCookie)) {
        expect(sessionCookie.value.value).toMatch(/^[0-9a-f-]{36}$/); // UUID format
      }
    }).pipe(Effect.provide(TestHttpClientLive)),
  );

  it.live("can use session cookie for authenticated requests", () =>
    Effect.gen(function* () {
      const client = yield* HttpClient.HttpClient;
      const cookiesRef = yield* Ref.make(Cookies.empty);
      const clientWithCookies = client.pipe(
        HttpClient.withCookiesRef(cookiesRef),
      );

      // First, register a user to get session cookie
      const registerResponse = yield* HttpClientRequest.post(
        `${baseUrl}/auth/register`,
      ).pipe(
        HttpClientRequest.bodyJson({
          username: "authuser",
          password: "password123",
          email: "auth@example.com",
        }),
        Effect.flatMap(clientWithCookies.execute),
      );

      expect(registerResponse.status).toBe(201);
      const user = yield* HttpClientResponse.schemaBodyJson(User.select)(
        registerResponse,
      );

      // Verify session cookie was set
      const cookies = yield* Ref.get(cookiesRef);
      const sessionCookie = Cookies.get(cookies, "session");
      expect(Option.isSome(sessionCookie)).toBe(true);

      // Now make an authenticated request (profile update)
      const updateResponse = yield* HttpClientRequest.patch(
        `${baseUrl}/profile`,
      ).pipe(
        HttpClientRequest.bodyJson({
          username: "authuser_updated",
          name: "Test User",
          bio: "This is a test user",
        }),
        Effect.flatMap(clientWithCookies.execute),
      );

      // The client with cookies should automatically include the session cookie
      expect(updateResponse.status).toBe(200);

      const updatedUser = yield* HttpClientResponse.schemaBodyJson(User.select)(
        updateResponse,
      );
      expect(updatedUser.id).toBe(user.id);
      expect(updatedUser.username).toBe("authuser_updated");
      expect(updatedUser.name).toBe("Test User");
      expect(updatedUser.bio).toBe("This is a test user");
    }).pipe(Effect.provide(TestHttpClientLive)),
  );

  it.live("authenticated request fails without session cookie", () =>
    Effect.gen(function* () {
      const client = yield* HttpClient.HttpClient;

      // Try to make authenticated request without session cookie
      const result = yield* HttpClientRequest.patch(`${baseUrl}/profile`).pipe(
        HttpClientRequest.bodyJson({
          username: "unauthorized_user",
          name: "Should Fail",
        }),
        Effect.flatMap(client.execute),
        Effect.either,
      );

      // Should fail with 401 Unauthorized or other error
      expect(result._tag).toBe("Left");
    }).pipe(Effect.provide(TestHttpClientLive)),
  );

  it.live("can logout and invalidate session cookie", () =>
    Effect.gen(function* () {
      const client = yield* HttpClient.HttpClient;
      const cookiesRef = yield* Ref.make(Cookies.empty);
      const clientWithCookies = client.pipe(
        HttpClient.withCookiesRef(cookiesRef),
      );

      // Register user and get session
      yield* HttpClientRequest.post(`${baseUrl}/auth/register`).pipe(
        HttpClientRequest.bodyJson({
          username: "logoutuser",
          password: "password123",
          email: "logout@example.com",
        }),
        Effect.flatMap(clientWithCookies.execute),
      );

      // Verify we have a session cookie
      const cookiesBeforeLogout = yield* Ref.get(cookiesRef);
      const sessionCookieBefore = Cookies.get(cookiesBeforeLogout, "session");
      expect(Option.isSome(sessionCookieBefore)).toBe(true);

      // Logout
      const logoutResponse = yield* clientWithCookies.post(
        `${baseUrl}/auth/logout`,
      );
      expect(logoutResponse.status).toBe(200);

      // Try to use the session cookie for an authenticated request after logout
      const result = yield* HttpClientRequest.patch(`${baseUrl}/profile`).pipe(
        HttpClientRequest.bodyJson({
          username: "should_fail",
        }),
        Effect.flatMap(clientWithCookies.execute),
        Effect.either,
      );

      // Should fail because session was invalidated
      expect(result._tag).toBe("Left");
    }).pipe(Effect.provide(TestHttpClientLive)),
  );

  it.live("registration with duplicate username fails", () =>
    Effect.gen(function* () {
      const client = yield* HttpClient.HttpClient;

      const userData = {
        username: "duplicateuser",
        password: "password123",
        email: "duplicate@example.com",
      };

      // First registration should succeed
      const firstResponse = yield* HttpClientRequest.post(
        `${baseUrl}/auth/register`,
      ).pipe(
        HttpClientRequest.bodyJson(userData),
        Effect.flatMap(client.execute),
      );
      expect(firstResponse.status).toBe(201);

      // Second registration with same username should fail
      const result = yield* HttpClientRequest.post(
        `${baseUrl}/auth/register`,
      ).pipe(
        HttpClientRequest.bodyJson({
          ...userData,
          email: "different@example.com", // Different email, same username
        }),
        Effect.flatMap(client.execute),
        Effect.either,
      );

      // Should fail with conflict or bad request
      expect(result._tag).toBe("Left");
    }).pipe(Effect.provide(TestHttpClientLive)),
  );

  it.live("registration with weak password fails", () =>
    Effect.gen(function* () {
      const client = yield* HttpClient.HttpClient;

      const result = yield* HttpClientRequest.post(
        `${baseUrl}/auth/register`,
      ).pipe(
        HttpClientRequest.bodyJson({
          username: "weakpassuser",
          password: "123", // Too short
          email: "weak@example.com",
        }),
        Effect.flatMap(client.execute),
        Effect.either,
      );

      // Should fail with validation error
      expect(result._tag).toBe("Left");
    }).pipe(Effect.provide(TestHttpClientLive)),
  );
});
