import { Console, Effect } from "effect";
import { Rpc, RpcRouter } from "@effect/rpc";
import { PostById, PostList, CreatePost } from "./request";
import { PgRootDB } from "./db";

export const appRouter = RpcRouter.make(
  Rpc.effect(CreatePost, ({ body, privacy }) =>
    Effect.gen(function*() {
      const db = yield* PgRootDB;
      yield* Effect.logTrace("creating new post");
      const query = db
        .insertInto("app_public.posts")
        .values({ body, privacy })
        .returningAll()
      Effect.logTrace(query.compile().sql)
      return yield* query
        .pipe(
          // TODO: add error tracing and stricter output
          Effect.tap(Effect.logDebug),
          Effect.mapError((e) => e.toString()),
          Effect.map((r) => (r[0] || null)),
          Effect.tap(Effect.logDebug),
        );
    }),
  ),

  Rpc.effect(PostById, ({ id }) =>
    Effect.gen(function*() {
      const db = yield* PgRootDB;
      yield* Effect.logTrace("fetching post %d", id);
      return yield* db
        .selectFrom("app_public.posts")
        .selectAll()
        .where("id", "=", id)
        .pipe(
          Effect.mapError((e) => e.toString()),
          Effect.map((r) => r[0]),
        );
    }),
  ),

  Rpc.effect(PostList, () =>
    Effect.gen(function*() {
      const db = yield* PgRootDB;
      yield* Effect.logDebug("fetching all posts");
      return yield* db
        .selectFrom("app_public.posts")
        .selectAll()
        .pipe(Effect.mapError((e) => e.toString()));
    }),
  ),
);

export type AppRouter = typeof appRouter;
