// client.ts
import { FetchHttpClient } from "@effect/platform";
import { RpcClient, RpcSerialization } from "@effect/rpc";
import { Console, Effect, Layer, Logger, LogLevel, Stream } from "effect";
import { PostRpcs } from "../server/rpc/posts.js";
import { assert } from "effect/Console";

// Choose which protocol to use
const ProtocolLive = RpcClient.layerProtocolHttp({
  url: "http://localhost:3000/rpc",
}).pipe(Layer.provide([FetchHttpClient.layer, RpcSerialization.layerNdjson]));

// Use the client
const program = Effect.gen(function* () {
  const client = yield* RpcClient.make(PostRpcs);
  const sort = "created_at";
  const posts = yield* client.PostList({ sort });
  yield* Console.log("Creating post");
  const newPost = yield* client.PostCreate({
    body: "hello world",
    privacy: "public",
  });
  const newList = yield* client.PostList({ sort });
  yield* assert(
    newList.find((post) => newPost?.id === post.id) !== undefined,
    "New post should be in the new list",
  );
  yield* Console.log("New post created:", newPost);
});

program.pipe(
  Effect.scoped,
  Effect.provide([ProtocolLive, Logger.minimumLogLevel(LogLevel.All)]),
  Effect.runPromise,
);
