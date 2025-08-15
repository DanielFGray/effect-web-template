// client/index.ts
import { FetchHttpClient, HttpApiClient } from "@effect/platform";
import { Console, Effect, Layer, Logger, LogLevel } from "effect";
import { PostsApi } from "../server/api/posts.js";
import { assert } from "effect/Console";

// Create HttpApi client layer
const ClientLive = HttpApiClient.make(PostsApi, {
  baseUrl: "http://localhost:8080", // Changed from 3000 to match your server port
}).pipe(Effect.provide(FetchHttpClient.layer));

// Use the client
const program = Effect.gen(function* () {
  const client = yield* ClientLive;

  yield* Console.log("Creating post");

  const newPost = yield* client.posts.create({
    payload: {
      body: "hello world",
      privacy: "public",
    },
  });

  const newList = yield* client.posts.list({
    urlParams: { sort: "created_at" },
  });
  const foundPost = newList.find((post) => newPost?.id === post.id);
  yield* assert(foundPost !== undefined, "New post should be in the new list");
  yield* Console.log("New post created:", foundPost);
});

program.pipe(
  Effect.orDie,
  Effect.scoped,
  Effect.provide(Logger.minimumLogLevel(LogLevel.All)),
  Effect.runPromise,
);
