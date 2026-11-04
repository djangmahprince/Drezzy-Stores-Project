-- Content management (PRD section 19, Drip School section 11), analytics (sections 15, 16 and 24), exports (section 17)
-- and the scheduled checks that turn time-based rules into alerts and messages (sections 14, 15 and 18).

-- ---------------------------------------------------------------------------
-- Site settings, home page builder, banners, announcement bar
-- ---------------------------------------------------------------------------
create table public.site_settings (
  id int primary key default 1 check (id = 1),
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
insert into public.site_settings (data) values ('{
  "accra": {"call": "054 899 6648", "whatsapp": "050 131 5862"},
  "kumasi": {"call": "055 355 7347", "whatsapp": "055 355 7347"},
  "hours": "Monday to Saturday, 8am to 8pm",
  "socials": {"instagram": "https://instagram.com/drezzy_stores", "tiktok": "https://tiktok.com/@drezzy.stores", "snapchat": "https://snapchat.com/add/drezzystores"},
  "promise": "Nationwide delivery from our Accra and Kumasi branches"
}') on conflict (id) do nothing;

create table public.home_sections (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('hero', 'categories', 'new', 'best', 'manual', 'drip', 'reviews', 'promo', 'looks', 'picked', 'promise', 'drops')),
  title text check (char_length(title) <= 80),
  config jsonb not null default '{}'::jsonb,
  sort int not null default 0,
  active boolean not null default true
);
insert into public.home_sections (kind, title, sort) values
  ('hero', null, 1), ('categories', 'Shop by category', 2), ('new', 'New arrivals', 3), ('picked', 'Picked for you', 4), ('best', 'Best sellers', 5),
  ('drops', 'Upcoming drops', 6), ('looks', 'Shop the look', 7), ('drip', 'Drip School', 8), ('reviews', 'What customers say', 9), ('promise', null, 10);

create table public.banners (
  id uuid primary key default gen_random_uuid(),
  placement text not null default 'hero' check (placement in ('hero', 'promo')),
  title text not null check (char_length(title) between 2 and 80),
  subtitle text check (char_length(subtitle) <= 200),
  cta_label text check (char_length(cta_label) <= 30),
  cta_href text check (cta_href is null or cta_href ~ '^(/|https://)'),
  image_desktop text,
  image_mobile text,
  tone text not null default 'navy' check (tone in ('navy', 'grey', 'blue', 'red', 'charcoal')),
  starts_at timestamptz,
  ends_at timestamptz,
  active boolean not null default true,
  sort int not null default 0,
  created_at timestamptz not null default now(),
  check (ends_at is null or starts_at is null or ends_at > starts_at)
);

create table public.announcements (
  id uuid primary key default gen_random_uuid(),
  text text not null check (char_length(text) between 3 and 140),
  href text check (href is null or href ~ '^(/|https://)'),
  starts_at timestamptz,
  ends_at timestamptz,
  active boolean not null default true,
  sort int not null default 0
);

-- ---------------------------------------------------------------------------
-- Collections: manual lists and rule-based lists (FR-CMS-004)
-- ---------------------------------------------------------------------------
create table public.collections (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  title text not null check (char_length(title) between 2 and 80),
  description text check (char_length(description) <= 600),
  kind text not null default 'manual' check (kind in ('manual', 'rule')),
  product_slugs text[] not null default '{}',
  -- {"brand": "Nike", "category": "Sneakers", "audience": "Ladies", "max_price": 500, "min_price": 0, "tag": "Streetwear", "on_sale": true}
  rule jsonb not null default '{}'::jsonb,
  image text,
  seo_title text check (char_length(seo_title) <= 70),
  seo_description text check (char_length(seo_description) <= 170),
  published boolean not null default false,
  sort int not null default 0,
  updated_at timestamptz not null default now()
);
create trigger collections_touch before update on public.collections for each row execute function private.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Static pages with version history (FR-CMS-005, FR-CMS-008)
-- ---------------------------------------------------------------------------
create table public.pages (
  slug text primary key check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  title text not null check (char_length(title) between 2 and 100),
  body text not null default '' check (char_length(body) <= 30000),
  seo_title text check (char_length(seo_title) <= 70),
  seo_description text check (char_length(seo_description) <= 170),
  published boolean not null default true,
  updated_by uuid references auth.users (id) on delete set null,
  updated_at timestamptz not null default now()
);
create trigger pages_touch before update on public.pages for each row execute function private.touch_updated_at();

create table public.content_versions (
  id bigint generated always as identity primary key,
  kind text not null check (kind in ('article', 'page')),
  ref text not null,
  snapshot jsonb not null,
  saved_by_name text,
  at timestamptz not null default now()
);
create index content_versions_ref_idx on public.content_versions (kind, ref, at desc);

-- ---------------------------------------------------------------------------
-- Articles: more types, SEO fields, hero and share images, tags, featured, preview links, versions, metrics
-- ---------------------------------------------------------------------------
alter table public.articles drop constraint if exists articles_type_check;
alter table public.articles add constraint articles_type_check check (type in ('Outfit guide', 'How-to', 'Trends', 'Occasion lookbook', 'Drop news', 'Customer spotlight', 'Gift guide'));
alter table public.articles
  add column if not exists seo_title text check (char_length(seo_title) <= 70),
  add column if not exists seo_description text check (char_length(seo_description) <= 170),
  add column if not exists hero_image text,
  add column if not exists share_image text,
  add column if not exists tags text[] not null default '{}',
  add column if not exists featured boolean not null default false,
  add column if not exists preview_token uuid not null default gen_random_uuid();
grant select (seo_title, seo_description, hero_image, share_image, tags, featured) on public.articles to anon;

create or replace function private.version_content() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_table_name = 'articles' then
    if (old.title, old.intro, old.body, old.status, old.publish_at) is distinct from (new.title, new.intro, new.body, new.status, new.publish_at) then
      insert into public.content_versions (kind, ref, snapshot, saved_by_name)
      values ('article', old.id::text, jsonb_build_object('title', old.title, 'intro', old.intro, 'body', old.body, 'type', old.type, 'status', old.status,
        'publish_at', old.publish_at, 'seo_title', old.seo_title, 'seo_description', old.seo_description, 'tags', old.tags), private.staff_name());
    end if;
  else
    if (old.title, old.body, old.published) is distinct from (new.title, new.body, new.published) then
      insert into public.content_versions (kind, ref, snapshot, saved_by_name)
      values ('page', old.slug, jsonb_build_object('title', old.title, 'body', old.body, 'published', old.published, 'seo_title', old.seo_title, 'seo_description', old.seo_description), private.staff_name());
    end if;
  end if;
  return new;
end $$;
create trigger articles_versions after update on public.articles for each row execute function private.version_content();
create trigger pages_versions after update on public.pages for each row execute function private.version_content();

-- One-click restore of an earlier version.
create or replace function public.restore_version(p_version bigint) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v public.content_versions%rowtype;
begin
  if not private.has_perm('content', 'edit') then raise exception 'You cannot change content' using errcode = '42501'; end if;
  select * into v from public.content_versions where id = p_version;
  if not found then raise exception 'Version not found'; end if;
  if v.kind = 'article' then
    update public.articles set title = v.snapshot ->> 'title', intro = v.snapshot ->> 'intro', body = v.snapshot ->> 'body',
      seo_title = v.snapshot ->> 'seo_title', seo_description = v.snapshot ->> 'seo_description', status = 'draft'
    where id = v.ref::uuid;
  else
    update public.pages set title = v.snapshot ->> 'title', body = v.snapshot ->> 'body' where slug = v.ref;
  end if;
end $$;

-- A preview link for a draft (FR-JR-006): anyone with the token can read it, nothing else.
create or replace function public.article_preview(p_token uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select to_jsonb(a) - 'author_id' - 'preview_token' from public.articles a where a.preview_token = p_token
$$;

create table public.article_events (
  id bigint generated always as identity primary key,
  slug text not null check (char_length(slug) <= 80),
  session text not null check (char_length(session) between 8 and 64),
  kind text not null check (kind in ('view', 'product_click', 'add_to_bag', 'read')),
  product text check (char_length(product) <= 120),
  depth int check (depth between 0 and 100),
  seconds int check (seconds between 0 and 3600),
  day date not null default current_date,
  at timestamptz not null default now()
);
create unique index article_events_once on public.article_events (slug, session, kind, coalesce(product, ''), day);
alter table public.article_events enable row level security;
revoke all on public.article_events from anon, authenticated, public;

create or replace function public.track_article(p_slug text, p_session text, p_kind text, p_product text default null, p_depth int default null, p_seconds int default null) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if p_kind not in ('view', 'product_click', 'add_to_bag', 'read') or char_length(coalesce(p_session, '')) not between 8 and 64 or char_length(coalesce(p_slug, '')) not between 1 and 80 then return; end if;
  insert into public.article_events (slug, session, kind, product, depth, seconds)
  values (p_slug, p_session, p_kind, left(p_product, 120), least(greatest(p_depth, 0), 100), least(greatest(p_seconds, 0), 3600))
  on conflict (slug, session, kind, coalesce(product, ''), day) do update set depth = greatest(public.article_events.depth, excluded.depth), seconds = greatest(public.article_events.seconds, excluded.seconds);
end $$;

-- Per-article metrics (FR-JR-010): views, average read time, product clicks, add-to-bags and sales credited to the article.
create or replace function public.article_metrics(p_from date, p_to date) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not (private.has_perm('content', 'view') or private.has_perm('analytics', 'view')) then raise exception 'You cannot see content metrics' using errcode = '42501'; end if;
  return coalesce((select jsonb_agg(x order by (x ->> 'views')::int desc) from (
    select jsonb_build_object('slug', a.slug, 'title', a.title, 'status', a.status, 'publish_at', a.publish_at,
      'views', (select count(*) from public.article_events e where e.slug = a.slug and e.kind = 'view' and e.day between p_from and p_to),
      'avg_seconds', (select round(avg(e.seconds)) from public.article_events e where e.slug = a.slug and e.kind = 'read' and e.day between p_from and p_to),
      'avg_depth', (select round(avg(e.depth)) from public.article_events e where e.slug = a.slug and e.kind = 'read' and e.day between p_from and p_to),
      'product_clicks', (select count(*) from public.article_events e where e.slug = a.slug and e.kind = 'product_click' and e.day between p_from and p_to),
      'add_to_bags', (select count(*) from public.article_events e where e.slug = a.slug and e.kind = 'add_to_bag' and e.day between p_from and p_to),
      'orders', (select count(*) from public.orders o where o.article_slug = a.slug and o.amount_paid > 0 and o.status <> 'cancelled' and o.created_at >= p_from and o.created_at < p_to + 1),
      'sales', case when private.has_perm('expenses', 'view') or private.has_perm('orders', 'delete') then
        (select coalesce(sum(o.amount_paid), 0) from public.orders o where o.article_slug = a.slug and o.status <> 'cancelled' and o.created_at >= p_from and o.created_at < p_to + 1) end) x
    from public.articles a) t), '[]'::jsonb);
end $$;

-- ---------------------------------------------------------------------------
-- Media library (FR-CMS-007). Files live in the public "media" bucket; Next/Image resizes and compresses on delivery.
-- ---------------------------------------------------------------------------
create table public.media (
  id uuid primary key default gen_random_uuid(),
  path text not null unique,
  url text not null,
  alt text check (char_length(alt) <= 200),
  folder text not null default 'general' check (folder ~ '^[a-z0-9-]{2,30}$'),
  tags text[] not null default '{}',
  mime text,
  size int,
  width int,
  height int,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Email templates (FR-NT-001), glossary (FR-JR-012), redirects (FR-CMS-010), on-site feedback (FR-AN-009)
-- ---------------------------------------------------------------------------
create table public.message_templates (
  key text primary key check (key ~ '^[a-z_]{2,40}$'),
  subject text not null check (char_length(subject) between 2 and 140),
  body text not null check (char_length(body) between 2 and 5000),
  active boolean not null default true,
  updated_at timestamptz not null default now()
);
insert into public.message_templates (key, subject, body) values
  ('order_placed', 'We got your order {{number}}', 'Hi {{first_name}},\n\nThank you for your order. We have it as {{number}}.\n\nTotal {{total}}. {{paid_line}}\n\nTrack your order: {{link}}'),
  ('order_update', '{{number}}: {{headline}}', 'Hi {{first_name}},\n\nAn update on your order {{number}}: {{headline}}.\n\n{{rider_line}}{{balance_line}}\n\nTrack your order: {{link}}'),
  ('support_reply', 'Re: {{subject}}', 'Hi {{first_name}},\n\n{{body}}\n\nReply from the tracking page or your account: {{link}}'),
  ('stock_back', '{{product}} is available again', 'Good news. {{product}} {{size_line}}is available again. It may not last: {{link}}'),
  ('wishlist_back', 'Back in stock: {{product}}', 'An item on your wishlist is available again: {{product}}. {{link}}'),
  ('wishlist_price', 'Price drop: {{product}}', '{{product}} on your wishlist is now {{price}} (was {{was}}). {{link}}'),
  ('drop_open', '{{product}} is live', 'The drop you asked about is open now: {{product}}. Limited per customer. {{link}}'),
  ('feedback_request', 'How did we do with {{number}}?', 'Hi {{first_name}},\n\nYour order {{number}} was delivered. Tell us how it went in one tap, and review what you bought: {{link}}'),
  ('abandoned_cart', 'Still thinking about it?', 'You left items in your bag at Drezzy Stores. They are still available for now: {{link}}\n\nYou are getting this because you asked us to remind you.'),
  ('digest', 'New on Drip School', 'Fresh from Drip School this week:\n\n{{articles}}\n\nUnsubscribe in one click: {{unsubscribe}}'),
  ('daily_summary', 'Drezzy today: {{date}}', 'Paid orders {{orders}} · Sales {{sales}} · Cash in {{cash}} · Balances to collect {{owed}} · Stuck orders {{stuck}}\n\n{{link}}'),
  ('weekly_report', 'Drezzy week of {{date}}', 'Paid orders {{orders}} · Sales {{sales}} · Delivered {{delivered}} · On time {{on_time}} · Reports filed {{reports}}\n\n{{link}}'),
  ('weekly_summary', 'Your week at Drezzy: {{date}}', 'Hi {{first_name}},\n\nScore {{score}} (last week {{last}}). Wins: {{wins}}. Misses: {{misses}}.\n\n{{link}}'),
  ('export_ready', 'Your export is ready', 'Your {{kind}} export ({{rows}} rows) is ready. The link works for 24 hours: {{link}}')
on conflict (key) do nothing;

create table public.glossary_terms (
  slug text primary key check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  term text not null check (char_length(term) between 1 and 60),
  definition text not null check (char_length(definition) between 3 and 600),
  sort int not null default 0
);
insert into public.glossary_terms (slug, term, definition, sort) values
  ('og', 'OG', 'Short for "original". The first colourway a shoe was released in, often the most wanted.', 1),
  ('retro', 'Retro', 'A re-release of a classic model, made to look like the original from years ago.', 2),
  ('colourway', 'Colourway', 'The colour combination of a shoe or outfit, for example "Panda" is black and white.', 3),
  ('gs-sizing', 'GS sizing', 'Grade School sizes: smaller sizes made for older kids that many adults with small feet wear too.', 4),
  ('quarter-zip', 'Quarter-zip', 'A pullover top with a short zip at the neck, a smart-casual favourite.', 5),
  ('deadstock', 'Deadstock', 'Brand new and never worn, in the original box. Every Drezzy item is brand new.', 6)
on conflict (slug) do nothing;

create table public.redirects (
  from_path text primary key check (from_path ~ '^/[A-Za-z0-9/_.-]*$'),
  to_path text not null check (to_path ~ '^(/|https://)'),
  permanent boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.site_feedback (
  id bigint generated always as identity primary key,
  page text check (char_length(page) <= 200),
  message text not null check (char_length(btrim(message)) between 2 and 1000),
  rating int check (rating between 1 and 5),
  email text check (email is null or email ~ '^[^\s@]+@[^\s@]+\.[^\s@]{2,}$'),
  created_at timestamptz not null default now()
);

create or replace function public.send_site_feedback(p_page text, p_message text, p_rating int default null, p_email text default null) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if char_length(btrim(coalesce(p_message, ''))) < 2 then raise exception 'Write a short message'; end if;
  if (select count(*) from public.site_feedback where created_at > now() - interval '1 minute') > 30 then raise exception 'Please try again in a minute'; end if;
  insert into public.site_feedback (page, message, rating, email) values (left(p_page, 200), left(btrim(p_message), 1000), p_rating, lower(nullif(btrim(coalesce(p_email, '')), '')));
end $$;

-- ---------------------------------------------------------------------------
-- RLS for content
-- ---------------------------------------------------------------------------
alter table public.site_settings enable row level security;
alter table public.home_sections enable row level security;
alter table public.banners enable row level security;
alter table public.announcements enable row level security;
alter table public.collections enable row level security;
alter table public.pages enable row level security;
alter table public.content_versions enable row level security;
alter table public.media enable row level security;
alter table public.message_templates enable row level security;
alter table public.glossary_terms enable row level security;
alter table public.redirects enable row level security;
alter table public.site_feedback enable row level security;

create policy site_settings_read on public.site_settings for select to anon, authenticated using (true);
create policy site_settings_write on public.site_settings for update to authenticated using (private.has_perm('settings', 'edit') or private.has_perm('content', 'edit'))
  with check (private.has_perm('settings', 'edit') or private.has_perm('content', 'edit'));
create policy home_read on public.home_sections for select to anon, authenticated using (active);
create policy home_read_staff on public.home_sections for select to authenticated using (private.has_perm('content', 'view'));
create policy home_write on public.home_sections for all to authenticated using (private.has_perm('content', 'edit')) with check (private.has_perm('content', 'edit'));
create policy banners_read on public.banners for select to anon, authenticated
  using (active and (starts_at is null or starts_at <= now()) and (ends_at is null or ends_at > now()));
create policy banners_read_staff on public.banners for select to authenticated using (private.has_perm('content', 'view'));
create policy banners_write on public.banners for all to authenticated using (private.has_perm('content', 'edit')) with check (private.has_perm('content', 'edit'));
create policy announcements_read on public.announcements for select to anon, authenticated
  using (active and (starts_at is null or starts_at <= now()) and (ends_at is null or ends_at > now()));
create policy announcements_read_staff on public.announcements for select to authenticated using (private.has_perm('content', 'view'));
create policy announcements_write on public.announcements for all to authenticated using (private.has_perm('content', 'edit')) with check (private.has_perm('content', 'edit'));
create policy collections_read on public.collections for select to anon, authenticated using (published);
create policy collections_read_staff on public.collections for select to authenticated using (private.has_perm('content', 'view'));
create policy collections_write on public.collections for all to authenticated using (private.has_perm('content', 'edit')) with check (private.has_perm('content', 'edit'));
create policy pages_read on public.pages for select to anon, authenticated using (published);
create policy pages_read_staff on public.pages for select to authenticated using (private.has_perm('content', 'view'));
create policy pages_write on public.pages for all to authenticated using (private.has_perm('content', 'edit')) with check (private.has_perm('content', 'edit'));
create policy versions_read on public.content_versions for select to authenticated using (private.has_perm('content', 'view'));
create policy media_read on public.media for select to authenticated using (private.has_perm('content', 'view') or private.has_perm('products', 'view'));
create policy media_write on public.media for insert to authenticated with check ((private.has_perm('content', 'create') or private.has_perm('products', 'edit')) and created_by = auth.uid());
create policy media_update on public.media for update to authenticated using (private.has_perm('content', 'edit') or private.has_perm('products', 'edit')) with check (private.has_perm('content', 'edit') or private.has_perm('products', 'edit'));
create policy media_delete on public.media for delete to authenticated using (private.has_perm('content', 'delete'));
create policy templates_read on public.message_templates for select to authenticated using (private.has_perm('settings', 'view'));
create policy templates_write on public.message_templates for update to authenticated using (private.has_perm('settings', 'edit')) with check (private.has_perm('settings', 'edit'));
create policy glossary_read on public.glossary_terms for select to anon, authenticated using (true);
create policy glossary_write on public.glossary_terms for all to authenticated using (private.has_perm('content', 'edit')) with check (private.has_perm('content', 'edit'));
create policy redirects_read on public.redirects for select to anon, authenticated using (true);
create policy redirects_write on public.redirects for all to authenticated using (private.has_perm('settings', 'edit') or private.has_perm('content', 'edit'))
  with check (private.has_perm('settings', 'edit') or private.has_perm('content', 'edit'));
create policy feedback_read on public.site_feedback for select to authenticated using (private.has_perm('analytics', 'view'));

revoke all on public.site_settings, public.home_sections, public.banners, public.announcements, public.collections, public.pages, public.content_versions,
  public.media, public.message_templates, public.glossary_terms, public.redirects, public.site_feedback from anon, authenticated, public;
grant select on public.site_settings, public.home_sections, public.banners, public.announcements, public.collections, public.pages, public.glossary_terms, public.redirects to anon;
grant select on public.site_settings, public.home_sections, public.banners, public.announcements, public.collections, public.pages, public.content_versions,
  public.media, public.message_templates, public.glossary_terms, public.redirects, public.site_feedback to authenticated;
grant update on public.site_settings, public.message_templates to authenticated;
grant insert, update, delete on public.home_sections, public.banners, public.announcements, public.collections, public.pages, public.media, public.glossary_terms, public.redirects to authenticated;

create trigger site_settings_audit after update on public.site_settings for each row execute function private.audit_row();
create trigger templates_audit after update on public.message_templates for each row execute function private.audit_row();
create trigger banners_audit after insert or update or delete on public.banners for each row execute function private.audit_row();
create trigger collections_audit after insert or update or delete on public.collections for each row execute function private.audit_row();
create trigger redirects_audit after insert or update or delete on public.redirects for each row execute function private.audit_row();

-- ---------------------------------------------------------------------------
-- First-party analytics events (PRD section 24)
-- ---------------------------------------------------------------------------
create table public.events (
  id bigint generated always as identity primary key,
  session text not null check (char_length(session) between 8 and 64),
  name text not null,
  params jsonb not null default '{}'::jsonb,
  path text check (char_length(path) <= 200),
  device text check (device in ('mobile', 'tablet', 'desktop')),
  region text check (char_length(region) <= 60),
  utm_source text check (char_length(utm_source) <= 60),
  utm_medium text check (char_length(utm_medium) <= 60),
  utm_campaign text check (char_length(utm_campaign) <= 80),
  referrer text check (char_length(referrer) <= 200),
  day date not null default current_date,
  at timestamptz not null default now()
);
create index events_day_name_idx on public.events (day, name);
alter table public.events enable row level security;
revoke all on public.events from anon, authenticated, public;

-- daily counts kept after raw events are trimmed (retention, FR-DATA-010)
create table public.events_daily (
  day date not null,
  name text not null,
  count int not null,
  primary key (day, name)
);
alter table public.events_daily enable row level security;
revoke all on public.events_daily from anon, authenticated, public;

create or replace function public.track_events(p_events jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare
  e jsonb;
  v_names text[] := array['page_view', 'view_item_list', 'search', 'view_item', 'select_size', 'add_to_cart', 'remove_from_cart', 'add_to_wishlist',
    'begin_checkout', 'add_shipping_info', 'add_payment_info', 'source_answer', 'payment_failed', 'purchase', 'order_status_view', 'whatsapp_click',
    'article_view', 'article_product_click', 'quiz_complete', 'sign_up', 'login', 'newsletter_subscribe', 'notify_me', 'pwa_install',
    'notification_opt_in', 'referral_used', 'feedback'];
  v_funnel text;
begin
  if jsonb_typeof(p_events) <> 'array' then return; end if;
  for e in select * from jsonb_array_elements(p_events) limit 25 loop
    continue when not (e ->> 'name' = any (v_names)) or char_length(coalesce(e ->> 'session', '')) not between 8 and 64;
    insert into public.events (session, name, params, path, device, region, utm_source, utm_medium, utm_campaign, referrer)
    values (e ->> 'session', e ->> 'name',
      case when jsonb_typeof(e -> 'params') = 'object' and char_length((e -> 'params')::text) <= 2000 then e -> 'params' else '{}'::jsonb end,
      left(e ->> 'path', 200), case when e ->> 'device' in ('mobile', 'tablet', 'desktop') then e ->> 'device' end, left(e ->> 'region', 60),
      left(e ->> 'utm_source', 60), left(e ->> 'utm_medium', 60), left(e ->> 'utm_campaign', 80), left(e ->> 'referrer', 200));
    -- the funnel keeps its one-row-per-visitor-per-step table
    v_funnel := case e ->> 'name' when 'page_view' then 'visit' when 'view_item' then 'product_view' when 'add_to_cart' then 'add_to_cart' when 'begin_checkout' then 'checkout_started' end;
    if v_funnel is not null then
      insert into public.site_events (session, name, source) values (e ->> 'session', v_funnel, left(coalesce(e ->> 'utm_source', e ->> 'referrer'), 40)) on conflict do nothing;
    end if;
  end loop;
end $$;

-- UTM campaigns (FR-AN-008) and ad spend per campaign (cost per order by channel)
create table public.campaigns (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 80),
  utm_source text not null check (utm_source ~ '^[a-z0-9_.-]{2,40}$'),
  utm_medium text not null check (utm_medium ~ '^[a-z0-9_.-]{2,40}$'),
  utm_campaign text not null check (utm_campaign ~ '^[a-z0-9_.-]{2,60}$'),
  landing_path text not null default '/' check (landing_path ~ '^/'),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (utm_source, utm_medium, utm_campaign)
);
alter table public.campaigns enable row level security;
create policy campaigns_read on public.campaigns for select to authenticated using (private.has_perm('analytics', 'view') or private.has_perm('content', 'view'));
create policy campaigns_write on public.campaigns for all to authenticated using (private.has_perm('analytics', 'edit') or private.has_perm('content', 'edit'))
  with check (private.has_perm('analytics', 'edit') or private.has_perm('content', 'edit'));
revoke all on public.campaigns from anon, authenticated, public;
grant select, insert, update, delete on public.campaigns to authenticated;

-- ---------------------------------------------------------------------------
-- Reports (FR-AN-001 to FR-AN-012)
-- ---------------------------------------------------------------------------
-- Does the caller see money figures in analytics? (Money-limited or unlimited analytics roles.)
create or replace function private.analytics_money() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select rp.restriction is null or rp.restriction ilike 'money%' from public.role_permissions rp where rp.role_id = private.my_role() and rp.module = 'analytics'), false)
$$;

-- The KPI catalogue for a period, with the previous period of the same length and a daily series for the trend line.
create or replace function private.kpis(p_from date, p_to date) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  r jsonb;
begin
  with o as (
    select * from public.orders where created_at >= p_from and created_at < p_to + 1
  ), paid as (
    select * from o where payment_state in ('paid', 'part_paid', 'partly_refunded', 'refunded') and status <> 'cancelled'
  ), sessions as (
    select count(distinct session) n from public.site_events where name = 'visit' and day between p_from and p_to
  ), carts as (
    select count(distinct session) n from public.site_events where name = 'add_to_cart' and day between p_from and p_to
  ), attempts as (
    select count(*) filter (where p.status = 'success') ok, count(*) filter (where p.status in ('success', 'failed')) n
    from public.payments p where p.kind = 'checkout' and p.created_at >= p_from and p.created_at < p_to + 1
  ), refunds as (
    select coalesce(sum(p.amount), 0) amt from public.payments p where p.kind = 'refund' and p.status = 'success' and p.confirmed_at >= p_from and p.confirmed_at < p_to + 1
  ), ev as (
    select e.order_id, e.status, min(e.at) at from public.order_events e join o on o.id = e.order_id where e.kind = 'status' group by 1, 2
  ), delivered as (
    select * from public.orders where status = 'delivered' and delivered_at >= p_from and delivered_at < p_to + 1
  ), costs as (
    select coalesce(sum(c.agreed_cost), 0) amt from public.supplier_orders so join public.supplier_order_costs c on c.supplier_order_id = so.id where so.order_id in (select id from paid)
  )
  select jsonb_build_object(
    'gross_sales', (select coalesce(sum(total + discount), 0) from paid),
    'net_sales', (select coalesce(sum(total), 0) from paid) - (select amt from refunds),
    'cash_received', (select coalesce(sum(p.amount), 0) from public.payments p where p.kind in ('checkout', 'balance') and p.status = 'success' and p.confirmed_at >= p_from and p.confirmed_at < p_to + 1),
    'balances_outstanding', (select coalesce(sum(balance_due), 0) from public.orders where payment_state = 'part_paid' and status not in ('delivered', 'cancelled')),
    'orders', (select count(*) from paid),
    'aov', (select case when count(*) > 0 then round((sum(total) - (select amt from refunds)) / count(*), 2) end from paid),
    'sessions', (select n from sessions),
    'conversion', (select case when s.n > 0 then round((select count(*) from paid) * 100.0 / s.n, 1) end from sessions s),
    'cart_abandonment', (select case when c.n > 0 then round(greatest(c.n - (select count(*) from o where channel = 'web'), 0) * 100.0 / c.n, 1) end from carts c),
    'payment_success', (select case when a.n > 0 then round(a.ok * 100.0 / a.n, 1) end from attempts a),
    'half_payment_share', (select case when count(*) > 0 then round(count(*) filter (where payment_plan = 'half') * 100.0 / count(*), 1) end from paid where region = 'Greater Accra' or delivery_method = 'pickup'),
    'new_customers', (select count(*) from (select distinct customer_id from paid) x
                      where not exists (select 1 from public.orders o2 where o2.customer_id = x.customer_id and o2.amount_paid > 0 and o2.created_at < p_from)),
    'repeat_customers', (select count(distinct customer_id) from paid where exists (select 1 from public.orders o2 where o2.customer_id = paid.customer_id and o2.amount_paid > 0 and o2.created_at < p_from)),
    'repeat_rate_90', (select case when count(*) > 0 then round(count(*) filter (where n >= 2) * 100.0 / count(*), 1) end
                       from (select customer_id, count(*) n from public.orders where amount_paid > 0 and status <> 'cancelled' and created_at >= p_to - 89 and created_at < p_to + 1 group by customer_id) x),
    'time_to_confirm_h', (select round(avg(extract(epoch from (e.at - o.created_at)) / 3600)::numeric, 1) from ev e join o on o.id = e.order_id where e.status = 'to_source'),
    'time_to_source_h', (select round(avg(extract(epoch from (r.at - p.confirmed_at)) / 3600)::numeric, 1) from ev r
                         join lateral (select min(confirmed_at) confirmed_at from public.payments where order_id = r.order_id and status = 'success') p on true where r.status = 'ready_to_pack'),
    'could_not_source_rate', (select case when count(*) > 0 then round(count(*) filter (where exists (select 1 from public.order_items i where i.order_id = paid.id and i.sourcing = 'failed') or sourcing_outcome is not null) * 100.0 / count(*), 1) end from paid),
    'fulfilment_days', (select round(avg(extract(epoch from (delivered_at - created_at)) / 86400)::numeric, 1) from delivered),
    'on_time_rate', (select case when count(*) > 0 then round(count(*) filter (where delivered_at::date <= est_delivery_date) * 100.0 / count(*), 1) end from delivered),
    'failed_delivery_rate', (select case when count(*) > 0 then round(count(*) filter (where kind_failed) * 100.0 / count(*), 1) end
                             from (select e.order_id, bool_or(e.status = 'failed_delivery') kind_failed from public.order_events e where e.status in ('failed_delivery', 'delivered') and e.at >= p_from and e.at < p_to + 1 group by e.order_id) x),
    'gross_margin', (select case when sum(total) > 0 then round((sum(total) - (select amt from costs)) * 100.0 / sum(total), 1) end from paid where private.can_see_costs()),
    'satisfaction', (select round(avg(f.rating)::numeric, 2) from public.order_feedback f where f.created_at >= p_from and f.created_at < p_to + 1),
    'article_views', (select count(*) from public.article_events where kind = 'view' and day between p_from and p_to),
    'article_sales', (select coalesce(sum(amount_paid), 0) from paid where article_slug is not null),
    'report_completion', (select case when private.working_days(p_from, least(p_to, current_date)) * (select count(*) from public.staff where active) > 0
                            then round((select count(*) from public.daily_reports where report_date between p_from and p_to) * 100.0
                                       / (private.working_days(p_from, least(p_to, current_date)) * (select count(*) from public.staff where active))) end)
  ) into r;
  return r;
end $$;

create or replace function public.kpi_report(p_from date, p_to date) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_len int := p_to - p_from + 1;
  v_money boolean := private.analytics_money();
  v_now jsonb;
  v_prev jsonb;
  v_series jsonb;
  v_hidden text[] := array['gross_sales', 'net_sales', 'cash_received', 'balances_outstanding', 'aov', 'gross_margin', 'article_sales'];
begin
  if not private.has_perm('analytics', 'view') then raise exception 'You cannot see analytics' using errcode = '42501'; end if;
  if p_from is null or p_to is null or p_to < p_from or v_len > 400 then raise exception 'Choose a valid period'; end if;
  v_now := private.kpis(p_from, p_to);
  v_prev := private.kpis(p_from - v_len, p_from - 1);
  select jsonb_agg(jsonb_build_object('day', d::date,
      'orders', (select count(*) from public.orders o where o.created_at::date = d::date and o.amount_paid > 0 and o.status <> 'cancelled'),
      'sales', case when v_money then (select coalesce(sum(total), 0) from public.orders o where o.created_at::date = d::date and o.amount_paid > 0 and o.status <> 'cancelled') end,
      'visits', (select count(distinct session) from public.site_events where name = 'visit' and day = d::date)) order by d)
    into v_series from generate_series(greatest(p_from, p_to - 89), p_to, interval '1 day') d;
  if not v_money then
    v_now := v_now - v_hidden;
    v_prev := v_prev - v_hidden;
  end if;
  return jsonb_build_object('current', v_now, 'previous', v_prev, 'series', coalesce(v_series, '[]'::jsonb), 'money_visible', v_money,
    'regions', (select coalesce(jsonb_agg(jsonb_build_object('region', region, 'orders', n) order by n desc), '[]'::jsonb) from
                 (select coalesce(region, 'Pickup') region, count(*) n from public.orders where amount_paid > 0 and status <> 'cancelled' and created_at >= p_from and created_at < p_to + 1 group by 1) x),
    'payment_methods', (select coalesce(jsonb_agg(jsonb_build_object('method', m, 'count', n) order by n desc), '[]'::jsonb) from
                 (select coalesce(method, provider::text) m, count(*) n from public.payments where status = 'success' and kind = 'checkout' and confirmed_at >= p_from and confirmed_at < p_to + 1 group by 1) x),
    'categories', (select coalesce(jsonb_agg(jsonb_build_object('category', c, 'units', u) order by u desc), '[]'::jsonb) from
                 (select coalesce(pc.name, cat.name) c, sum(i.qty)::int u from public.order_items i join public.orders o on o.id = i.order_id
                  join public.variants v on v.id = i.variant_id join public.products p on p.id = v.product_id join public.categories cat on cat.id = p.category_id
                  left join public.categories pc on pc.id = cat.parent_id
                  where o.amount_paid > 0 and o.status <> 'cancelled' and o.created_at >= p_from and o.created_at < p_to + 1 group by 1) x));
end $$;

-- Funnel split by device, source or region (FR-AN-002).
create or replace function public.funnel_report(p_from date, p_to date, p_split text default null) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.has_perm('analytics', 'view') or private.perm_scope('analytics') = 'own' then raise exception 'You cannot see the funnel' using errcode = '42501'; end if;
  if p_split not in ('device', 'utm_source', 'region') then p_split := null; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('segment', seg, 'steps', steps) order by seg) from (
    select seg, jsonb_build_array(
      jsonb_build_object('step', 'Visited', 'count', count(distinct session) filter (where name = 'page_view')),
      jsonb_build_object('step', 'Viewed a product', 'count', count(distinct session) filter (where name = 'view_item')),
      jsonb_build_object('step', 'Added to bag', 'count', count(distinct session) filter (where name = 'add_to_cart')),
      jsonb_build_object('step', 'Started checkout', 'count', count(distinct session) filter (where name = 'begin_checkout')),
      jsonb_build_object('step', 'Started payment', 'count', count(distinct session) filter (where name = 'add_payment_info')),
      jsonb_build_object('step', 'Paid', 'count', count(distinct session) filter (where name = 'purchase'))) steps
    from (select coalesce(case p_split when 'device' then device when 'utm_source' then utm_source when 'region' then region end, 'All') seg, session, name
          from public.events where day between p_from and p_to) e group by seg) t), '[]'::jsonb);
end $$;

-- Tracked source (UTM, referrer) next to the self-reported answer (FR-AN-003).
create or replace function public.source_report(p_from date, p_to date) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_money boolean := private.analytics_money();
begin
  if not private.has_perm('analytics', 'view') or private.perm_scope('analytics') = 'own' then raise exception 'You cannot see sources' using errcode = '42501'; end if;
  return jsonb_build_object(
    'self_reported', coalesce((select jsonb_agg(jsonb_build_object('source', s, 'orders', n, 'net_sales', case when v_money then amt end) order by n desc) from
      (select coalesce(source, 'Not given') s, count(*) n, sum(total) amt from public.orders where amount_paid > 0 and status <> 'cancelled' and created_at >= p_from and created_at < p_to + 1 group by 1) x), '[]'::jsonb),
    'tracked', coalesce((select jsonb_agg(jsonb_build_object('source', s, 'orders', n, 'net_sales', case when v_money then amt end) order by n desc) from
      (select coalesce(utm_source, case when referrer is not null then 'referral' end, 'direct') s, count(*) n, sum(total) amt from public.orders
       where amount_paid > 0 and status <> 'cancelled' and created_at >= p_from and created_at < p_to + 1 group by 1) x), '[]'::jsonb),
    'compare', coalesce((select jsonb_agg(jsonb_build_object('tracked', t, 'said', s, 'orders', n) order by n desc) from
      (select coalesce(utm_source, 'direct') t, coalesce(source, 'Not given') s, count(*) n from public.orders
       where amount_paid > 0 and status <> 'cancelled' and created_at >= p_from and created_at < p_to + 1 group by 1, 2) x), '[]'::jsonb),
    'cost_per_order', case when v_money then coalesce((select jsonb_agg(jsonb_build_object('campaign', e.campaign, 'spend', e.spend,
        'orders', (select count(*) from public.orders o where o.utm_campaign = e.campaign and o.amount_paid > 0 and o.created_at >= p_from and o.created_at < p_to + 1)))
      from (select campaign, sum(amount) spend from public.expenses where campaign is not null and spent_on between p_from and p_to group by campaign) e), '[]'::jsonb) end);
end $$;

-- Delivery report (FR-AN-004): stage times, on-time rate, failed deliveries by region and courier.
create or replace function public.delivery_report(p_from date, p_to date) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.has_perm('analytics', 'view') or private.perm_scope('analytics') = 'own' then raise exception 'You cannot see the delivery report' using errcode = '42501'; end if;
  return jsonb_build_object(
    'stages', (select jsonb_build_object(
        'placed_to_confirmed_h', round(avg(extract(epoch from (c.at - o.created_at)) / 3600)::numeric, 1),
        'confirmed_to_received_h', round(avg(extract(epoch from (r.at - c.at)) / 3600)::numeric, 1),
        'received_to_dispatched_h', round(avg(extract(epoch from (d.at - r.at)) / 3600)::numeric, 1),
        'dispatched_to_delivered_h', round(avg(extract(epoch from (o.delivered_at - d.at)) / 3600)::numeric, 1))
      from public.orders o
      left join lateral (select min(at) at from public.order_events where order_id = o.id and status = 'to_source') c on true
      left join lateral (select min(at) at from public.order_events where order_id = o.id and status = 'ready_to_pack') r on true
      left join lateral (select min(at) at from public.order_events where order_id = o.id and status = 'dispatched') d on true
      where o.created_at >= p_from and o.created_at < p_to + 1),
    'by_region', coalesce((select jsonb_agg(jsonb_build_object('region', region, 'delivered', d, 'on_time', ot, 'failed', f) order by d desc) from (
        select coalesce(o.region, 'Pickup') region, count(*) filter (where o.status = 'delivered') d,
          count(*) filter (where o.status = 'delivered' and o.delivered_at::date <= o.est_delivery_date) ot,
          count(*) filter (where exists (select 1 from public.order_events e where e.order_id = o.id and e.status = 'failed_delivery')) f
        from public.orders o where o.created_at >= p_from and o.created_at < p_to + 1 group by coalesce(o.region, 'Pickup')) x), '[]'::jsonb),
    'by_courier', coalesce((select jsonb_agg(jsonb_build_object('courier', c, 'delivered', d, 'on_time', ot, 'failed', f) order by d desc) from (
        select coalesce(o.courier, o.rider_name, 'Not recorded') c, count(*) filter (where o.status = 'delivered') d,
          count(*) filter (where o.status = 'delivered' and o.delivered_at::date <= o.est_delivery_date) ot,
          count(*) filter (where exists (select 1 from public.order_events e where e.order_id = o.id and e.status = 'failed_delivery')) f
        from public.orders o where o.created_at >= p_from and o.created_at < p_to + 1 and o.status in ('dispatched', 'out_for_delivery', 'delivered', 'failed_delivery') group by 1) x), '[]'::jsonb));
end $$;

-- Product and category report (FR-AN-005), searches with no results and most-searched words (FR-AN-009).
create or replace function public.product_report(p_from date, p_to date) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_money boolean := private.analytics_money();
  v_costs boolean := private.can_see_costs();
begin
  if not private.has_perm('analytics', 'view') or private.perm_scope('analytics') = 'own' then raise exception 'You cannot see the product report' using errcode = '42501'; end if;
  return jsonb_build_object(
    'products', coalesce((select jsonb_agg(x order by (x ->> 'units')::int desc, (x ->> 'views')::int desc) from (
      select jsonb_build_object('slug', p.slug, 'name', p.name,
        'views', (select count(distinct session) from public.events e where e.name = 'view_item' and e.params ->> 'product' = p.slug and e.day between p_from and p_to),
        'adds', (select count(distinct session) from public.events e where e.name = 'add_to_cart' and e.params ->> 'product' = p.slug and e.day between p_from and p_to),
        'wishlist', (select count(*) from public.wishlist_items w where w.product_id = p.id and w.created_at >= p_from and w.created_at < p_to + 1)
                    + (select count(*) from public.events e where e.name = 'add_to_wishlist' and e.params ->> 'product' = p.slug and e.day between p_from and p_to),
        'units', coalesce(s.units, 0), 'revenue', case when v_money then coalesce(s.revenue, 0) end,
        'margin', case when v_costs and coalesce(s.revenue, 0) > 0 then round((s.revenue - coalesce(s.cost, 0)) * 100 / s.revenue, 1) end) x
      from public.products p
      left join lateral (
        select sum(i.qty)::int units, sum(i.qty * i.unit_price) revenue,
          (select sum(c.agreed_cost) from public.supplier_order_items si join public.supplier_order_costs c on c.supplier_order_id = si.supplier_order_id
           join public.order_items i2 on i2.id = si.order_item_id join public.variants v2 on v2.id = i2.variant_id join public.orders o2 on o2.id = i2.order_id
           where v2.product_id = p.id and o2.created_at >= p_from and o2.created_at < p_to + 1) cost
        from public.order_items i join public.variants v on v.id = i.variant_id join public.orders o on o.id = i.order_id
        where v.product_id = p.id and o.amount_paid > 0 and o.status <> 'cancelled' and o.created_at >= p_from and o.created_at < p_to + 1) s on true
      where p.published or s.units > 0) t), '[]'::jsonb),
    'no_result_searches', coalesce((select jsonb_agg(jsonb_build_object('term', term, 'count', n) order by n desc) from (
      select lower(params ->> 'term') term, count(*) n from public.events where name = 'search' and (params ->> 'results')::int = 0 and day between p_from and p_to
      group by 1 order by 2 desc limit 20) x), '[]'::jsonb),
    'top_searches', coalesce((select jsonb_agg(jsonb_build_object('term', term, 'count', n) order by n desc) from (
      select lower(params ->> 'term') term, count(*) n from public.events where name = 'search' and day between p_from and p_to group by 1 order by 2 desc limit 20) x), '[]'::jsonb));
end $$;

-- Customer report (FR-AN-007) and cohorts (FR-AN-011).
create or replace function public.customer_report(p_from date, p_to date) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_money boolean := private.analytics_money();
begin
  if not private.has_perm('analytics', 'view') or private.perm_scope('analytics') = 'own' then raise exception 'You cannot see the customer report' using errcode = '42501'; end if;
  return jsonb_build_object(
    'average_ltv', case when v_money then (select round(avg(ltv), 2) from (select sum(amount_paid) ltv from public.orders where status <> 'cancelled' and amount_paid > 0 group by customer_id) x) end,
    'by_region', coalesce((select jsonb_agg(jsonb_build_object('region', r, 'customers', n) order by n desc) from
      (select coalesce(region, 'Unknown') r, count(*) n from public.customers where merged_into is null and erased_at is null group by 1) x), '[]'::jsonb),
    'top_customers', case when v_money then coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'name', c.full_name, 'orders', x.n, 'spend', x.spend) order by x.spend desc) from
      (select customer_id, count(*) n, sum(amount_paid) spend from public.orders where status <> 'cancelled' and amount_paid > 0 and created_at >= p_from and created_at < p_to + 1
       group by customer_id order by sum(amount_paid) desc limit 10) x join public.customers c on c.id = x.customer_id), '[]'::jsonb) end,
    'birthdays', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'name', full_name, 'day', extract(day from birthday)) order by extract(day from birthday)) from public.customers
      where birthday is not null and extract(month from birthday) = extract(month from current_date) and marketing_consent and merged_into is null), '[]'::jsonb),
    'cohorts', coalesce((select jsonb_agg(jsonb_build_object('cohort', cohort, 'size', size, 'months', months) order by cohort) from (
      select f.cohort, count(*) size,
        (select jsonb_agg(jsonb_build_object('m', m, 'repeat', (select count(distinct o.customer_id) from public.orders o join (select customer_id, min(date_trunc('month', created_at)) c from public.orders where amount_paid > 0 group by customer_id) ff on ff.customer_id = o.customer_id
             where ff.c = f.cohort and o.amount_paid > 0 and date_trunc('month', o.created_at) = f.cohort + make_interval(months => m))) order by m)
         from generate_series(1, 5) m) months
      from (select customer_id, min(date_trunc('month', created_at)) cohort from public.orders where amount_paid > 0 and status <> 'cancelled' group by customer_id) f
      where f.cohort >= date_trunc('month', p_to) - interval '11 months' group by f.cohort) x), '[]'::jsonb));
end $$;

-- Catalogue report (FR-CAT-010) and supplier performance (FR-CAT-011).
create or replace function public.catalogue_report(p_stale_days int default 7) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_costs boolean := private.can_see_costs();
begin
  if not private.has_perm('availability', 'view') then raise exception 'You cannot see the catalogue report' using errcode = '42501'; end if;
  return jsonb_build_object(
    'by_availability', (select jsonb_object_agg(availability, n) from (select v.availability, count(*) n from public.variants v join public.products p on p.id = v.product_id where not p.archived group by 1) x),
    'not_checked', (select count(*) from public.variants v join public.products p on p.id = v.product_id
                    where p.published and v.availability <> 'unavailable' and (v.last_checked_at is null or v.last_checked_at < now() - make_interval(days => p_stale_days))),
    'avg_lead_days', (select round(avg(lead_days), 1) from public.variants v join public.products p on p.id = v.product_id where p.published),
    'could_not_source', (select count(*) from public.order_items where sourcing = 'failed'),
    'margins', case when v_costs then coalesce((select jsonb_agg(jsonb_build_object('sku', v.sku, 'product', p.name, 'price', v.price, 'best_cost', c.cost,
        'margin', round((v.price - c.cost) * 100 / nullif(v.price, 0), 1)) order by (v.price - c.cost) / nullif(v.price, 0))
      from public.variants v join public.products p on p.id = v.product_id
      join lateral (select min(cost) cost from public.supplier_offers so where so.variant_id = v.id and so.available) c on c.cost is not null
      where p.published), '[]'::jsonb) end,
    'suppliers', coalesce((select jsonb_agg(jsonb_build_object('supplier', s.name, 'orders', x.n, 'received', x.rec, 'failed', x.fail, 'on_time', x.ontime,
        'on_time_rate', case when x.rec > 0 then round(x.ontime * 100.0 / x.rec) end, 'avg_days', x.days,
        'avg_cost_change', case when v_costs then (select round(avg(c2.agreed_cost - c1.agreed_cost), 2) from (
            select so1.id, c.agreed_cost, row_number() over (order by so1.ordered_at) rn from public.supplier_orders so1 join public.supplier_order_costs c on c.supplier_order_id = so1.id where so1.supplier_id = s.id) c1
          join (select so1.id, c.agreed_cost, row_number() over (order by so1.ordered_at) rn from public.supplier_orders so1 join public.supplier_order_costs c on c.supplier_order_id = so1.id where so1.supplier_id = s.id) c2 on c2.rn = c1.rn + 1) end) order by x.n desc)
      from public.suppliers s join lateral (
        select count(*) n, count(*) filter (where status = 'received') rec, count(*) filter (where status = 'failed') fail,
          count(*) filter (where status = 'received' and (expected_at is null or received_at::date <= expected_at)) ontime,
          round(avg(extract(epoch from (received_at - ordered_at)) / 86400)::numeric, 1) days
        from public.supplier_orders where supplier_id = s.id) x on x.n > 0), '[]'::jsonb));
end $$;

-- ---------------------------------------------------------------------------
-- Exports (FR-DATA-005 to 007): a job per export, a private file, a 24-hour link and the log
-- ---------------------------------------------------------------------------
alter table public.export_log drop constraint if exists export_log_kind_check;
alter table public.export_log add constraint export_log_kind_check check (kind in ('orders', 'customers', 'money', 'catalogue', 'suppliers', 'expenses', 'targets', 'reviews', 'subscribers', 'analytics', 'feedback'));
alter table public.export_log
  add column if not exists format text,
  add column if not exists filters jsonb;

create table public.export_jobs (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null default auth.uid() references public.staff (id) on delete cascade,
  kind text not null,
  format text not null check (format in ('csv', 'xlsx', 'pdf', 'json')),
  filters jsonb not null default '{}'::jsonb,
  status text not null default 'running' check (status in ('running', 'done', 'failed', 'expired')),
  row_count int,
  path text,
  error text,
  created_at timestamptz not null default now(),
  finished_at timestamptz,
  expires_at timestamptz
);
alter table public.export_jobs enable row level security;
create policy export_jobs_own on public.export_jobs for select to authenticated using (staff_id = auth.uid() or private.has_perm('audit', 'view'));
revoke all on public.export_jobs from anon, authenticated, public;
grant select on public.export_jobs to authenticated;

-- What the caller may export: the export right, the "Catalogue only" limit, and JSON for Admins only.
create or replace function public.start_export(p_kind text, p_format text, p_filters jsonb default '{}'::jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_limit text := (select rp.restriction from public.role_permissions rp where rp.role_id = private.my_role() and rp.module = 'exports');
  v_id uuid;
begin
  if not private.has_perm('exports', 'export') then raise exception 'You cannot export data' using errcode = '42501'; end if;
  if p_kind not in ('orders', 'customers', 'money', 'catalogue', 'suppliers', 'expenses', 'targets', 'reviews', 'subscribers', 'analytics', 'feedback') then raise exception 'Unknown export'; end if;
  if v_limit ilike 'catalogue%' and p_kind not in ('catalogue', 'suppliers') then raise exception 'Your role can export the catalogue only' using errcode = '42501'; end if;
  if p_format = 'json' and not private.has_perm('settings', 'edit') then raise exception 'JSON exports are for Admins' using errcode = '42501'; end if;
  if p_format not in ('csv', 'xlsx', 'pdf', 'json') then raise exception 'Choose CSV, Excel, PDF or JSON'; end if;
  if (select count(*) from public.export_jobs where staff_id = auth.uid() and created_at > now() - interval '1 hour') >= 30 then raise exception 'Too many exports in the last hour'; end if;
  insert into public.export_jobs (staff_id, kind, format, filters) values (auth.uid(), p_kind, p_format, coalesce(p_filters, '{}'::jsonb)) returning id into v_id;
  return v_id;
end $$;

create or replace function public.finish_export(p_job uuid, p_rows int, p_path text, p_error text default null) returns void
language plpgsql security definer set search_path = '' as $$
declare
  j public.export_jobs%rowtype;
begin
  select * into j from public.export_jobs where id = p_job and staff_id = auth.uid() for update;
  if not found or j.status <> 'running' then raise exception 'Export not found'; end if;
  if p_error is not null then
    update public.export_jobs set status = 'failed', error = left(p_error, 300), finished_at = now() where id = j.id;
    return;
  end if;
  if p_path is null or p_path not like auth.uid()::text || '/' || j.id::text || '.%' then raise exception 'That file does not belong to this export'; end if;
  update public.export_jobs set status = 'done', row_count = greatest(coalesce(p_rows, 0), 0), path = p_path, finished_at = now(), expires_at = now() + interval '24 hours' where id = j.id;
  insert into public.export_log (actor_id, actor_name, kind, row_count, format, filters) values (auth.uid(), private.staff_name(), j.kind, greatest(coalesce(p_rows, 0), 0), j.format, j.filters);
  perform private.alert_staff(auth.uid(), 'export', 'Your ' || j.kind || ' export is ready', coalesce(p_rows, 0) || ' rows · the link works for 24 hours', '/dashboard/exports', 'exp:' || j.id);
end $$;

-- ---------------------------------------------------------------------------
-- Checkout reminders (abandoned cart, only with consent)
-- ---------------------------------------------------------------------------
create table public.checkout_drafts (
  id uuid primary key default gen_random_uuid(),
  email text not null check (email ~ '^[^\s@]+@[^\s@]+\.[^\s@]{2,}$'),
  session text not null check (char_length(session) between 8 and 64),
  items jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  reminded_at timestamptz,
  unique (session)
);
alter table public.checkout_drafts enable row level security;
revoke all on public.checkout_drafts from anon, authenticated, public;

create or replace function public.save_checkout_draft(p_email text, p_session text, p_items jsonb, p_consent boolean) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not coalesce(p_consent, false) then
    delete from public.checkout_drafts where session = p_session;
    return;
  end if;
  if lower(btrim(coalesce(p_email, ''))) !~ '^[^\s@]+@[^\s@]+\.[^\s@]{2,}$' or char_length(coalesce(p_session, '')) not between 8 and 64 then return; end if;
  insert into public.checkout_drafts (email, session, items) values (lower(btrim(p_email)), p_session, case when jsonb_typeof(p_items) = 'array' then p_items else '[]'::jsonb end)
  on conflict (session) do update set email = excluded.email, items = excluded.items, created_at = now(), reminded_at = null;
end $$;

-- ---------------------------------------------------------------------------
-- Scheduled checks (run every 15 minutes by the cron route with the service role)
-- ---------------------------------------------------------------------------
create or replace function public.run_scheduled_checks() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  a jsonb := private.setting('alerts');
  v_confirm int := coalesce((a ->> 'confirm_hours')::int, 2);
  v_place int := coalesce((a ->> 'supplier_place_hours')::int, 24);
  v_dispatch int := coalesce((a ->> 'dispatch_hours')::int, 24);
  v_stale int := coalesce((a ->> 'stale_days')::int, 7);
  v_cutoff int := coalesce((a ->> 'report_cutoff_hour')::int, 18);
  v_pace numeric := coalesce((a ->> 'pace_threshold')::numeric, 0.7);
  v_fb int := coalesce((a ->> 'feedback_after_hours')::int, 24);
  v_ab int := coalesce((a ->> 'abandoned_after_hours')::int, 2);
  v_today text := to_char(current_date, 'YYYYMMDD');
  v_n jsonb := '{}'::jsonb;
  r record;
  v_count int;
  v_site text := '';
begin
  -- stuck orders (FR-ORD-007)
  v_count := 0;
  for r in select o.id, o.number, 'not confirmed after ' || v_confirm || ' hours' why from public.orders o
           where o.status = 'to_confirm'
             and (select max(confirmed_at) from public.payments p where p.order_id = o.id and p.status = 'success') < now() - make_interval(hours => v_confirm)
           union all
           select o.id, o.number, 'no supplier order ' || v_place || ' hours after payment' from public.orders o
           where o.status = 'to_source' and exists (select 1 from public.order_items i where i.order_id = o.id and i.sourcing in ('pending', 'failed'))
             and (select max(confirmed_at) from public.payments p where p.order_id = o.id and p.status = 'success') < now() - make_interval(hours => v_place)
           union all
           select o.id, o.number, 'not dispatched ' || v_dispatch || ' hours after it arrived' from public.orders o
           where o.status in ('ready_to_pack', 'packed') and (select max(at) from public.order_events e where e.order_id = o.id and e.status = 'ready_to_pack') < now() - make_interval(hours => v_dispatch)
           union all
           select o.id, o.number, 'not delivered by the estimated date' from public.orders o
           where o.status in ('to_source', 'ready_to_pack', 'packed', 'dispatched', 'out_for_delivery', 'failed_delivery') and o.est_delivery_date < current_date
  loop
    perform private.alert_route('stuck', 'Stuck order ' || r.number, initcap(left(r.why, 1)) || substr(r.why, 2), '/dashboard/orders/' || r.id, 'stuck:' || r.id || ':' || left(r.why, 12) || ':' || v_today);
    v_count := v_count + 1;
  end loop;
  v_n := v_n || jsonb_build_object('stuck', v_count);

  -- supplier late against the expected date
  for r in select so.id, so.order_id, o.number, s.name from public.supplier_orders so join public.orders o on o.id = so.order_id join public.suppliers s on s.id = so.supplier_id
           where so.status = 'ordered' and so.expected_at < current_date loop
    perform private.alert_route('supplier_late', 'Supplier late · ' || r.number, r.name || ' has not delivered by the expected date.', '/dashboard/orders/' || r.order_id, 'late:' || r.id || ':' || v_today);
  end loop;

  -- availability not checked for N days (FR-CAT-004), one alert a day
  select count(*) into v_count from public.variants v join public.products p on p.id = v.product_id
    where p.published and v.availability <> 'unavailable' and (v.last_checked_at is null or v.last_checked_at < now() - make_interval(days => v_stale));
  if v_count > 0 then
    perform private.alert_route('stale_availability', v_count || ' sizes not checked for ' || v_stale || ' days', 'Call the suppliers and confirm what they can supply.', '/dashboard/catalogue?stale=1', 'stale:' || v_today);
  end if;

  -- balances to collect today (dispatch)
  select count(*) into v_count from public.orders where balance_due > 0 and status in ('dispatched', 'out_for_delivery');
  if v_count > 0 then
    perform private.alert_route('balances_today', v_count || ' balances to collect on the road', 'Record each one before marking delivered.', '/dashboard/dispatch', 'bal:' || v_today);
  end if;

  -- rider cash collected yesterday and not handed in
  for r in select rd.id, rd.name, sum(p.amount) amt from public.payments p join public.riders rd on rd.id = p.collected_by_rider
           where p.provider = 'cash' and p.status = 'success' and p.confirmed_at::date = current_date - 1
             and not exists (select 1 from public.rider_cash_handovers h where h.rider_id = rd.id and h.day = current_date - 1)
           group by rd.id, rd.name loop
    perform private.alert_route('rider_cash', 'Rider cash not handed in · ' || r.name, 'GHS ' || r.amt || ' collected yesterday.', '/dashboard/money?tab=riders', 'rc:' || r.id || ':' || v_today);
  end loop;

  -- daily report missing after the cut-off (FR-TG-003, AC-13)
  if extract(hour from now()) >= v_cutoff and extract(isodow from current_date) < 7 then
    v_count := 0;
    for r in select s.id, s.full_name from public.staff s where s.active and s.employment_status = 'active'
             and not exists (select 1 from public.daily_reports d where d.staff_id = s.id and d.report_date = current_date) loop
      perform private.alert_staff(r.id, 'report_missing', 'Your daily report is missing', 'File it now from Staff and targets.', '/dashboard/staff', 'rm:' || v_today);
      v_count := v_count + 1;
    end loop;
    if v_count > 0 then
      perform private.alert_route('report_missing', v_count || ' daily reports missing today', null, '/dashboard/staff', 'rmall:' || v_today);
    end if;
  end if;

  -- pace alerts (FR-TG-007): below the threshold of expected pace by mid-period
  for r in select t as tt, private.target_value(t) actual, (current_date - t.period_start + 1)::numeric / (t.period_end - t.period_start + 1) elapsed
           from public.targets t where t.status = 'active' and t.metric::text <> 'on_time_deliveries' and current_date between t.period_start and t.period_end loop
    if r.elapsed >= 0.5 and r.actual < (r.tt).goal * r.elapsed * v_pace then
      perform private.alert_route('pace', 'Behind pace: ' || private.target_owner_label(r.tt) || ' · ' || replace((r.tt).metric::text, '_', ' '),
        round(r.actual) || ' of ' || round((r.tt).goal) || ' with ' || round(r.elapsed * 100) || '% of the period gone', '/dashboard/staff', 'pace:' || (r.tt).id);
      if (r.tt).staff_id is not null then
        perform private.alert_staff((r.tt).staff_id, 'pace', 'You are behind pace on a target', replace((r.tt).metric::text, '_', ' ') || ': ' || round(r.actual) || ' of ' || round((r.tt).goal), '/dashboard/staff', 'pace:' || (r.tt).id);
      end if;
    end if;
    if r.actual >= (r.tt).goal and (r.tt).staff_id is not null then
      perform private.alert_staff((r.tt).staff_id, 'target', 'Target reached', replace((r.tt).metric::text, '_', ' ') || ': ' || round(r.actual) || ' of ' || round((r.tt).goal), '/dashboard/staff', 'reached:' || (r.tt).id);
    end if;
  end loop;

  -- budgets past 80% (FR-FIN-010)
  for r in select x ->> 'label' label, (x ->> 'pct')::int pct from jsonb_array_elements(
             (select coalesce(jsonb_agg(jsonb_build_object('label', private.expense_label(b.category), 'pct',
                round(((select coalesce(sum(amount), 0) from public.expenses e where e.category = b.category and e.spent_on >= date_trunc('month', current_date))) * 100 / b.amount))), '[]'::jsonb)
              from public.budgets b where b.month is null or b.month = date_trunc('month', current_date)::date)) x loop
    if r.pct >= 80 then
      perform private.alert_route('budget', 'Budget ' || r.pct || '% used · ' || r.label, null, '/dashboard/money', 'bud:' || r.label || ':' || to_char(current_date, 'YYYYMM') || ':' || case when r.pct >= 100 then 'over' else '80' end);
    end if;
  end loop;

  -- customers: delivery feedback request, drop reminders, abandoned checkouts
  for r in select o.id, o.number, c.email, c.full_name from public.orders o join public.customers c on c.id = o.customer_id
           where o.status = 'delivered' and o.delivered_at < now() - make_interval(hours => v_fb) and o.delivered_at > now() - interval '7 days'
             and c.email is not null and not exists (select 1 from public.order_feedback f where f.order_id = o.id) loop
    perform private.queue_message('email', 'feedback_request', r.email, jsonb_build_object('number', r.number, 'name', r.full_name), r.id, 'fb:' || r.id);
  end loop;
  for r in select sa.id, sa.email, p.name, p.slug from public.stock_alerts sa join public.products p on p.id = sa.product_id
           where sa.kind = 'drop' and sa.notified_at is null and p.published and p.release_at <= now() loop
    perform private.queue_message('email', 'drop_open', r.email, jsonb_build_object('product', r.name, 'slug', r.slug), null, 'drop:' || r.id);
    update public.stock_alerts set notified_at = now() where id = r.id;
  end loop;
  for r in select d.id, d.email from public.checkout_drafts d where d.reminded_at is null and d.created_at < now() - make_interval(hours => v_ab) and d.created_at > now() - interval '3 days'
           and not exists (select 1 from public.orders o join public.customers c on c.id = o.customer_id where lower(c.email) = d.email and o.created_at > d.created_at) loop
    perform private.queue_message('email', 'abandoned_cart', r.email, '{}'::jsonb, null, 'ab:' || r.id, true);
    update public.checkout_drafts set reminded_at = now() where id = r.id;
  end loop;

  -- Drip School digest to subscribers on Mondays (P1), with one-click unsubscribe
  if extract(isodow from current_date) = 1 and extract(hour from now()) >= 9
     and exists (select 1 from public.articles where status = 'published' and publish_at > now() - interval '7 days' and publish_at <= now()) then
    for r in select s.email, s.token from public.newsletter_subscribers s where s.unsubscribed_at is null loop
      perform private.queue_message('email', 'digest', r.email, jsonb_build_object('token', r.token, 'articles',
        (select jsonb_agg(jsonb_build_object('title', title, 'slug', slug)) from public.articles where status = 'published' and publish_at > now() - interval '7 days' and publish_at <= now())),
        null, 'digest:' || to_char(current_date, 'IYYYIW') || ':' || r.email, true);
    end loop;
  end if;

  -- scheduled report emails: daily summary to the Owner (after 20:00), weekly report to Admins (Monday after 08:00)
  if extract(hour from now()) >= 20 then
    for r in select s.email from public.staff s join public.roles ro on ro.id = s.role_id
             where s.active and ro.key in (select jsonb_array_elements_text(coalesce(private.setting('reports') -> 'daily_summary_to', '[]'::jsonb))) loop
      perform private.queue_message('email', 'daily_summary', r.email, jsonb_build_object('date', to_char(current_date, 'DD Mon YYYY'),
        'orders', (select count(*) from public.orders where created_at::date = current_date and amount_paid > 0 and status <> 'cancelled'),
        'sales', (select coalesce(sum(total), 0) from public.orders where created_at::date = current_date and amount_paid > 0 and status <> 'cancelled'),
        'cash', (select coalesce(sum(amount), 0) from public.payments where status = 'success' and kind in ('checkout', 'balance') and confirmed_at::date = current_date),
        'owed', (select coalesce(sum(balance_due), 0) from public.orders where payment_state = 'part_paid' and status <> 'cancelled'),
        'stuck', (v_n ->> 'stuck')), null, 'daily:' || v_today || ':' || r.email);
    end loop;
  end if;
  if extract(isodow from current_date) = 1 and extract(hour from now()) >= 8 then
    for r in select s.email from public.staff s join public.roles ro on ro.id = s.role_id
             where s.active and ro.key in (select jsonb_array_elements_text(coalesce(private.setting('reports') -> 'weekly_report_to', '[]'::jsonb))) loop
      perform private.queue_message('email', 'weekly_report', r.email, jsonb_build_object('date', to_char(current_date - 7, 'DD Mon'),
        'orders', (select count(*) from public.orders where created_at >= current_date - 7 and created_at < current_date and amount_paid > 0 and status <> 'cancelled'),
        'sales', (select coalesce(sum(total), 0) from public.orders where created_at >= current_date - 7 and created_at < current_date and amount_paid > 0 and status <> 'cancelled'),
        'delivered', (select count(*) from public.orders where delivered_at >= current_date - 7 and delivered_at < current_date),
        'on_time', (select case when count(*) > 0 then round(count(*) filter (where delivered_at::date <= est_delivery_date) * 100.0 / count(*)) || '%' else 'n/a' end
                    from public.orders where delivered_at >= current_date - 7 and delivered_at < current_date),
        'reports', (select count(*) from public.daily_reports where report_date >= current_date - 7 and report_date < current_date)), null, 'weekly:' || v_today || ':' || r.email);
    end loop;
    -- each person's weekly summary (FR-TG-004)
    for r in select s.id, s.email, s.full_name from public.staff s where s.active and s.employment_status = 'active'
             and exists (select 1 from public.targets t where t.owner_kind = 'person' and t.staff_id = s.id and t.period_end >= current_date - 7) loop
      perform private.queue_message('email', 'weekly_summary', r.email, (select jsonb_build_object('date', to_char(current_date - 7, 'DD Mon'), 'name', r.full_name,
          'score', coalesce((x ->> 'score'), 'n/a'), 'last', coalesce((x ->> 'previous'), 'n/a'),
          'wins', (select count(*) from jsonb_array_elements(x -> 'targets') t where (t ->> 'actual')::numeric >= (t ->> 'goal')::numeric),
          'misses', (select count(*) from jsonb_array_elements(x -> 'targets') t where (t ->> 'actual')::numeric < (t ->> 'goal')::numeric))
        from (select private.weekly_card(r.id, (current_date - 7 - (extract(isodow from current_date)::int - 1))::date) x) y), null, 'ws:' || v_today || ':' || r.id);
    end loop;
  end if;

  -- exports expire after 24 hours (the app deletes the files)
  update public.export_jobs set status = 'expired' where status = 'done' and expires_at < now();

  -- retention (FR-DATA-010): keep daily counts, trim raw events and old message logs
  insert into public.events_daily (day, name, count)
    select day, name, count(*) from public.events where day < (current_date - make_interval(months => coalesce((private.setting('retention') ->> 'events_aggregate_months')::int, 24)))::date group by 1, 2
    on conflict (day, name) do update set count = public.events_daily.count + excluded.count;
  delete from public.events where day < (current_date - make_interval(months => coalesce((private.setting('retention') ->> 'events_aggregate_months')::int, 24)))::date;
  delete from public.notifications where created_at < now() - make_interval(months => coalesce((private.setting('retention') ->> 'logs_months')::int, 12)) and status in ('sent', 'failed', 'skipped');
  delete from public.staff_alerts where created_at < now() - make_interval(months => coalesce((private.setting('retention') ->> 'logs_months')::int, 12));

  return v_n;
end $$;

-- The scorecard without the caller check, for the scheduled job.
create or replace function private.weekly_card(p_staff uuid, p_week_start date) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'score', (select round(sum(t.weight * least(private.target_value(t) / t.goal, 1.5)) * 100 / nullif(sum(t.weight), 0), 1)
              from public.targets t where t.owner_kind = 'person' and t.staff_id = p_staff and t.status <> 'paused' and t.period_start <= p_week_start + 6 and t.period_end >= p_week_start),
    'previous', (select round(sum(t.weight * least(private.target_value(t) / t.goal, 1.5)) * 100 / nullif(sum(t.weight), 0), 1)
              from public.targets t where t.owner_kind = 'person' and t.staff_id = p_staff and t.status <> 'paused' and t.period_start <= p_week_start - 1 and t.period_end >= p_week_start - 7),
    'targets', coalesce((select jsonb_agg(jsonb_build_object('goal', t.goal, 'actual', private.target_value(t))) from public.targets t
              where t.owner_kind = 'person' and t.staff_id = p_staff and t.period_start <= p_week_start + 6 and t.period_end >= p_week_start), '[]'::jsonb))
$$;

-- The sender claims only the channels it can send right now, so emails wait (instead of failing) while no provider is set up.
create or replace function public.claim_messages(p_limit int, p_channels text[]) returns setof public.notifications
language sql security definer set search_path = '' as $$
  update public.notifications n set status = 'sending', attempts = n.attempts + 1, claimed_at = now()
  where n.id in (
    select id from public.notifications
    where (status = 'queued' or (status = 'sending' and claimed_at < now() - interval '10 minutes')) and attempts < 5 and channel = any (p_channels)
    order by created_at limit greatest(1, least(p_limit, 100)) for update skip locked)
  returning n.*
$$;
revoke execute on function public.claim_messages(int, text[]) from public, anon, authenticated;
grant execute on function public.claim_messages(int, text[]) to service_role;

-- The sender needs the staff list for message templates; finishing a message can now be "skipped" (channel not set up).
create or replace function public.finish_notification(p_id bigint, p_ok boolean, p_error text default null) returns void
language sql security definer set search_path = '' as $$
  update public.notifications set
    status = case when p_ok then 'sent'::public.notification_status when p_error = 'skipped' then 'skipped'::public.notification_status
                  when attempts >= 5 then 'failed'::public.notification_status else 'queued'::public.notification_status end,
    sent_at = case when p_ok then now() end, last_error = case when p_ok then null else left(p_error, 300) end
  where id = p_id
$$;

-- ---------------------------------------------------------------------------
-- Function access
-- ---------------------------------------------------------------------------
revoke execute on function public.restore_version(bigint), public.article_preview(uuid), public.track_article(text, text, text, text, int, int),
  public.article_metrics(date, date), public.send_site_feedback(text, text, int, text), public.track_events(jsonb), public.kpi_report(date, date),
  public.funnel_report(date, date, text), public.source_report(date, date), public.delivery_report(date, date), public.product_report(date, date),
  public.customer_report(date, date), public.catalogue_report(int), public.start_export(text, text, jsonb), public.finish_export(uuid, int, text, text),
  public.save_checkout_draft(text, text, jsonb, boolean), public.run_scheduled_checks(), public.finish_notification(bigint, boolean, text)
from public, anon, authenticated;
grant execute on function public.article_preview(uuid), public.track_article(text, text, text, text, int, int), public.send_site_feedback(text, text, int, text),
  public.track_events(jsonb), public.save_checkout_draft(text, text, jsonb, boolean) to anon, authenticated;
grant execute on function public.restore_version(bigint), public.article_metrics(date, date), public.kpi_report(date, date), public.funnel_report(date, date, text),
  public.source_report(date, date), public.delivery_report(date, date), public.product_report(date, date), public.customer_report(date, date),
  public.catalogue_report(int), public.start_export(text, text, jsonb), public.finish_export(uuid, int, text, text) to authenticated;
grant execute on function public.run_scheduled_checks(), public.finish_notification(bigint, boolean, text) to service_role;
revoke execute on all functions in schema private from public, anon;
grant execute on all functions in schema private to authenticated;

-- Buckets: public media for the shop, private exports (each person's own folder).
do $$
begin
  if to_regclass('storage.buckets') is not null then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('media', 'media', true, 8388608, array['image/jpeg', 'image/png', 'image/webp', 'image/avif', 'image/gif', 'video/mp4'])
    on conflict (id) do nothing;
    insert into storage.buckets (id, name, public, file_size_limit)
    values ('exports', 'exports', false, 52428800)
    on conflict (id) do nothing;
    drop policy if exists media_upload on storage.objects;
    create policy media_upload on storage.objects for insert to authenticated
      with check (bucket_id = 'media' and (private.has_perm('content', 'create') or private.has_perm('products', 'edit')));
    drop policy if exists media_remove on storage.objects;
    create policy media_remove on storage.objects for delete to authenticated using (bucket_id = 'media' and private.has_perm('content', 'delete'));
    drop policy if exists exports_own_write on storage.objects;
    create policy exports_own_write on storage.objects for insert to authenticated
      with check (bucket_id = 'exports' and (storage.foldername(name))[1] = auth.uid()::text and private.has_perm('exports', 'export'));
    drop policy if exists exports_own_read on storage.objects;
    create policy exports_own_read on storage.objects for select to authenticated
      using (bucket_id = 'exports' and (storage.foldername(name))[1] = auth.uid()::text);
  end if;
end $$;
