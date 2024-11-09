import http from "node:http";
import { Config, Effect, Layer, Logger, LogLevel } from "effect";
import { HttpRouter, HttpServer } from "@effect/platform";
import { NodeHttpServer, NodeRuntime } from "@effect/platform-node"
import { DevTools } from "@effect/experimental"
import { toHttpApp } from "@effect/rpc-http/HttpRpcRouter";
import { PgClient } from "@effect/sql-pg";
import { appRouter } from "./router";
import { PgRootLive } from "./db";

const HttpLive = HttpRouter.empty.pipe(
  HttpRouter.post("/rpc", toHttpApp(appRouter, { spanPrefix: 'rpc' })),
  HttpServer.serve(),
  HttpServer.withLogAddress,
  Layer.provide(PgRootLive),
  Layer.provide(PgClient.layer({ url: Config.redacted("DATABASE_URL") })),
  Layer.provide(NodeHttpServer.layerConfig(http.createServer, { port: Config.number("PORT") })),
);

HttpLive.pipe(
  Layer.launch, 
  // FIXME: conditionally enable devtools
  // Effect.provide(DevTools.layerWebSocket().pipe(Layer.provide(NodeSocket.layerWebSocketConstructor))),
  Effect.provide(Logger.pretty),
  Logger.withMinimumLogLevel(LogLevel.All),
  NodeRuntime.runMain
);
