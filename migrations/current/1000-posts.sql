create domain app_public.tag as citext check (length(value) between 1 and 64);

create type app_public.privacy as enum ('private', 'secret', 'public');

create table app_public.posts (
  id int primary key generated always as identity (start 1000),
  user_id uuid not null default app_public.current_user_id() references app_public.users on delete cascade,
  body text not null check (length(body) between 1 and 2000),
  privacy app_public.privacy not null default 'public',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index on app_public.posts (user_id);
create index on app_public.posts (created_at desc);

alter table app_public.posts
  enable row level security;

create policy select_all on app_public.posts
  for select using (privacy = 'public' or user_id = app_public.current_user_id());
create policy insert_own on app_public.posts
  for insert with check (user_id = app_public.current_user_id());
create policy update_own on app_public.posts
  for update using (user_id = app_public.current_user_id());
create policy delete_own on app_public.posts
  for delete using (user_id = app_public.current_user_id());

grant
  select,
  insert (body, privacy),
  update (body, privacy),
  delete
  on app_public.posts to :DATABASE_VISITOR;

create trigger _100_timestamps
  before insert or update
  on app_public.posts
  for each row
execute procedure app_private.tg__timestamps();

---

create type app_public.vote_type as enum ('spam', 'like', 'funny', 'love');

create table app_public.posts_votes (
  post_id int not null references app_public.posts on delete cascade,
  user_id uuid not null default app_public.current_user_id() references app_public.users,
  vote app_public.vote_type not null,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);

create index on app_public.posts_votes (user_id);
create index on app_public.posts_votes (post_id);

alter table app_public.posts_votes
  enable row level security;

create policy select_all on app_public.posts_votes
  for select using (true);
create policy insert_own on app_public.posts_votes
  for insert with check (user_id = app_public.current_user_id());
create policy update_own on app_public.posts_votes
  for update using (user_id = app_public.current_user_id());
create policy delete_own on app_public.posts_votes
  for delete using (user_id = app_public.current_user_id());

grant
  select,
  insert (vote),
  update (vote),
  delete
  on app_public.posts_votes to :DATABASE_VISITOR;
