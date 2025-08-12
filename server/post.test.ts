import { Effect, Layer } from "effect";
import { suite, expect, it } from "@effect/vitest";
import { PostService } from "./rpc/posts.js";
import { PgRootDB } from "./db.js";
import { PgContainer } from "./test-container.js";

const TestDbLive = PgRootDB.Kysely.pipe(
  Layer.provide(PgContainer.ClientLiveWithMigrations),
);

suite("posts", () => {
  it.live("can make a new post", () =>
    Effect.gen(function* () {
      const repo = yield* PostService;
      const create = yield* repo.PostCreate({ body: "hello world" });
      expect(create).toBeTypeOf("object");
      expect(create).toHaveProperty("id");

      const result = yield* repo.PostById({ id: create.id });
      expect(result).toBeInstanceOf(Object);
      expect(result).toHaveProperty("id", create.id);
      expect(result).toHaveProperty("body", "hello world");
    }).pipe(Effect.provide(TestDbLive)),
  );
});
