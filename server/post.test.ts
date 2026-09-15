import { Effect, Ref, Config, Schema as S } from "effect";
import { suite, expect, it } from "@effect/vitest";
import {
  HttpClient,
  Cookies,
  HttpClientResponse,
  HttpClientRequest,
  FetchHttpClient,
} from "@effect/platform";
import { Post, PostWithDetails } from "./services/posts.js";

const TestHttpClientLive = FetchHttpClient.layer;

const baseUrl = Config.string("VITE_ROOT_URL");

const CreatePostResponse = Post.select.pick("id");

// Unique per test run so re-running against a live, unreset database never
// collides with usernames left behind by a previous run.
const runId = Math.random().toString(36).slice(2, 8);

suite("posts HTTP flow", () => {
  it.live("POST /posts creates a post for authenticated user", () =>
    Effect.gen(function* () {
      const client = yield* HttpClient.HttpClient;
      const cookiesRef = yield* Ref.make(Cookies.empty);
      const clientWithCookies = client.pipe(
        HttpClient.withCookiesRef(cookiesRef),
      );

      const registerResponse = yield* HttpClientRequest.post(
        `${yield* baseUrl}/auth/register`,
      ).pipe(
        HttpClientRequest.bodyJson({
          username: `postflow_create_${runId}`,
          password: "password123",
          email: "postflow_create@example.com",
        }),
        Effect.flatMap(clientWithCookies.execute),
      );
      expect(registerResponse.status).toBe(201);

      const createResponse = yield* HttpClientRequest.post(
        `${yield* baseUrl}/posts`,
      ).pipe(
        HttpClientRequest.bodyJson({
          body: "hello from postflow_create",
          privacy: "public",
        }),
        Effect.flatMap(clientWithCookies.execute),
      );

      expect(createResponse.status).toBe(201);
      const created = yield* HttpClientResponse.schemaBodyJson(
        CreatePostResponse,
      )(createResponse);
      expect(created).toBeTypeOf("object");
      expect(created).toHaveProperty("id");
      expect(typeof created.id).toBe("bigint");
    }).pipe(Effect.provide(TestHttpClientLive)),
  );

  it.live("GET /posts/:id returns the created post", () =>
    Effect.gen(function* () {
      const client = yield* HttpClient.HttpClient;
      const cookiesRef = yield* Ref.make(Cookies.empty);
      const clientWithCookies = client.pipe(
        HttpClient.withCookiesRef(cookiesRef),
      );

      yield* HttpClientRequest.post(`${yield* baseUrl}/auth/register`).pipe(
        HttpClientRequest.bodyJson({
          username: `postflow_get_${runId}`,
          password: "password123",
          email: "postflow_get@example.com",
        }),
        Effect.flatMap(clientWithCookies.execute),
      );

      const body = "hello from postflow_get";
      const privacy = "secret" as const;

      const createResponse = yield* HttpClientRequest.post(
        `${yield* baseUrl}/posts`,
      ).pipe(
        HttpClientRequest.bodyJson({ body, privacy }),
        Effect.flatMap(clientWithCookies.execute),
      );
      expect(createResponse.status).toBe(201);
      const created = yield* HttpClientResponse.schemaBodyJson(
        CreatePostResponse,
      )(createResponse);
      expect(created).toHaveProperty("id");
      const postId = created.id;

      const getResponse = yield* clientWithCookies.get(
        `${yield* baseUrl}/posts/${postId}`,
      );
      expect(getResponse.status).toBe(200);

      const post = yield* HttpClientResponse.schemaBodyJson(
        S.NullOr(PostWithDetails),
      )(getResponse);
      expect(post).toBeTypeOf("object");
      expect(post).toHaveProperty("id", postId);
      expect(post).toHaveProperty("body", body);
      expect(post).toHaveProperty("privacy", privacy);
    }).pipe(Effect.provide(TestHttpClientLive)),
  );

  it.live("GET /posts list includes the created post", () =>
    Effect.gen(function* () {
      const client = yield* HttpClient.HttpClient;
      const cookiesRef = yield* Ref.make(Cookies.empty);
      const clientWithCookies = client.pipe(
        HttpClient.withCookiesRef(cookiesRef),
      );

      yield* HttpClientRequest.post(`${yield* baseUrl}/auth/register`).pipe(
        HttpClientRequest.bodyJson({
          username: `postflow_list_${runId}`,
          password: "password123",
          email: "postflow_list@example.com",
        }),
        Effect.flatMap(clientWithCookies.execute),
      );

      const body = "hello from postflow_list";

      const createResponse = yield* HttpClientRequest.post(
        `${yield* baseUrl}/posts`,
      ).pipe(
        HttpClientRequest.bodyJson({
          body,
          privacy: "public",
        }),
        Effect.flatMap(clientWithCookies.execute),
      );
      expect(createResponse.status).toBe(201);
      const created = yield* HttpClientResponse.schemaBodyJson(
        CreatePostResponse,
      )(createResponse);
      expect(created).toHaveProperty("id");
      const postId = created.id;

      const listResponse = yield* clientWithCookies.get(
        `${yield* baseUrl}/posts`,
      );
      expect(listResponse.status).toBe(200);

      const posts = yield* HttpClientResponse.schemaBodyJson(
        S.Array(PostWithDetails),
      )(listResponse);
      expect(Array.isArray(posts)).toBe(true);
      const match = posts.find((p) => p.id === postId);
      expect(match).toBeDefined();
      expect(match).toHaveProperty("body", body);
      expect(match).toHaveProperty("privacy", "public");
    }).pipe(Effect.provide(TestHttpClientLive)),
  );

  it.live("POST /posts fails without session cookie", () =>
    Effect.gen(function* () {
      const client = yield* HttpClient.HttpClient;

      const result = yield* HttpClientRequest.post(
        `${yield* baseUrl}/posts`,
      ).pipe(
        HttpClientRequest.bodyJson({
          body: "should not be created",
          privacy: "public",
        }),
        Effect.flatMap(client.pipe(HttpClient.filterStatusOk).execute),
        Effect.either,
      );

      expect(result._tag).toBe("Left");
    }).pipe(Effect.provide(TestHttpClientLive)),
  );
});
