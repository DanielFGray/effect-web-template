import { FetchHttpClient, HttpApiClient } from "@effect/platform";
import { Effect } from "effect";
import { Contract } from "./httpApi.js";

export const api = Effect.runSync(
  HttpApiClient.make(Contract).pipe(Effect.provide(FetchHttpClient.layer)),
);
