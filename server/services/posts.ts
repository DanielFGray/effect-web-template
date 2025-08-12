import { Model } from "@effect/sql";
import { Effect, Schema as S } from "effect";
import { PgRootDB, sql } from "../db.js";

export class Post extends Model.Class<Post>("Post")({
  id: Model.Generated(S.String),
  user_id: Model.Generated(S.UUID),
  body: S.NonEmptyTrimmedString,
  privacy: S.Union(
    S.Literal("public"),
    S.Literal("secret"),
    S.Literal("private"),
  ),
  created_at: Model.Generated(S.Date),
  updated_at: Model.Generated(S.Date),
}) {}

export const PostWithDetails = S.Struct({
  ...Post.select.fields,
  stars: S.Union(S.BigInt, S.Number, S.String),
  user: S.Struct({
    avatar_url: S.NullOr(S.String),
    username: S.String,
  }),
}).pipe(S.omit("user_id"));

export class PostsRepo extends Effect.Service<PostsRepo>()("Posts/PostRepo", {
  effect: Effect.gen(function* () {
    const db = yield* PgRootDB;

    const baseQuery = db
      .selectFrom("app_public.posts as p")
      .leftJoin("app_public.users as u", "p.user_id", "u.id")
      .crossJoinLateral((eb) =>
        eb
          .selectFrom("app_public.stars_on_posts as s")
          .select((eb) => [eb.fn.countAll().as("stars")])
          .where("s.post_id", "=", eb.ref("p.id"))
          .as("get_stars"),
      )
      .select((eb) => [
        "p.id",
        "p.body",
        "p.privacy",
        "p.created_at",
        "p.updated_at",
        "get_stars.stars",
        eb
          .fn<{
            avatar_url: string;
            username: string;
          }>("json_build_object", [
            sql.lit("avatar_url"),
            eb.ref("u.avatar_url"),
            sql.lit("username"),
            eb.ref("u.username"),
          ])
          .as("user"),
      ]);

    return {
      insert: (values: {
        body: string;
        privacy?: typeof Post.fields.privacy.Type;
      }) => db.insertInto("app_public.posts").values(values).returning(["id"]),

      findById: ({ id }: { id: string }) => baseQuery.where("p.id", "=", id),

      listBy: (opts: {
        username?: string;
        sort?: "stars" | "created_at" | "updated_at";
      }) =>
        Effect.gen(function* () {
          let query = baseQuery
            .orderBy(sql.lit(opts.sort ?? "created_at"), "desc")
            .limit((eb) => eb.lit(50));
          if (opts.username)
            query = query.where("u.username", "=", opts.username);
          return yield* query;
        }),
    };
  }),
}) {
  // static Test = makeTestLayer(PostRepo)({})
}
