import { Effect } from "effect";
import { jsonBuildObject } from "kysely/helpers/postgres";
import { catchSql, KyselyDB, type EffectKysely } from "../db.js";
import { InternalError } from "../../shared/errors.js";
import { Post } from "../../shared/schemas.js";

export { Post, PostWithDetails } from "../../shared/schemas.js";

export class Posts extends Effect.Service<Posts>()("Posts/PostRepo", {
  accessors: true,
  sync: () => {
    const makeBaseQuery = (db: EffectKysely) =>
      db
        .selectFrom("app_public.posts as p")
        .leftJoin("app_public.users as u", "p.user_id", "u.id")
        .crossJoinLateral((eb) =>
          eb
            .selectFrom("app_public.stars_on_posts as s")
            .select(() => [eb.fn.countAll().as("stars")])
            .where("s.post_id", "=", eb.ref("p.id"))
            .as("get_stars"),
        )
        .select((eb) => [
          "p.id",
          "p.body",
          "p.privacy",
          "p.created_at",
          "p.updated_at",
          jsonBuildObject({
            username: eb.ref("u.username"),
            avatar_url: eb.ref("u.avatar_url"),
          }).as("user"),
          "get_stars.stars",
        ]);

    return {
      byId: Effect.fnUntraced(function* (postId: (typeof Post.select.Type)["id"]) {
        const db = yield* KyselyDB;
        return yield* makeBaseQuery(db)
          .where("p.id", "=", postId)
          .pipe(
            Effect.head,
            Effect.catchTag("NoSuchElementException", () => Effect.succeed(null)),
            catchSql,
          );
      }),

      insert: Effect.fnUntraced(function* (values: typeof Post.insert.Type) {
        const db = yield* KyselyDB;
        return yield* db
          .insertInto("app_public.posts")
          .values(values)
          .returningAll()
          .pipe(
            Effect.head,
            Effect.catchTag("NoSuchElementException", () =>
              Effect.fail(new InternalError({ message: "Failed to create post" })),
            ),
            catchSql,
          );
      }),

      listBy: Effect.fnUntraced(function* (opts: {
        username?: string;
        limit?: number;
        offset?: number;
        sort?: "created_at" | "updated_at" | "stars";
      }) {
        const db = yield* KyselyDB;
        let query = makeBaseQuery(db).limit(opts.limit ?? 50);
        if (opts.username) query = query.where("u.username", "=", opts.username);
        if (opts.sort) query = query.orderBy(opts.sort, "desc");
        if (opts.offset) query = query.offset(opts.offset);
        return yield* query.pipe(catchSql);
      }),
    } as const;
  },
}) {}
