-- Drip School articles (PRD section 19): written and published by the Content Editor, read by everyone once published.
--   * Draft and In review are private to staff with content access. Published articles appear on the shop when their time comes,
--     so scheduling is a published article with a date in the future.
--   * An article with no body uses the layout built into the shop for that slug (the starter articles); one with a body shows the body.

create type public.article_status as enum ('draft', 'in_review', 'published');

create table public.articles (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) <= 80),
  title text not null check (char_length(btrim(title)) between 3 and 140),
  type text not null check (type in ('Outfit guide', 'How-to', 'Trends')),
  minutes int not null default 3 check (minutes between 1 and 60),
  intro text not null check (char_length(btrim(intro)) between 10 and 600),
  body text check (char_length(body) <= 20000),
  tone text not null default 'navy' check (tone in ('navy', 'grey', 'blue', 'red', 'charcoal')),
  kind text not null default 'sneaker' check (kind in ('sneaker', 'apparel', 'watch', 'slide', 'cap')),
  status public.article_status not null default 'draft',
  publish_at timestamptz,
  author_id uuid references auth.users (id) on delete set null,
  author_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (status <> 'published' or publish_at is not null)
);
create index articles_public_idx on public.articles (publish_at desc) where status = 'published';

create or replace function private.touch_article() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;
create trigger articles_touch before update on public.articles for each row execute function private.touch_article();

alter table public.articles enable row level security;
-- the public sees an article only when it is published and its time has come
create policy articles_public on public.articles for select to anon, authenticated using (status = 'published' and publish_at <= now());
create policy articles_staff_read on public.articles for select to authenticated using (private.has_perm('content', 'view'));
create policy articles_insert on public.articles for insert to authenticated with check (private.has_perm('content', 'create') and author_id = auth.uid());
create policy articles_update on public.articles for update to authenticated using (private.has_perm('content', 'edit')) with check (private.has_perm('content', 'edit'));
create policy articles_delete on public.articles for delete to authenticated using (private.has_perm('content', 'delete'));
revoke all on public.articles from anon, public;
-- shoppers get the reading columns only, never the author's account id
grant select (id, slug, title, type, minutes, intro, body, tone, kind, status, publish_at, author_name, created_at, updated_at) on public.articles to anon;
grant select, insert, update, delete on public.articles to authenticated;
create trigger articles_audit after insert or update or delete on public.articles for each row execute function private.audit_row();
