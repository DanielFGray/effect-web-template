create domain app_public.tag as citext check (length(value) between 1 and 64);

create type app_public.privacy as enum ('private', 'secret', 'public');

create table app_public.posts (
  id bigint primary key generated always as identity (start 1000),
  user_id uuid default app_public.current_user_id() references app_public.users on delete set null,
  body text not null check (length(body) between 1 and 1500),
  privacy app_public.privacy not null default 'public',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
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

create policy delete_posts_as_admin on app_public.posts
  for delete using (exists (
    select 1 from app_public.users where id = app_public.current_user_id() and role = 'admin'
  ));

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
