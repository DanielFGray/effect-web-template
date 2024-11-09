import {
  FetchHttpClient,
  HttpClient,
  HttpClientRequest,
} from "@effect/platform";
import { RpcResolver } from "@effect/rpc";
import { HttpRpcResolverNoStream } from "@effect/rpc-http";
import { Effect, flow } from "effect";
import type { AppRouter } from "~server/router";

export class RpcClient extends Effect.Service<AppRouter>()("RpcClient", {
  effect: Effect.gen(function* () {
    const baseClient = yield* HttpClient.HttpClient;
    const client = baseClient.pipe(
      HttpClient.mapRequest(
        flow(
          HttpClientRequest.prependUrl("/rpc"),
          HttpClientRequest.setMethod("POST")
        )
      )
    );

    return HttpRpcResolverNoStream.make<AppRouter>(client).pipe(
      RpcResolver.toClient
    );
  }),
  dependencies: [FetchHttpClient.layer],
}) {}