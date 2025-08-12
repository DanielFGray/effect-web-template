import { Effect, Layer } from "effect";
import { Rpc, RpcGroup } from "@effect/rpc";
import { Schema as S } from "effect";
import { Post, PostsRepo, PostWithDetails } from "../services/posts.js";
import { PgRootDB } from "../db.js";

export class PostRpcs extends RpcGroup.make(
  Rpc.make("PostCreate", {
    success: Post.select.pick("id"),
    payload: Post.insert,
  }),

  Rpc.make("PostById", {
    success: PostWithDetails,
    payload: Post.select.pick("id"),
  }),

  Rpc.make("PostList", {
    success: S.Array(PostWithDetails),
    payload: S.partial(
      S.Struct({
        username: S.NonEmptyTrimmedString,
        sort: S.Union(
          S.Literal("created_at"),
          S.Literal("updated_at"),
          S.Literal("stars"),
        ),
        // TODO: pagination
      }),
    ),
  }),
) {}

export const PostService = Effect.gen(function* () {
  // TODO: retrieve session info
  const repo = yield* PostsRepo;

  return {
    PostList: (opts: {
      username?: string;
      sort?: "stars" | "created_at" | "updated_at";
    }) => repo.listBy(opts).pipe(Effect.fromNullable),

    PostById: ({ id }: { id: string }) =>
      repo
        .findById({ id })
        .pipe(Effect.orDie, Effect.fromNullable, Effect.andThen(Effect.head)),

    PostCreate: (values: {
      body: string;
      privacy?: typeof Post.fields.privacy.Type;
    }) =>
      repo
        .insert(values)
        .pipe(Effect.orDie, Effect.fromNullable, Effect.andThen(Effect.head)),
  };
}).pipe(Effect.provide([PgRootDB.Live, PostsRepo.Default]));

export const PostsLive = PostRpcs.toLayer(PostService);
