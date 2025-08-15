------------------------------------------------------------------------------

create table app_public.stars_on_posts (
  user_id uuid not null default app_public.current_user_id() references app_public.users on delete cascade,
  post_id bigint not null references app_public.posts on delete cascade,
  primary key (post_id, user_id)
);
alter table app_public.stars_on_posts enable row level security;

create index on app_public.stars_on_posts(post_id);
create index on app_public.stars_on_posts(user_id);

create policy select_all on app_public.stars_on_posts
  for select using (true);
create policy insert_own on app_public.stars_on_posts
  for insert with check (user_id = app_public.current_user_id());
create policy delete_own on app_public.stars_on_posts
    for delete using (user_id = app_public.current_user_id());
grant
  select,
  insert (post_id),
  delete
on app_public.stars_on_posts to :DATABASE_VISITOR;

create function app_public.stars_on_posts(
  p app_public.posts
) returns bigint as $$
  select count(*) from app_public.stars_on_posts where post_id = p.id
$$ language sql stable;
grant execute on function app_public.stars_on_posts(app_public.posts) to :DATABASE_VISITOR;

create function app_public.posts_user_starred(
  p app_public.posts
) returns boolean as $$
  select exists(select 1 from app_public.stars_on_posts where user_id = app_public.current_user_id())
$$ language sql stable security definer;
grant execute on function app_public.posts_user_starred(app_public.posts) to :DATABASE_VISITOR;

create function app_public.star_post(
  id bigint
) returns bigint as $$
  insert into app_public.stars_on_posts(user_id, post_id) values (app_public.current_user_id(), id);
  select count(*) from app_public.stars_on_posts where post_id = id;
$$ language sql volatile security definer;
grant execute on function app_public.star_post to :DATABASE_VISITOR;

create function app_public.unstar_post(
  id bigint
) returns bigint as $$
  delete from app_public.stars_on_posts values where post_id = id and user_id = app_public.current_user_id();
  select count(*) from app_public.stars_on_posts where post_id = id;
$$ language sql volatile security definer;
grant execute on function app_public.unstar_post to :DATABASE_VISITOR;

------------------------------------------------------------------------------

create table app_public.stars_on_comments (
  user_id uuid not null default app_public.current_user_id() references app_public.users on delete cascade,
  comment_id bigint not null references app_public.comments on delete cascade,
  primary key (comment_id, user_id)
);

alter table app_public.stars_on_comments enable row level security;

create index on app_public.stars_on_comments(comment_id);
create index on app_public.stars_on_comments(user_id);

create policy select_comment_stars on app_public.stars_on_comments
  for select using (true);
create policy insert_own_comment_star on app_public.stars_on_comments
  for insert with check (user_id = app_public.current_user_id());
create policy delete_own_comment_star on app_public.stars_on_comments
    for delete using (user_id = app_public.current_user_id());

grant
  select,
  insert (comment_id),
  delete
on app_public.stars_on_comments to :DATABASE_VISITOR;

create function app_public.stars_on_comments (c_id bigint) returns bigint as $$
  select count(*)
  from app_public.stars_on_comments x
  where x.comment_id = c_id
$$ language sql stable;
grant execute on function app_public.stars_on_comments to :DATABASE_VISITOR;

create function app_public.comments_user_starred(
  c app_public.comments
) returns boolean as $$
  select exists (
    select 1
    from app_public.stars_on_posts
    where user_id = app_public.current_user_id()
  )
$$ language sql stable security definer;
grant execute on function app_public.comments_user_starred to :DATABASE_VISITOR;

create function app_public.star_comment(id bigint) returns bigint as $$
  insert into app_public.stars_on_comments (comment_id, user_id) values (id, app_public.current_user_id())
    on conflict do nothing;
  select count(*) from app_public.stars_on_comments t where id = t.comment_id
$$ language sql volatile security definer;
grant execute on function app_public.star_comment to :DATABASE_VISITOR;

create function app_public.unstar_comment(id bigint) returns bigint as $$
  delete from app_public.stars_on_comments
    where comment_id = id
    and user_id = app_public.current_user_id();
  select count(*) from app_public.stars_on_comments t where comment_id = t.comment_id;
$$ language sql volatile security definer;
grant execute on function app_public.unstar_comment to :DATABASE_VISITOR;

