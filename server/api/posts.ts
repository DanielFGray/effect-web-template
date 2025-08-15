import { Effect, Layer } from "effect";
import {
  HttpApi,
  HttpApiBuilder,
  HttpApiEndpoint,
  HttpApiGroup,
  HttpApiSchema,
} from "@effect/platform";
import { Schema as S } from "effect";
import { Post, PostsRepo, PostWithDetails } from "../services/posts.js";
import { withRequiredAuth } from "../lib/auth-helpers.js";

const idParam = HttpApiSchema.param("id", S.String);

export const PostsApiGroup = HttpApiGroup.make("posts")
  .add(
    HttpApiEndpoint.get("list", "/posts")
      .setUrlParams(
        S.partial(
          S.Struct({
            username: S.NonEmptyTrimmedString,
            sort: S.Union(
              S.Literal("created_at"),
              S.Literal("updated_at"),
              S.Literal("stars"),
            ),
          }),
        ),
      )
      .addSuccess(S.Array(PostWithDetails)),
  )
  .add(
    HttpApiEndpoint.get("getById")`/posts/${idParam}`.addSuccess(
      S.NullOr(PostWithDetails),
    ),
  )
  .add(
    HttpApiEndpoint.post("create", "/posts")
      .setPayload(Post.insert)
      .addSuccess(S.NullOr(Post.select.pick("id")), { status: 201 }),
  );

export const PostsApi = HttpApi.make("PostsApi").add(PostsApiGroup);

export const PostsApiGroupLive = HttpApiBuilder.group(
  PostsApi,
  "posts",
  (handlers) =>
    Effect.gen(function* () {
      const repo = yield* PostsRepo;
      return handlers
        .handle("list", ({ request, urlParams }) =>
          withRequiredAuth(
            request,
            repo.listBy({
              username: urlParams.username,
              sort: urlParams.sort,
            }),
          ).pipe(Effect.orDie),
        )

        .handle("getById", ({ path: { id }, request }) =>
          withRequiredAuth(request, repo.findById({ id })).pipe(
            Effect.head,
            Effect.catchTag("NoSuchElementException", () =>
              Effect.succeed(null),
            ),
            Effect.orDie,
          ),
        )

        .handle("create", ({ request, payload }) =>
          withRequiredAuth(request, repo.insert(payload)).pipe(
            Effect.head,
            Effect.catchTag("NoSuchElementException", (e) =>
              Effect.succeed(null),
            ),
            Effect.orDie,
          ),
        );
    }),
);

export const PostsApiLive = HttpApiBuilder.api(PostsApi).pipe(
  Layer.provide(PostsApiGroupLive),
  Layer.provide(PostsRepo.Default),
);
