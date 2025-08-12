// client.ts
import { FetchHttpClient } from "@effect/platform";
import { RpcClient, RpcSerialization } from "@effect/rpc";
import { Effect, Layer, Stream } from "effect";
import { PostRpcs } from "../server/rpc/posts.js";

// Choose which protocol to use
const ProtocolLive = RpcClient.layerProtocolHttp({ url: "/rpc" }).pipe(
  Layer.provide([FetchHttpClient.layer, RpcSerialization.layerNdjson]),
);

// Use the client
const program = Effect.gen(function* () {
  const client = yield* RpcClient.make(PostRpcs);
  let posts = yield* Stream.runCollect(client.PostList({}));
  console.log("Creating post");
  yield* client.PostCreate({ body: "hello world", privacy: "public" });
  posts = yield* Stream.runCollect(client.PostList({}));
  return posts;
}).pipe(Effect.scoped);

program.pipe(Effect.provide(ProtocolLive), Effect.runPromise).then(console.log);

