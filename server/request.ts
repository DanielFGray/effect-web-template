import { Schema as S } from "effect";

export class Post extends S.Class<Post>("Post")({
  id: S.Number,
  // user_id: S.UUID,
  body: S.String,
  privacy: S.Union(
    S.Literal("private"),
    S.Literal("secret"),
    S.Literal("public"),
  ),
  created_at: S.Date,
  updated_at: S.Date,
}) { }

export class CreatePost extends S.TaggedRequest<CreatePost>()("CreatePost", {
  failure: S.String,
  success: Post,
  payload: {
    body: S.String,
    privacy: S.optional(S.Union(
      S.Literal("private"),
      S.Literal("secret"),
      S.Literal("public"),
    )),
  },
}) { }

export class PostList extends S.TaggedRequest<PostList>()("PostList", {
  failure: S.String,
  success: S.Array(Post),
  payload: {},
}) { }

export class PostById extends S.TaggedRequest<PostById>()("PostById", {
  failure: S.String,
  success: Post,
  payload: {
    id: S.Number,
  },
}) { }

export class User extends S.Class<User>("User")({
  id: S.String,
  username: S.String,
  name: S.NullOr(S.String),
  avatar_url: S.NullOr(S.String),
  bio: S.NullOr(S.String),
  role: S.Union(S.Literal("user"), S.Literal("admin")),
  is_verified: S.Boolean,
  created_at: S.Date,
  updated_at: S.Date,
}) { }

export class Register extends S.TaggedRequest<Register>()("Register", {
  failure: S.String,
  success: User,
  payload: {
    username: S.String,
    password: S.String,
    email: S.String,
  },
}) { }
