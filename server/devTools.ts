import { Config, Effect, Layer } from "effect";
import { DevTools } from "@effect/experimental";
import { NodeSocket } from "@effect/platform-node";

export const DevToolsLive = Layer.unwrapEffect(
  Effect.gen(function* () {
    const nodeEnv = yield* Config.string("NODE_ENV");
    if (nodeEnv === "production") return Layer.empty;

    return DevTools.layerSocket.pipe(
      Layer.provide(NodeSocket.layerNet({ port: 34437 })),
    );
  }),
);
