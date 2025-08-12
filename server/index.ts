import { Layer, Logger, LogLevel } from "effect";
import { HttpRouter, HttpServer } from "@effect/platform";
import { BunHttpServer, BunRuntime } from "@effect/platform-bun";
import { RpcSerialization, RpcServer } from "@effect/rpc";
import { PgAuthDB, PgRootDB } from "./db.js";
import { PostRpcs, PostsLive } from "./rpc/posts.js";

const Main = HttpRouter.Default.serve().pipe(
  Layer.provide(RpcServer.layer(PostRpcs)),
  Layer.provide(PostsLive),
  Layer.provide(
    RpcServer.layerProtocolHttp({
      path: "/rpc",
    }).pipe(Layer.provide(RpcSerialization.layerNdjson)),
  ),
  HttpServer.withLogAddress,
  Layer.provide([
    PgAuthDB.Live,
    PgRootDB.Live,
    Logger.minimumLogLevel(LogLevel.All),
  ]),
);

Main.pipe(
  Layer.provide([
    BunHttpServer.layerServer({
      port: 3000,
    }),
    // BunBundle.bundleClient({
    //   entrypoints: [IndexHtml],
    //   publicPath: `${BundlePath}/`,
    // }).devLayer,
    // TanstackRouter.layer(),
  ]),
  Layer.launch,
  BunRuntime.runMain,
);
