import { Effect } from "effect";
import { PgRootDB } from "./server/db.js";
import { BunRuntime } from "@effect/platform-bun";

const testQuery = Effect.gen(function* () {
  const db = yield* PgRootDB;

  // Simple test query using the Kysely integration
  const result = yield* db.selectFrom("app_public.posts").selectAll().limit(5);

  console.log("Query result:", result);
  return result;
});

testQuery.pipe(Effect.provide(PgRootDB.Live), BunRuntime.runMain);
