import { Effect } from "effect";
import { HttpApiBuilder } from "@effect/platform";
import { Posts } from "../services/posts.js";
import { withAuthContext } from "../db.js";
import { Contract } from "../../shared/httpApi.js";

export const PostsApiGroupLive = HttpApiBuilder.group(Contract, "posts", (handlers) =>
  handlers
    .handle("list", ({ urlParams }) =>
      Effect.gen(function* () {
        const posts = yield* Posts;
        return yield* posts.listBy({
          username: urlParams.username,
          sort: urlParams.sort,
        });
      }).pipe(withAuthContext),
    )
    .handle("getById", ({ path: { id } }) =>
      Effect.gen(function* () {
        const posts = yield* Posts;
        return yield* posts.byId(id);
      }).pipe(withAuthContext),
    )
    .handle("create", ({ payload }) =>
      Effect.gen(function* () {
        const posts = yield* Posts;
        return yield* posts.insert(payload);
      }).pipe(withAuthContext),
    ),
);
