create table app_public.comments (
  id bigint primary key generated always as identity,
  post_id bigint not null references app_public.posts,
  user_id uuid default app_public.current_user_id() references app_public.users on delete set null,
  parent_id bigint references app_public.comments,
  body text not null check (length(body) between 1 and 1500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index on app_public.comments(post_id);
create index on app_public.comments(user_id);
create index on app_public.comments(parent_id);

alter table app_public.comments enable row level security;
create policy select_all on app_public.comments
  for select using (true);
create policy insert_own on app_public.comments
  for insert with check (user_id = app_public.current_user_id());
create policy update_own on app_public.comments
  for update using (user_id = app_public.current_user_id());
create policy delete_own on app_public.comments
  for delete using (user_id = app_public.current_user_id());

create policy delete_comments_as_admin on app_public.comments
  for delete using (exists (
    select 1 from app_public.users where id = app_public.current_user_id() and role = 'admin'
  ));

grant
  select,
  insert (body, post_id, parent_id),
  update (body),
  delete
on app_public.comments to :DATABASE_VISITOR;

create trigger _100_timestamps
  before update on app_public.comments
  for each row
  execute procedure app_private.tg__timestamps();

