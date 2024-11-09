import { Effect } from "effect";
import * as requests from "~server/request";
import { RpcClient } from "./RpcClient";

const main = Effect.gen(function* () {
  const rpcClient = yield* RpcClient;

  const response = rpcClient(new requests.PostList()).pipe(
    Effect.tap((err) => Effect.log(err)),
    Effect.tapError((err) => Effect.log(err))
  );
  return response;
});

main.pipe(Effect.provide(RpcClient.Default), Effect.runFork);
