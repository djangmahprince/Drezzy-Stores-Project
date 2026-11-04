-- Customer accounts and shop features (PRD sections 8, 9, 10 and 11).
--   * My Drezzy: a profile, an address book, a server-side wishlist, notification settings, rewards and referrals.
--   * Sale prices with a start and end, limited drops with a release time and a cap per customer, and coupons.
--   * Reviews from verified buyers (moderated), a post-delivery rating, and "notify me" for unavailable sizes and drops.
--   * A support inbox linked to orders, a newsletter with one-click unsubscribe, and a data rights request queue.
--
-- As before, shoppers never write order or money tables directly. Everything they can do goes through narrow functions
-- that check who they are (a signed-in account, or an order number plus the phone used at checkout).

-- ---------------------------------------------------------------------------
-- Customers (the CRM record, one per phone number)
-- ---------------------------------------------------------------------------
alter table public.customers alter column phone drop not null; -- an erased customer keeps their orders but loses the number
alter table public.customers
  add column if not exists tags text[] not null default '{}',
  add column if not exists region text,
  add column if not exists birthday date,
  add column if not exists marketing_consent boolean not null default false,
  add column if not exists consent_at timestamptz,
  add column if not exists updates_whatsapp boolean not null default false,
  add column if not exists updates_sms boolean not null default false,
  add column if not exists momo_number text,
  add column if not exists merged_into uuid references public.customers (id) on delete set null,
  add column if not exists erased_at timestamptz;
create index if not exists customers_auth_idx on public.customers (auth_user_id);
create index if not exists customers_email_idx on public.customers (lower(email));

-- ---------------------------------------------------------------------------
-- Catalogue additions: sale windows, drops, product media and notes, archive status
-- ---------------------------------------------------------------------------
alter table public.variants
  add column if not exists sale_price numeric(10, 2) check (sale_price is null or sale_price >= 0),
  add column if not exists sale_starts_at timestamptz,
  add column if not exists sale_ends_at timestamptz;
alter table public.variants add constraint variants_sale_window check (sale_ends_at is null or sale_starts_at is null or sale_ends_at > sale_starts_at);
alter table public.variants add constraint variants_sale_below_price check (sale_price is null or sale_price < price);

alter table public.products
  add column if not exists archived boolean not null default false,
  add column if not exists release_at timestamptz,
  add column if not exists cap_per_customer int check (cap_per_customer between 1 and 20),
  add column if not exists video_url text check (video_url is null or video_url ~ '^https://'),
  add column if not exists material text,
  add column if not exists care_notes text,
  add column if not exists delivery_notes text,
  add column if not exists seo_title text check (char_length(seo_title) <= 70),
  add column if not exists seo_description text check (char_length(seo_description) <= 170),
  add column if not exists family text check (char_length(family) <= 60);
alter table public.products add constraint products_archived_unpublished check (not (archived and published));

-- the price a shopper pays right now: the sale price inside its window, otherwise the normal price
create or replace function private.effective_price(p_price numeric, p_sale numeric, p_from timestamptz, p_to timestamptz)
returns numeric language sql stable as $$
  select case when p_sale is not null and (p_from is null or p_from <= now()) and (p_to is null or p_to > now()) then p_sale else p_price end
$$;

grant select (archived, release_at, cap_per_customer, video_url, material, care_notes, delivery_notes, seo_title, seo_description, family) on public.products to anon;
grant select (sale_price, sale_starts_at, sale_ends_at) on public.variants to anon;

-- price and sale changes need "products: edit" (availability staff cannot reprice through the sale columns)
create or replace function private.guard_variants() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then
    return coalesce(new, old);
  end if;
  if tg_op = 'INSERT' then
    if not private.has_perm('products', 'create') then
      raise exception 'You cannot add products or variants' using errcode = '42501';
    end if;
    return new;
  end if;
  if tg_op = 'DELETE' then
    if not private.has_perm('products', 'delete') then
      raise exception 'You cannot delete variants' using errcode = '42501';
    end if;
    return old;
  end if;
  if (new.product_id, new.style, new.colour, new.size, new.sku, new.price, new.compare_at, new.sale_price, new.sale_starts_at, new.sale_ends_at)
     is distinct from (old.product_id, old.style, old.colour, old.size, old.sku, old.price, old.compare_at, old.sale_price, old.sale_starts_at, old.sale_ends_at)
     and not private.has_perm('products', 'edit') then
    raise exception 'You cannot change prices or product details' using errcode = '42501';
  end if;
  if (new.availability, new.lead_days, new.preferred_supplier_id, new.last_checked_at)
     is distinct from (old.availability, old.lead_days, old.preferred_supplier_id, old.last_checked_at)
     and not private.has_perm('availability', 'edit') then
    raise exception 'You cannot change availability' using errcode = '42501';
  end if;
  return new;
end $$;

-- ---------------------------------------------------------------------------
-- My Drezzy profile (one per shopper login)
-- ---------------------------------------------------------------------------
create table public.customer_profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  full_name text check (char_length(full_name) <= 100),
  phone text check (phone is null or phone ~ '^\+233[0-9]{9}$'),
  birthday date,
  gender text check (gender in ('female', 'male', 'other', 'prefer_not')),
  shoe_size_eu text check (char_length(shoe_size_eu) <= 6),
  clothing_size text check (clothing_size in ('XS', 'S', 'M', 'L', 'XL', 'XXL', '3XL')),
  style_tags text[] not null default '{}',
  style_profile jsonb,
  notify_email boolean not null default true,
  notify_sms boolean not null default false,
  notify_whatsapp boolean not null default false,
  -- order updates cannot be switched off (FR-ACC-008), so only the optional topics are stored
  topics text[] not null default '{}' check (topics <@ array['drops', 'drip_school', 'offers']::text[]),
  marketing_consent_at timestamptz,
  momo_number text check (momo_number is null or momo_number ~ '^\+233[0-9]{9}$'),
  referral_code text unique check (referral_code ~ '^[A-Z0-9]{6,12}$'),
  referred_by_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger customer_profiles_touch before update on public.customer_profiles for each row execute function private.touch_updated_at();

create table public.addresses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  label text not null default 'Home' check (label in ('Home', 'Work', 'Receiver', 'Other')),
  receiver_name text check (char_length(receiver_name) <= 100),
  receiver_phone text check (receiver_phone is null or receiver_phone ~ '^\+233[0-9]{9}$'),
  country text not null default 'Ghana',
  region text not null check (char_length(region) between 2 and 60),
  city text not null check (char_length(city) between 1 and 80),
  area text check (char_length(area) <= 80),
  street text not null check (char_length(street) between 1 and 160),
  landmark text check (char_length(landmark) <= 160),
  gps_code text check (gps_code is null or gps_code ~ '^[A-Z]{2}-?[0-9]{3,4}-?[0-9]{3,5}$'),
  lat numeric(9, 6),
  lng numeric(9, 6),
  is_default boolean not null default false,
  created_at timestamptz not null default now()
);
create index addresses_user_idx on public.addresses (user_id);
create unique index addresses_one_default on public.addresses (user_id) where is_default;

create table public.wishlist_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  product_id uuid not null references public.products (id) on delete cascade,
  size text,
  notify_available boolean not null default true,
  notify_price boolean not null default true,
  price_at_add numeric(10, 2),
  created_at timestamptz not null default now(),
  unique (user_id, product_id)
);

-- "Notify me" for an unavailable size or an upcoming drop. Guests leave an email; no account needed.
create table public.stock_alerts (
  id uuid primary key default gen_random_uuid(),
  email text not null check (email ~ '^[^\s@]+@[^\s@]+\.[^\s@]{2,}$'),
  product_id uuid not null references public.products (id) on delete cascade,
  size text,
  kind text not null default 'restock' check (kind in ('restock', 'drop')),
  created_at timestamptz not null default now(),
  notified_at timestamptz
);
create unique index stock_alerts_once on public.stock_alerts (lower(email), product_id, coalesce(size, ''), kind) where notified_at is null;

-- ---------------------------------------------------------------------------
-- Reviews (verified buyers, moderated) and post-delivery ratings
-- ---------------------------------------------------------------------------
create type public.review_status as enum ('pending', 'approved', 'hidden');

create table public.reviews (
  id uuid primary key default gen_random_uuid(),
  product_id uuid references public.products (id) on delete cascade,
  customer_id uuid references public.customers (id) on delete set null,
  order_id uuid references public.orders (id) on delete set null,
  rating int not null check (rating between 1 and 5),
  title text check (char_length(title) <= 80),
  body text not null check (char_length(btrim(body)) between 3 and 1500),
  photos text[] not null default '{}',
  display_name text not null check (char_length(display_name) between 1 and 60),
  city text check (char_length(city) <= 60),
  -- reviews from the Instagram highlight are published only with the customer's agreement (PRD FR-SF-013)
  consent boolean not null default false,
  source text not null default 'web' check (source in ('web', 'instagram', 'whatsapp', 'staff')),
  verified boolean not null default false,
  status public.review_status not null default 'pending',
  moderated_by uuid references auth.users (id) on delete set null,
  moderated_at timestamptz,
  created_at timestamptz not null default now()
);
create index reviews_product_idx on public.reviews (product_id, status);
create unique index reviews_once_per_order_product on public.reviews (order_id, product_id) where order_id is not null;

create table public.order_feedback (
  order_id uuid primary key references public.orders (id) on delete cascade,
  rating int not null check (rating between 1 and 5),
  comment text check (char_length(comment) <= 1000),
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Coupons
-- ---------------------------------------------------------------------------
create table public.coupons (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[A-Z0-9_-]{3,24}$'),
  description text,
  kind text not null check (kind in ('percent', 'amount')),
  value numeric(10, 2) not null check (value > 0),
  min_spend numeric(10, 2) not null default 0 check (min_spend >= 0),
  max_discount numeric(10, 2) check (max_discount is null or max_discount > 0),
  starts_at timestamptz,
  ends_at timestamptz,
  max_uses int check (max_uses is null or max_uses > 0),
  max_per_customer int not null default 1 check (max_per_customer > 0),
  active boolean not null default true,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  check (kind <> 'percent' or value <= 90),
  check (ends_at is null or starts_at is null or ends_at > starts_at)
);

create table public.coupon_redemptions (
  id uuid primary key default gen_random_uuid(),
  coupon_id uuid not null references public.coupons (id) on delete restrict,
  order_id uuid not null unique references public.orders (id) on delete cascade,
  customer_id uuid not null references public.customers (id),
  amount numeric(12, 2) not null check (amount >= 0),
  created_at timestamptz not null default now()
);
create index coupon_redemptions_coupon_idx on public.coupon_redemptions (coupon_id);

-- ---------------------------------------------------------------------------
-- Loyalty points and referrals
-- ---------------------------------------------------------------------------
create table public.loyalty_entries (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  points int not null,
  reason text not null,
  order_id uuid references public.orders (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (order_id, reason)
);
create index loyalty_user_idx on public.loyalty_entries (user_id);

-- ---------------------------------------------------------------------------
-- Data rights requests (Ghana Data Protection Act, PRD FR-ACC-011)
-- ---------------------------------------------------------------------------
create table public.data_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users (id) on delete set null,
  email text,
  phone text,
  kind text not null check (kind in ('access', 'correct', 'delete', 'withdraw_consent')),
  details text check (char_length(details) <= 1000),
  status text not null default 'open' check (status in ('open', 'done', 'refused')),
  due_at timestamptz not null default now() + interval '30 days',
  handled_by uuid references auth.users (id) on delete set null,
  handled_by_name text,
  response text,
  handled_at timestamptz,
  created_at timestamptz not null default now(),
  check (user_id is not null or email is not null or phone is not null)
);

-- ---------------------------------------------------------------------------
-- Newsletter (marketing: always with consent and one-click unsubscribe)
-- ---------------------------------------------------------------------------
create table public.newsletter_subscribers (
  id uuid primary key default gen_random_uuid(),
  email text not null check (email ~ '^[^\s@]+@[^\s@]+\.[^\s@]{2,}$'),
  placement text check (char_length(placement) <= 40),
  token uuid not null default gen_random_uuid() unique,
  consent_at timestamptz not null default now(),
  unsubscribed_at timestamptz,
  created_at timestamptz not null default now()
);
create unique index newsletter_email_unique on public.newsletter_subscribers (lower(email));

-- ---------------------------------------------------------------------------
-- Support inbox (PRD FR-DB-009, FR-ORD-014): customers write from their account or the tracking page
-- ---------------------------------------------------------------------------
create table public.support_threads (
  id uuid primary key default gen_random_uuid(),
  order_id uuid references public.orders (id) on delete set null,
  customer_id uuid references public.customers (id) on delete set null,
  user_id uuid references auth.users (id) on delete set null,
  subject text not null check (char_length(subject) between 2 and 120),
  status text not null default 'open' check (status in ('open', 'waiting', 'closed')),
  assigned_to uuid references auth.users (id) on delete set null,
  complaint boolean not null default false,
  created_at timestamptz not null default now(),
  last_message_at timestamptz not null default now(),
  first_reply_at timestamptz
);
create index support_threads_status_idx on public.support_threads (status, last_message_at desc);

create table public.support_messages (
  id bigint generated always as identity primary key,
  thread_id uuid not null references public.support_threads (id) on delete cascade,
  from_staff boolean not null,
  author_id uuid references auth.users (id) on delete set null,
  author_name text not null,
  body text not null check (char_length(btrim(body)) between 1 and 2000),
  at timestamptz not null default now()
);
create index support_messages_thread_idx on public.support_messages (thread_id, at);

-- ---------------------------------------------------------------------------
-- Shop the Look (PRD FR-SF-011, FR-JR-004)
-- ---------------------------------------------------------------------------
create table public.looks (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  title text not null check (char_length(title) between 3 and 100),
  intro text check (char_length(intro) <= 600),
  occasion text check (char_length(occasion) <= 40),
  image text,
  tone text not null default 'navy' check (tone in ('navy', 'grey', 'blue', 'red', 'charcoal')),
  -- [{ "slug": "nike-dunk", "style": "Low", "alternatives": ["new-balance-2000"] }]
  items jsonb not null default '[]'::jsonb check (jsonb_typeof(items) = 'array'),
  published boolean not null default false,
  sort int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger looks_touch before update on public.looks for each row execute function private.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Notifications: more channels and kinds, one-per-event dedupe, and messages that are not about an order
-- ---------------------------------------------------------------------------
alter table public.notifications drop constraint if exists notifications_channel_check;
alter table public.notifications add constraint notifications_channel_check check (channel in ('email', 'sms', 'whatsapp'));
alter table public.notifications
  add column if not exists dedupe_key text,
  add column if not exists marketing boolean not null default false;
create unique index if not exists notifications_dedupe on public.notifications (dedupe_key) where dedupe_key is not null;

-- Queue a message. Internal. Duplicates by key are ignored, so a trigger firing twice sends once.
create or replace function private.queue_message(p_channel text, p_template text, p_to text, p_payload jsonb, p_order uuid default null,
  p_dedupe text default null, p_marketing boolean default false) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if p_to is null or btrim(p_to) = '' then return; end if;
  insert into public.notifications (order_id, channel, template, to_address, payload, dedupe_key, marketing)
  values (p_order, p_channel, p_template, p_to, coalesce(p_payload, '{}'::jsonb), p_dedupe, p_marketing)
  on conflict do nothing;
end $$;

-- Order updates go by email, and by WhatsApp or SMS when the customer said yes at checkout (sent only once a provider is set up).
create or replace function private.queue_order_email() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  o public.orders%rowtype;
  c public.customers%rowtype;
  v_payload jsonb;
  v_template text;
begin
  if new.public_note is null or new.kind not in ('placed', 'payment', 'status', 'supplier') then return new; end if;
  select * into o from public.orders where id = new.order_id;
  select * into c from public.customers where id = o.customer_id;
  v_template := case when new.kind = 'placed' then 'order_placed' else 'order_update' end;
  v_payload := jsonb_build_object('number', o.number, 'name', c.full_name, 'headline', new.public_note, 'status', new.status,
    'total', o.total, 'paid', o.amount_paid, 'balance', o.balance_due, 'phone', c.phone,
    'rider_name', o.rider_name, 'rider_phone', o.rider_phone, 'courier', o.courier, 'tracking', o.tracking_number,
    'est', o.est_delivery_date, 'delivery_code', case when new.status = 'out_for_delivery' then o.delivery_code end);
  perform private.queue_message('email', v_template, c.email, v_payload, o.id, 'ev:' || new.id || ':email');
  if c.updates_whatsapp then perform private.queue_message('whatsapp', v_template, c.phone, v_payload, o.id, 'ev:' || new.id || ':wa'); end if;
  if c.updates_sms then perform private.queue_message('sms', v_template, c.phone, v_payload, o.id, 'ev:' || new.id || ':sms'); end if;
  return new;
end $$;

-- ---------------------------------------------------------------------------
-- Orders: attribution, coupon, delivery code, rider, proof of delivery
-- ---------------------------------------------------------------------------
alter table public.orders
  add column if not exists coupon_code text,
  add column if not exists landmark text,
  add column if not exists lat numeric(9, 6),
  add column if not exists lng numeric(9, 6),
  add column if not exists utm_source text check (char_length(utm_source) <= 60),
  add column if not exists utm_medium text check (char_length(utm_medium) <= 60),
  add column if not exists utm_campaign text check (char_length(utm_campaign) <= 80),
  add column if not exists referrer text check (char_length(referrer) <= 200),
  add column if not exists session_id text check (char_length(session_id) <= 64),
  add column if not exists article_slug text check (char_length(article_slug) <= 80),
  add column if not exists device text check (device in ('mobile', 'tablet', 'desktop')),
  add column if not exists delivery_code text,
  add column if not exists proof_path text,
  add column if not exists delivered_at timestamptz,
  add column if not exists sourcing_outcome text check (sourcing_outcome in ('alternative_offered', 'alternative_accepted', 'refund')),
  add column if not exists alternative_note text;

create or replace function private.guard_orders() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null and current_user not in ('anon', 'authenticated') then
    return coalesce(new, old); -- migrations and the service role
  end if;
  if coalesce(current_setting('app.via_rpc', true), '') = '1' then
    return coalesce(new, old);
  end if;
  if tg_op = 'INSERT' or tg_op = 'DELETE' then
    raise exception 'Orders are created and removed through the order functions only' using errcode = '42501';
  end if;
  if (new.number, new.customer_id, new.channel, new.status, new.payment_state, new.payment_plan, new.currency, new.subtotal,
      new.delivery_fee, new.discount, new.discount_reason, new.total, new.amount_paid, new.balance_due, new.created_by,
      new.coupon_code, new.delivery_code, new.delivered_at, new.sourcing_outcome, new.assigned_agent_id, new.proof_path)
     is distinct from
     (old.number, old.customer_id, old.channel, old.status, old.payment_state, old.payment_plan, old.currency, old.subtotal,
      old.delivery_fee, old.discount, old.discount_reason, old.total, old.amount_paid, old.balance_due, old.created_by,
      old.coupon_code, old.delivery_code, old.delivered_at, old.sourcing_outcome, old.assigned_agent_id, old.proof_path) then
    raise exception 'Status and money can only be changed with the order actions' using errcode = '42501';
  end if;
  return new;
end $$;

-- What a coupon takes off a subtotal for this customer, or an error message. Shared by the cart preview and place_order.
create or replace function private.coupon_discount(p_code text, p_subtotal numeric, p_phone text, out discount numeric, out coupon_id uuid, out problem text)
language plpgsql stable security definer set search_path = '' as $$
declare
  c public.coupons%rowtype;
  v_used int;
  v_mine int;
begin
  discount := 0;
  select * into c from public.coupons where code = upper(btrim(coalesce(p_code, '')));
  if not found or not c.active then problem := 'That code is not valid'; return; end if;
  if c.starts_at is not null and c.starts_at > now() then problem := 'That code is not active yet'; return; end if;
  if c.ends_at is not null and c.ends_at <= now() then problem := 'That code has expired'; return; end if;
  if p_subtotal < c.min_spend then problem := 'Spend at least GHS ' || c.min_spend::text || ' to use this code'; return; end if;
  select count(*) into v_used from public.coupon_redemptions r join public.orders o on o.id = r.order_id where r.coupon_id = c.id and o.status <> 'cancelled';
  if c.max_uses is not null and v_used >= c.max_uses then problem := 'That code has been fully used'; return; end if;
  if p_phone is not null then
    select count(*) into v_mine from public.coupon_redemptions r join public.orders o on o.id = r.order_id join public.customers cu on cu.id = r.customer_id
      where r.coupon_id = c.id and cu.phone = p_phone and o.status <> 'cancelled';
    if v_mine >= c.max_per_customer then problem := 'You have already used this code'; return; end if;
  end if;
  discount := case when c.kind = 'percent' then round(p_subtotal * c.value / 100, 2) else c.value end;
  if c.max_discount is not null then discount := least(discount, c.max_discount); end if;
  discount := least(discount, p_subtotal);
  coupon_id := c.id;
end $$;

-- For the bag: what would this code take off? Never reveals anything about other customers.
create or replace function public.check_coupon(p_code text, p_subtotal numeric, p_phone text default null) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  r record;
begin
  select * into r from private.coupon_discount(p_code, greatest(coalesce(p_subtotal, 0), 0), private.norm_phone(p_phone));
  if r.problem is not null then return jsonb_build_object('ok', false, 'message', r.problem); end if;
  return jsonb_build_object('ok', true, 'code', upper(btrim(p_code)), 'discount', r.discount);
end $$;

-- ---------------------------------------------------------------------------
-- place_order, now with sale prices, drops, coupons, attribution and consents
-- ---------------------------------------------------------------------------
create or replace function public.place_order(p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_channel public.order_channel := coalesce(nullif(p ->> 'channel', ''), 'web')::public.order_channel;
  v_staff boolean := auth.uid() is not null and private.has_perm('orders', 'create');
  v_phone text := private.norm_phone(p #>> '{customer,phone}');
  v_name text := btrim(coalesce(p #>> '{customer,name}', ''));
  v_email text := lower(nullif(btrim(coalesce(p #>> '{customer,email}', '')), ''));
  v_method public.delivery_method := coalesce(nullif(p #>> '{delivery,method}', ''), 'home')::public.delivery_method;
  v_region text := case when coalesce(nullif(p #>> '{delivery,method}', ''), 'home') = 'pickup'
                        then coalesce(nullif(p #>> '{delivery,branch_region}', ''), 'Greater Accra') else btrim(coalesce(p #>> '{delivery,region}', '')) end;
  v_plan public.payment_plan := coalesce(nullif(p ->> 'plan', ''), 'full')::public.payment_plan;
  v_zone public.delivery_zones%rowtype;
  v_cust uuid;
  v_order uuid;
  v_number text;
  v_it jsonb;
  v_items jsonb := '[]'::jsonb;
  v_rec record;
  v_qty int;
  v_price numeric(12, 2);
  v_subtotal numeric(12, 2) := 0;
  v_lead int := 0;
  v_fee numeric(12, 2);
  v_discount numeric(12, 2) := 0;
  v_coupon record;
  v_coupon_code text := upper(nullif(btrim(coalesce(p ->> 'coupon', '')), ''));
  v_reasons text[] := '{}';
  v_total numeric(12, 2);
  v_due numeric(12, 2);
  v_method_pay text := coalesce(nullif(p ->> 'pay_method', ''), 'mtn');
  v_provider public.payment_provider;
  v_ref text;
  v_unpaid int;
  v_bought int;
  v_source text := nullif(btrim(coalesce(p ->> 'source', '')), '');
  v_shopper uuid := case when auth.uid() is not null and not exists (select 1 from public.staff where id = auth.uid()) then auth.uid() end;
  v_confirmed_email text;
  v_gps text := upper(nullif(btrim(coalesce(p #>> '{delivery,gps}', '')), ''));
  v_est date;
begin
  if v_channel <> 'web' and not v_staff then
    raise exception 'Only staff can create orders for other channels' using errcode = '42501';
  end if;
  if v_name = '' or char_length(v_name) < 2 then raise exception 'Enter your full name'; end if;
  if v_phone is null then raise exception 'Enter a valid Ghana phone number'; end if;
  if v_email is not null and v_email !~ '^[^\s@]+@[^\s@]+\.[^\s@]{2,}$' then raise exception 'Enter a valid email address'; end if;
  if v_channel = 'web' and v_source is null then raise exception 'Please tell us how you got to know Drezzy'; end if;
  if v_gps is not null and v_gps !~ '^[A-Z]{2}-?[0-9]{3,4}-?[0-9]{3,5}$' then raise exception 'That Ghana Post GPS address does not look right (for example GA-123-4567)'; end if;
  if jsonb_typeof(p -> 'items') is distinct from 'array' or jsonb_array_length(p -> 'items') not between 1 and 20 then
    raise exception 'Add between 1 and 20 items';
  end if;

  select * into v_zone from public.delivery_zones where region = v_region and active;
  if not found then raise exception 'We do not deliver to that region yet'; end if;
  if v_method = 'home' and (btrim(coalesce(p #>> '{delivery,city}', '')) = '' or btrim(coalesce(p #>> '{delivery,street}', '')) = '') then
    raise exception 'Add the city and a street or landmark for delivery';
  end if;

  -- items: priced from the catalogue (sale price inside its window), never from the request
  for v_it in select * from jsonb_array_elements(p -> 'items') loop
    v_qty := coalesce((v_it ->> 'qty')::int, 0);
    if v_qty not between 1 and 10 then raise exception 'Quantity must be between 1 and 10'; end if;
    select v.id, v.price, v.sale_price, v.sale_starts_at, v.sale_ends_at, v.availability, v.lead_days, v.sku, v.style, v.colour, v.size,
           pr.id as product_id, pr.name, pr.published, pr.release_at, pr.cap_per_customer
      into v_rec
      from public.variants v join public.products pr on pr.id = v.product_id
      where v.id = (v_it ->> 'variant_id')::uuid;
    if not found or not v_rec.published then raise exception 'An item in your bag is no longer available'; end if;
    if v_rec.availability = 'unavailable' then raise exception '% (%) is unavailable right now', v_rec.name, v_rec.size; end if;
    if v_rec.release_at is not null and v_rec.release_at > now() then
      raise exception '% drops on %. Press Notify me and we will tell you when it opens', v_rec.name, to_char(v_rec.release_at, 'DD Mon at HH24:MI');
    end if;
    if v_rec.cap_per_customer is not null then
      select coalesce(sum(i.qty), 0) into v_bought from public.order_items i join public.orders o on o.id = i.order_id
        join public.variants vv on vv.id = i.variant_id join public.customers c on c.id = o.customer_id
        where vv.product_id = v_rec.product_id and c.phone = v_phone and o.status <> 'cancelled';
      v_bought := v_bought + (select coalesce(sum((x ->> 'qty')::int), 0) from jsonb_array_elements(v_items) x where (x ->> 'product_id')::uuid = v_rec.product_id);
      if v_bought + v_qty > v_rec.cap_per_customer then
        raise exception '% is limited to % per customer', v_rec.name, v_rec.cap_per_customer;
      end if;
    end if;
    v_price := private.effective_price(v_rec.price, v_rec.sale_price, v_rec.sale_starts_at, v_rec.sale_ends_at);
    v_subtotal := v_subtotal + v_price * v_qty;
    v_lead := greatest(v_lead, v_rec.lead_days);
    v_items := v_items || jsonb_build_array(jsonb_build_object(
      'variant_id', v_rec.id, 'product_id', v_rec.product_id, 'product_name', v_rec.name, 'sku', v_rec.sku, 'qty', v_qty, 'unit_price', v_price,
      'variant_label', btrim(concat_ws(' · ', v_rec.style, v_rec.colour, case when v_rec.size <> 'One size' then 'Size ' || v_rec.size end))));
  end loop;

  -- totals: the delivery fee is part of what is paid at checkout, unless the zone is "fee paid to the courier on arrival"
  v_fee := case when v_method = 'pickup' or v_zone.fee_on_arrival then 0 else v_zone.fee end;
  if v_coupon_code is not null then
    select * into v_coupon from private.coupon_discount(v_coupon_code, v_subtotal, v_phone);
    if v_coupon.problem is not null then raise exception '%', v_coupon.problem; end if;
    v_discount := v_coupon.discount;
    v_reasons := array_append(v_reasons, 'Coupon ' || v_coupon_code);
  end if;
  if v_staff and coalesce((p #>> '{discount,amount}')::numeric, 0) > 0 then
    if btrim(coalesce(p #>> '{discount,reason}', '')) = '' then raise exception 'A discount needs a reason'; end if;
    v_discount := v_discount + (p #>> '{discount,amount}')::numeric;
    v_reasons := array_append(v_reasons, btrim(p #>> '{discount,reason}'));
  end if;
  if v_discount > v_subtotal then raise exception 'The discount cannot be more than the items'; end if;
  v_total := v_subtotal + v_fee - v_discount;

  -- payment plan: half now, half on delivery is for zones that allow it (DEFAULT: Accra and Accra pickup only)
  if v_plan = 'half' and not v_zone.half_payment_allowed then
    raise exception 'Outside Accra, orders are paid in full at checkout';
  end if;
  v_due := case when v_plan = 'half' then ceil(v_total * 100 / 2) / 100 else v_total end;

  if v_channel = 'web' then
    select count(*) into v_unpaid from public.orders o join public.customers c on c.id = o.customer_id
      where c.phone = v_phone and o.status = 'awaiting_payment' and o.created_at > now() - interval '1 hour';
    if v_unpaid >= 5 then raise exception 'You have several unpaid orders. Please complete one, or contact us on WhatsApp'; end if;
  end if;

  insert into public.customers (full_name, phone, email, source, region, marketing_consent, consent_at, updates_whatsapp, updates_sms, momo_number)
  values (v_name, v_phone, v_email, v_source, case when v_method = 'home' then v_region end,
          coalesce((p #>> '{consents,marketing}')::boolean, false), case when coalesce((p #>> '{consents,marketing}')::boolean, false) then now() end,
          coalesce((p #>> '{consents,whatsapp}')::boolean, false), coalesce((p #>> '{consents,sms}')::boolean, false),
          case when coalesce((p #>> '{consents,save_momo}')::boolean, false) then private.norm_phone(p #>> '{consents,momo_number}') end)
    on conflict (phone) do update set
      email = coalesce(public.customers.email, excluded.email),
      source = coalesce(public.customers.source, excluded.source),
      region = coalesce(excluded.region, public.customers.region),
      marketing_consent = public.customers.marketing_consent or excluded.marketing_consent,
      consent_at = coalesce(public.customers.consent_at, excluded.consent_at),
      updates_whatsapp = public.customers.updates_whatsapp or excluded.updates_whatsapp,
      updates_sms = public.customers.updates_sms or excluded.updates_sms,
      momo_number = coalesce(excluded.momo_number, public.customers.momo_number)
    returning id into v_cust;

  -- a signed-in shopper whose confirmed email matches the order gets the order in My Drezzy straight away
  if v_shopper is not null and v_email is not null then
    select lower(u.email) into v_confirmed_email from auth.users u where u.id = v_shopper and u.email_confirmed_at is not null;
    if v_confirmed_email = v_email then
      update public.customers set auth_user_id = v_shopper where id = v_cust and auth_user_id is null;
    end if;
    if coalesce((p #>> '{consents,save_momo}')::boolean, false) then
      update public.customer_profiles set momo_number = private.norm_phone(p #>> '{consents,momo_number}') where user_id = v_shopper;
    end if;
  end if;

  v_est := (now() + make_interval(days => v_lead + v_zone.est_days))::date;
  v_number := 'DRZ-' || nextval('public.order_number_seq');
  perform set_config('app.via_rpc', '1', true);
  insert into public.orders (
    number, customer_id, channel, branch, status, payment_state, payment_plan, subtotal, delivery_fee, discount, discount_reason, total,
    amount_paid, balance_due, delivery_method, receiver_name, receiver_phone, region, city, area, street, landmark, gps_code, lat, lng, rider_note,
    source, source_detail, assigned_agent_id, agent_name, created_by, est_delivery_date, coupon_code,
    utm_source, utm_medium, utm_campaign, referrer, session_id, article_slug, device, delivery_code)
  values (
    v_number, v_cust, v_channel, v_zone.branch, 'awaiting_payment', 'unpaid', v_plan, v_subtotal, v_fee, v_discount,
    nullif(array_to_string(v_reasons, '; '), ''), v_total,
    0, v_total, v_method, nullif(btrim(coalesce(p #>> '{receiver,name}', '')), ''), private.norm_phone(p #>> '{receiver,phone}'),
    case when v_method = 'home' then v_region end, nullif(btrim(coalesce(p #>> '{delivery,city}', '')), ''), nullif(btrim(coalesce(p #>> '{delivery,area}', '')), ''),
    nullif(btrim(coalesce(p #>> '{delivery,street}', '')), ''), nullif(btrim(coalesce(p #>> '{delivery,landmark}', '')), ''), v_gps,
    nullif(p #>> '{delivery,lat}', '')::numeric, nullif(p #>> '{delivery,lng}', '')::numeric, nullif(btrim(coalesce(p #>> '{delivery,note}', '')), ''),
    v_source, nullif(btrim(coalesce(p ->> 'source_detail', '')), ''), case when v_staff then auth.uid() end, case when v_staff then private.staff_name() end, auth.uid(),
    v_est, v_coupon_code,
    left(nullif(p #>> '{attribution,utm_source}', ''), 60), left(nullif(p #>> '{attribution,utm_medium}', ''), 60), left(nullif(p #>> '{attribution,utm_campaign}', ''), 80),
    left(nullif(p #>> '{attribution,referrer}', ''), 200), left(nullif(p #>> '{attribution,session}', ''), 64), left(nullif(p #>> '{attribution,article}', ''), 80),
    case when p #>> '{attribution,device}' in ('mobile', 'tablet', 'desktop') then p #>> '{attribution,device}' end,
    lpad((floor(random() * 10000))::int::text, 4, '0'))
  returning id into v_order;

  insert into public.order_items (order_id, variant_id, product_name, variant_label, sku, qty, unit_price)
  select v_order, (i ->> 'variant_id')::uuid, i ->> 'product_name', i ->> 'variant_label', i ->> 'sku', (i ->> 'qty')::int, (i ->> 'unit_price')::numeric
  from jsonb_array_elements(v_items) i;

  if v_coupon_code is not null then
    insert into public.coupon_redemptions (coupon_id, order_id, customer_id, amount) values (v_coupon.coupon_id, v_order, v_cust, v_coupon.discount);
  end if;

  v_provider := case when v_method_pay = 'manual_momo' then 'manual_momo'::public.payment_provider else 'paystack'::public.payment_provider end;
  v_ref := v_number || '-' || substr(md5(random()::text || clock_timestamp()::text), 1, 8);
  insert into public.payments (order_id, kind, provider, method, reference, amount, status)
  values (v_order, 'checkout', v_provider, v_method_pay, v_ref, v_due, 'pending');

  perform private.log_event(v_order, 'placed', 'awaiting_payment', 'Order placed', case when v_staff then 'Created by staff from ' || v_channel::text end);
  perform set_config('app.via_rpc', '', true);

  return jsonb_build_object(
    'order_id', v_order, 'number', v_number, 'subtotal', v_subtotal, 'delivery_fee', v_fee, 'discount', v_discount,
    'total', v_total, 'due_now', v_due, 'balance_due', v_total - v_due,
    'payment_reference', v_ref, 'provider', v_provider, 'est_delivery_date', v_est, 'fee_on_arrival', v_zone.fee_on_arrival);
end $$;

-- ---------------------------------------------------------------------------
-- track_order: adds the delivery code once the order is on its way, the items to review, and any rating already given
-- ---------------------------------------------------------------------------
create or replace function public.track_order(p_number text, p_phone text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_phone text := private.norm_phone(p_phone);
  o public.orders%rowtype;
begin
  if v_phone is null or p_number is null then return null; end if;
  select ord.* into o from public.orders ord join public.customers c on c.id = ord.customer_id
    where ord.number = upper(btrim(p_number)) and c.phone = v_phone;
  if not found then return null; end if;

  return jsonb_build_object(
    'number', o.number, 'placed_at', o.created_at, 'status', o.status, 'payment_state', o.payment_state, 'plan', o.payment_plan,
    'subtotal', o.subtotal, 'delivery_fee', o.delivery_fee, 'discount', o.discount,
    'total', o.total, 'amount_paid', o.amount_paid, 'balance_due', o.balance_due, 'est_delivery_date', o.est_delivery_date,
    'delivery_method', o.delivery_method, 'region', o.region, 'city', o.city, 'area', o.area,
    'receiver_name', coalesce(o.receiver_name, (select full_name from public.customers where id = o.customer_id)),
    'courier', o.courier, 'tracking_number', o.tracking_number, 'rider_name', o.rider_name, 'rider_phone', o.rider_phone, 'branch', o.branch,
    'delivery_code', case when o.status in ('dispatched', 'out_for_delivery') then o.delivery_code end,
    'sourcing_outcome', o.sourcing_outcome, 'alternative_note', o.alternative_note,
    'feedback', (select f.rating from public.order_feedback f where f.order_id = o.id),
    'items', coalesce((select jsonb_agg(jsonb_build_object('name', i.product_name, 'detail', i.variant_label, 'qty', i.qty, 'price', i.unit_price,
        'slug', (select pr.slug from public.variants v join public.products pr on pr.id = v.product_id where v.id = i.variant_id),
        'reviewed', exists (select 1 from public.reviews r join public.variants v on v.product_id = r.product_id where r.order_id = o.id and v.id = i.variant_id)) order by i.id)
      from public.order_items i where i.order_id = o.id), '[]'::jsonb),
    'events', coalesce((select jsonb_agg(jsonb_build_object('kind', e.kind, 'status', e.status, 'at', e.at, 'note', e.public_note, 'by', split_part(coalesce(e.actor_name, ''), ' ', 1)) order by e.at, e.id)
                        from public.order_events e where e.order_id = o.id and e.public_note is not null), '[]'::jsonb),
    'payments', coalesce((select jsonb_agg(jsonb_build_object('kind', pm.kind, 'method', pm.method, 'amount', pm.amount, 'at', pm.confirmed_at) order by pm.confirmed_at)
                          from public.payments pm where pm.order_id = o.id and pm.status = 'success'), '[]'::jsonb));
end $$;

-- ---------------------------------------------------------------------------
-- Shopper functions
-- ---------------------------------------------------------------------------
-- The caller's order, found by number and phone (guests) or by their signed-in account. Internal helper.
create or replace function private.find_my_order(p_number text, p_phone text) returns public.orders
language plpgsql stable security definer set search_path = '' as $$
declare
  o public.orders%rowtype;
begin
  select ord.* into o from public.orders ord join public.customers c on c.id = ord.customer_id
    where ord.number = upper(btrim(coalesce(p_number, '')))
      and ((private.norm_phone(p_phone) is not null and c.phone = private.norm_phone(p_phone)) or (auth.uid() is not null and c.auth_user_id = auth.uid()));
  return o;
end $$;

-- A unique, readable referral code for a new profile.
create or replace function private.new_referral_code(p_name text) returns text
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_base text := upper(left(regexp_replace(coalesce(p_name, 'DRZ'), '[^A-Za-z]', '', 'g') || 'DRZ', 4));
  v_code text;
begin
  loop
    v_code := v_base || lpad((floor(random() * 10000))::int::text, 4, '0');
    exit when not exists (select 1 from public.customer_profiles where referral_code = v_code);
  end loop;
  return v_code;
end $$;

-- My Drezzy: the signed-in shopper's profile, created on first visit. Staff logins are not shoppers.
create or replace function public.my_profile() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  pr public.customer_profiles%rowtype;
  v_meta jsonb;
begin
  if v_uid is null then raise exception 'Sign in first' using errcode = '42501'; end if;
  if exists (select 1 from public.staff where id = v_uid) then raise exception 'Staff logins do not have a shopper profile' using errcode = '42501'; end if;
  select * into pr from public.customer_profiles where user_id = v_uid;
  if not found then
    select coalesce(u.raw_user_meta_data, '{}'::jsonb) into v_meta from auth.users u where u.id = v_uid;
    insert into public.customer_profiles (user_id, full_name, referral_code, referred_by_code)
    values (v_uid, nullif(v_meta ->> 'full_name', ''), private.new_referral_code(v_meta ->> 'full_name'),
            nullif(upper(btrim(coalesce(v_meta ->> 'ref', ''))), ''))
    on conflict (user_id) do nothing;
    select * into pr from public.customer_profiles where user_id = v_uid;
  end if;
  return to_jsonb(pr) || jsonb_build_object(
    'email', (select u.email from auth.users u where u.id = v_uid),
    'points', coalesce((select sum(points) from public.loyalty_entries where user_id = v_uid), 0));
end $$;

create or replace function public.save_my_profile(p jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_phone text := private.norm_phone(p ->> 'phone');
  v_marketing boolean := coalesce((p ->> 'marketing')::boolean, false);
begin
  if v_uid is null then raise exception 'Sign in first' using errcode = '42501'; end if;
  perform public.my_profile(); -- makes sure the row exists
  if nullif(p ->> 'phone', '') is not null and v_phone is null then raise exception 'Enter a valid Ghana phone number'; end if;
  update public.customer_profiles set
    full_name = nullif(btrim(coalesce(p ->> 'full_name', '')), ''),
    phone = v_phone,
    birthday = nullif(p ->> 'birthday', '')::date,
    gender = nullif(p ->> 'gender', ''),
    shoe_size_eu = nullif(btrim(coalesce(p ->> 'shoe_size_eu', '')), ''),
    clothing_size = nullif(p ->> 'clothing_size', ''),
    style_tags = coalesce(array(select jsonb_array_elements_text(coalesce(p -> 'style_tags', '[]'::jsonb)) limit 12), '{}'),
    notify_email = coalesce((p ->> 'notify_email')::boolean, true),
    notify_sms = coalesce((p ->> 'notify_sms')::boolean, false),
    notify_whatsapp = coalesce((p ->> 'notify_whatsapp')::boolean, false),
    topics = coalesce(array(select t from jsonb_array_elements_text(coalesce(p -> 'topics', '[]'::jsonb)) t where t in ('drops', 'drip_school', 'offers')), '{}'),
    marketing_consent_at = case when v_marketing then coalesce(marketing_consent_at, now()) else null end
  where user_id = v_uid;
  -- the shopper's choices reach the order records they own
  update public.customers set
    updates_whatsapp = coalesce((p ->> 'notify_whatsapp')::boolean, false),
    updates_sms = coalesce((p ->> 'notify_sms')::boolean, false),
    marketing_consent = v_marketing, consent_at = case when v_marketing then coalesce(consent_at, now()) end,
    birthday = coalesce(nullif(p ->> 'birthday', '')::date, birthday)
  where auth_user_id = v_uid;
end $$;

-- The style quiz result (FR-JR-009): saved sizes and taste.
create or replace function public.save_style_profile(p jsonb) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'Sign in first' using errcode = '42501'; end if;
  perform public.my_profile();
  update public.customer_profiles set
    style_profile = p,
    style_tags = coalesce(array(select jsonb_array_elements_text(coalesce(p -> 'tags', '[]'::jsonb)) limit 12), style_tags),
    shoe_size_eu = coalesce(nullif(p ->> 'shoe_size', ''), shoe_size_eu),
    clothing_size = coalesce(nullif(p ->> 'clothing_size', ''), clothing_size)
  where user_id = auth.uid();
end $$;

-- Everything Drezzy holds about the signed-in shopper, for "download my data" (FR-ACC-011).
create or replace function public.my_data_export() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'Sign in first' using errcode = '42501'; end if;
  insert into public.data_requests (user_id, kind, status, details, handled_at, response)
    values (v_uid, 'access', 'done', 'Downloaded from My Drezzy', now(), 'Self-service download');
  return jsonb_build_object(
    'exported_at', now(),
    'account', (select jsonb_build_object('email', u.email, 'created_at', u.created_at) from auth.users u where u.id = v_uid),
    'profile', (select to_jsonb(pr) - 'user_id' from public.customer_profiles pr where pr.user_id = v_uid),
    'addresses', coalesce((select jsonb_agg(to_jsonb(a) - 'user_id') from public.addresses a where a.user_id = v_uid), '[]'::jsonb),
    'customer_records', coalesce((select jsonb_agg(jsonb_build_object('name', c.full_name, 'phone', c.phone, 'email', c.email, 'source', c.source,
        'marketing_consent', c.marketing_consent, 'created_at', c.created_at)) from public.customers c where c.auth_user_id = v_uid), '[]'::jsonb),
    'orders', public.my_orders(),
    'wishlist', coalesce((select jsonb_agg(jsonb_build_object('product', p.name, 'size', w.size, 'added', w.created_at)) from public.wishlist_items w join public.products p on p.id = w.product_id where w.user_id = v_uid), '[]'::jsonb),
    'reviews', coalesce((select jsonb_agg(jsonb_build_object('rating', r.rating, 'body', r.body, 'at', r.created_at)) from public.reviews r join public.customers c on c.id = r.customer_id where c.auth_user_id = v_uid), '[]'::jsonb),
    'points', coalesce((select jsonb_agg(jsonb_build_object('points', l.points, 'reason', l.reason, 'at', l.created_at)) from public.loyalty_entries l where l.user_id = v_uid), '[]'::jsonb),
    'support', coalesce((select jsonb_agg(jsonb_build_object('subject', t.subject, 'messages', (select jsonb_agg(jsonb_build_object('from', m.author_name, 'body', m.body, 'at', m.at) order by m.at) from public.support_messages m where m.thread_id = t.id)))
        from public.support_threads t where t.user_id = v_uid), '[]'::jsonb));
end $$;

-- Ask for a correction, deletion or withdrawal of consent. Signed in, or by email and phone from the privacy page.
create or replace function public.request_data_action(p_kind text, p_details text, p_email text default null, p_phone text default null) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
  v_recent int;
begin
  if p_kind not in ('access', 'correct', 'delete', 'withdraw_consent') then raise exception 'Choose what you would like us to do'; end if;
  if auth.uid() is null and (nullif(btrim(coalesce(p_email, '')), '') is null and private.norm_phone(p_phone) is null) then
    raise exception 'Enter the email or phone number you used with us';
  end if;
  select count(*) into v_recent from public.data_requests where created_at > now() - interval '1 day'
    and (user_id = auth.uid() or lower(email) = lower(btrim(p_email)) or phone = private.norm_phone(p_phone));
  if v_recent >= 5 then raise exception 'We already have your requests. We will reply within 30 days'; end if;
  insert into public.data_requests (user_id, email, phone, kind, details)
  values (auth.uid(), lower(nullif(btrim(coalesce(p_email, '')), '')), private.norm_phone(p_phone), p_kind, left(nullif(btrim(coalesce(p_details, '')), ''), 1000))
  returning id into v_id;
  -- withdrawing marketing consent takes effect at once for a signed-in shopper
  if p_kind = 'withdraw_consent' and auth.uid() is not null then
    update public.customer_profiles set marketing_consent_at = null, topics = '{}' where user_id = auth.uid();
    update public.customers set marketing_consent = false, consent_at = null where auth_user_id = auth.uid();
    update public.newsletter_subscribers set unsubscribed_at = now() where lower(email) = (select lower(email) from auth.users where id = auth.uid()) and unsubscribed_at is null;
  end if;
  return v_id;
end $$;

-- Wishlist: add or remove for the signed-in shopper (guests keep theirs on the device).
create or replace function public.wishlist_toggle(p_product uuid, p_size text default null, p_on boolean default true) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_price numeric;
begin
  if auth.uid() is null then raise exception 'Sign in first' using errcode = '42501'; end if;
  if not p_on then
    delete from public.wishlist_items where user_id = auth.uid() and product_id = p_product;
    return;
  end if;
  select min(private.effective_price(v.price, v.sale_price, v.sale_starts_at, v.sale_ends_at)) into v_price
    from public.variants v join public.products p on p.id = v.product_id where p.id = p_product and p.published;
  if v_price is null then raise exception 'That product is not available'; end if;
  if (select count(*) from public.wishlist_items where user_id = auth.uid()) >= 200 then raise exception 'Your wishlist is full'; end if;
  insert into public.wishlist_items (user_id, product_id, size, price_at_add) values (auth.uid(), p_product, nullif(p_size, ''), v_price)
  on conflict (user_id, product_id) do update set size = coalesce(excluded.size, public.wishlist_items.size);
end $$;

-- "Notify me": restock of a size, or the opening of a drop.
create or replace function public.request_stock_alert(p_email text, p_product uuid, p_size text default null, p_kind text default 'restock') returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_email text := lower(btrim(coalesce(p_email, '')));
begin
  if v_email !~ '^[^\s@]+@[^\s@]+\.[^\s@]{2,}$' then raise exception 'Enter a valid email address'; end if;
  if p_kind not in ('restock', 'drop') then raise exception 'Unknown alert'; end if;
  if not exists (select 1 from public.products where id = p_product and published) then raise exception 'That product is not available'; end if;
  if (select count(*) from public.stock_alerts where lower(email) = v_email and notified_at is null) >= 30 then raise exception 'You already have many alerts waiting'; end if;
  insert into public.stock_alerts (email, product_id, size, kind) values (v_email, p_product, nullif(btrim(coalesce(p_size, '')), ''), p_kind)
  on conflict do nothing;
end $$;

-- A verified buyer reviews a product from a delivered order (signed in, or by order number and phone).
create or replace function public.submit_review(p jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  o public.orders%rowtype;
  v_product uuid;
  v_id uuid;
  c public.customers%rowtype;
  v_rating int := (p ->> 'rating')::int;
begin
  o := private.find_my_order(p ->> 'number', p ->> 'phone');
  if o.id is null then raise exception 'We could not find that order'; end if;
  if o.status <> 'delivered' then raise exception 'You can review once your order is delivered'; end if;
  select pr.id into v_product from public.products pr where pr.slug = p ->> 'product';
  if v_product is null or not exists (select 1 from public.order_items i join public.variants v on v.id = i.variant_id where i.order_id = o.id and v.product_id = v_product) then
    raise exception 'That product is not on this order';
  end if;
  if v_rating is null or v_rating not between 1 and 5 then raise exception 'Choose a rating from 1 to 5'; end if;
  if char_length(btrim(coalesce(p ->> 'body', ''))) < 3 then raise exception 'Write a few words about it'; end if;
  select * into c from public.customers where id = o.customer_id;
  insert into public.reviews (product_id, customer_id, order_id, rating, title, body, photos, display_name, city, consent, source, verified)
  values (v_product, c.id, o.id, v_rating, nullif(left(btrim(coalesce(p ->> 'title', '')), 80), ''), left(btrim(p ->> 'body'), 1500),
    coalesce(array(select x from jsonb_array_elements_text(coalesce(p -> 'photos', '[]'::jsonb)) x where x ~ '^[0-9a-f-]{36}/[A-Za-z0-9._-]{1,80}$' limit 4), '{}'),
    coalesce(nullif(left(btrim(coalesce(p ->> 'display_name', '')), 60), ''), split_part(c.full_name, ' ', 1)),
    coalesce(o.city, o.region), coalesce((p ->> 'consent')::boolean, false), 'web', true)
  returning id into v_id;
  return v_id;
exception when unique_violation then
  raise exception 'You have already reviewed this item';
end $$;

-- How did the delivery go? (post-delivery rating, KPI "Customer satisfaction")
create or replace function public.submit_feedback(p_number text, p_phone text, p_rating int, p_comment text default null) returns void
language plpgsql security definer set search_path = '' as $$
declare
  o public.orders%rowtype;
begin
  o := private.find_my_order(p_number, p_phone);
  if o.id is null then raise exception 'We could not find that order'; end if;
  if o.status <> 'delivered' then raise exception 'You can rate the order once it is delivered'; end if;
  if p_rating is null or p_rating not between 1 and 5 then raise exception 'Choose a rating from 1 to 5'; end if;
  insert into public.order_feedback (order_id, rating, comment) values (o.id, p_rating, left(nullif(btrim(coalesce(p_comment, '')), ''), 1000))
  on conflict (order_id) do update set rating = excluded.rating, comment = excluded.comment;
end $$;

-- Newsletter sign-up and one-click unsubscribe.
create or replace function public.newsletter_subscribe(p_email text, p_placement text default null) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_email text := lower(btrim(coalesce(p_email, '')));
begin
  if v_email !~ '^[^\s@]+@[^\s@]+\.[^\s@]{2,}$' then raise exception 'Enter a valid email address'; end if;
  insert into public.newsletter_subscribers (email, placement) values (v_email, left(p_placement, 40))
  on conflict (lower(email)) do update set unsubscribed_at = null, consent_at = now();
end $$;

create or replace function public.newsletter_unsubscribe(p_token uuid) returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  update public.newsletter_subscribers set unsubscribed_at = now() where token = p_token and unsubscribed_at is null;
  return found;
end $$;

-- Support: a customer writes about an order (number and phone) or from their account.
create or replace function public.support_post(p jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  o public.orders%rowtype;
  v_thread uuid := nullif(p ->> 'thread', '')::uuid;
  v_name text;
  v_cust uuid;
  v_body text := btrim(coalesce(p ->> 'body', ''));
  v_recent int;
begin
  if char_length(v_body) < 2 then raise exception 'Write your message'; end if;
  if nullif(p ->> 'number', '') is not null then
    o := private.find_my_order(p ->> 'number', p ->> 'phone');
    if o.id is null then raise exception 'We could not find that order'; end if;
    v_cust := o.customer_id;
  end if;
  if o.id is null and auth.uid() is null then raise exception 'Sign in, or enter your order number and phone'; end if;
  select count(*) into v_recent from public.support_messages m join public.support_threads t on t.id = m.thread_id
    where not m.from_staff and m.at > now() - interval '10 minutes' and (t.user_id = auth.uid() or (o.id is not null and t.order_id = o.id));
  if v_recent >= 10 then raise exception 'Please wait a little before sending more messages'; end if;
  v_name := coalesce((select full_name from public.customers where id = v_cust), (select full_name from public.customer_profiles where user_id = auth.uid()), 'Customer');

  if v_thread is not null then
    -- only the thread's own customer may add to it
    if not exists (select 1 from public.support_threads t where t.id = v_thread
                   and ((auth.uid() is not null and t.user_id = auth.uid()) or (o.id is not null and t.order_id = o.id))) then
      raise exception 'We could not find that conversation';
    end if;
    update public.support_threads set status = 'open', last_message_at = now() where id = v_thread;
  else
    insert into public.support_threads (order_id, customer_id, user_id, subject, complaint)
    values (o.id, v_cust, auth.uid(), left(coalesce(nullif(btrim(p ->> 'subject'), ''), case when o.id is not null then 'About order ' || o.number else 'A question' end), 120),
            coalesce((p ->> 'complaint')::boolean, false))
    returning id into v_thread;
  end if;
  insert into public.support_messages (thread_id, from_staff, author_id, author_name, body) values (v_thread, false, auth.uid(), v_name, left(v_body, 2000));
  return v_thread;
end $$;

-- The customer's conversations: for one order (number and phone), or all of a signed-in shopper's.
create or replace function public.support_threads_for(p_number text default null, p_phone text default null) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  o public.orders%rowtype;
begin
  if p_number is not null then
    o := private.find_my_order(p_number, p_phone);
    if o.id is null then return '[]'::jsonb; end if;
  elsif auth.uid() is null then
    return '[]'::jsonb;
  end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id', t.id, 'subject', t.subject, 'status', t.status, 'order', (select number from public.orders where id = t.order_id),
      'messages', (select jsonb_agg(jsonb_build_object('from_staff', m.from_staff, 'name', case when m.from_staff then split_part(m.author_name, ' ', 1) else m.author_name end, 'body', m.body, 'at', m.at) order by m.at)
                   from public.support_messages m where m.thread_id = t.id)) order by t.last_message_at desc)
    from public.support_threads t
    where (o.id is not null and t.order_id = o.id) or (o.id is null and t.user_id = auth.uid())), '[]'::jsonb);
end $$;

-- Customer Support, Admin and Owner: full customer access (Sales Agents only see their own customers).
create or replace function private.customers_full() returns boolean
language sql stable security definer set search_path = '' as $$
  select private.has_perm('customers', 'edit') and private.perm_scope('customers') = 'all'
$$;

-- Staff reply (Customer Support, Admin, Owner: "customers: edit").
create or replace function public.support_reply(p_thread uuid, p_body text, p_close boolean default false) returns void
language plpgsql security definer set search_path = '' as $$
declare
  t public.support_threads%rowtype;
  v_email text;
begin
  if not private.customers_full() then raise exception 'You cannot reply to customers' using errcode = '42501'; end if;
  select * into t from public.support_threads where id = p_thread for update;
  if not found then raise exception 'Conversation not found'; end if;
  if char_length(btrim(coalesce(p_body, ''))) >= 1 then
    insert into public.support_messages (thread_id, from_staff, author_id, author_name, body) values (t.id, true, auth.uid(), private.staff_name(), left(btrim(p_body), 2000));
    update public.support_threads set last_message_at = now(), first_reply_at = coalesce(first_reply_at, now()), status = case when p_close then 'closed' else 'waiting' end,
      assigned_to = coalesce(assigned_to, auth.uid()) where id = t.id;
    v_email := coalesce((select email from public.customers where id = t.customer_id), (select email from auth.users where id = t.user_id));
    perform private.queue_message('email', 'support_reply', v_email,
      jsonb_build_object('subject', t.subject, 'body', left(btrim(p_body), 2000), 'order', (select number from public.orders where id = t.order_id),
                         'name', coalesce((select full_name from public.customers where id = t.customer_id), 'there')), t.order_id, null);
  elsif p_close then
    update public.support_threads set status = 'closed' where id = t.id;
  end if;
end $$;

-- "Customers also bought": products that appear on the same paid orders.
create or replace function public.also_bought(p_slug text, p_limit int default 6) returns text[]
language sql stable security definer set search_path = '' as $$
  select coalesce(array_agg(slug order by n desc), '{}') from (
    select p2.slug, count(*) n
    from public.products p1
    join public.variants v1 on v1.product_id = p1.id
    join public.order_items i1 on i1.variant_id = v1.id
    join public.orders o on o.id = i1.order_id and o.amount_paid > 0 and o.status <> 'cancelled'
    join public.order_items i2 on i2.order_id = o.id and i2.id <> i1.id
    join public.variants v2 on v2.id = i2.variant_id
    join public.products p2 on p2.id = v2.product_id and p2.id <> p1.id and p2.published
    where p1.slug = p_slug
    group by p2.slug order by count(*) desc limit greatest(1, least(p_limit, 12))
  ) x
$$;

-- Approved reviews with consent, and the rating summary, for the shop.
create or replace function public.product_reviews(p_slug text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'average', (select round(avg(r.rating)::numeric, 1) from public.reviews r join public.products p on p.id = r.product_id where p.slug = p_slug and r.status = 'approved' and r.consent),
    'count', (select count(*) from public.reviews r join public.products p on p.id = r.product_id where p.slug = p_slug and r.status = 'approved' and r.consent),
    'reviews', coalesce((select jsonb_agg(jsonb_build_object('rating', r.rating, 'title', r.title, 'body', r.body, 'name', r.display_name, 'city', r.city,
        'verified', r.verified, 'source', r.source, 'photos', r.photos, 'at', r.created_at) order by r.created_at desc)
      from (select r.* from public.reviews r join public.products p on p.id = r.product_id where p.slug = p_slug and r.status = 'approved' and r.consent order by r.created_at desc limit 30) r), '[]'::jsonb))
$$;

-- Reviews for the home page strip (any product, plus Instagram reviews with consent).
create or replace function public.recent_reviews(p_limit int default 8) returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('rating', r.rating, 'body', r.body, 'name', r.display_name, 'city', r.city, 'source', r.source,
      'product', (select name from public.products where id = r.product_id), 'slug', (select slug from public.products where id = r.product_id)) order by r.created_at desc), '[]'::jsonb)
  from (select * from public.reviews where status = 'approved' and consent and rating >= 4 order by created_at desc limit greatest(1, least(p_limit, 20))) r
$$;

-- Referrals: who joined and bought through my code (first names only).
create or replace function public.my_referrals() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_code text;
begin
  if auth.uid() is null then raise exception 'Sign in first' using errcode = '42501'; end if;
  select referral_code into v_code from public.customer_profiles where user_id = auth.uid();
  if v_code is null then return jsonb_build_object('code', null, 'joined', 0, 'orders', 0); end if;
  return jsonb_build_object('code', v_code,
    'joined', (select count(*) from public.customer_profiles where referred_by_code = v_code),
    'orders', (select count(*) from public.orders where upper(btrim(source_detail)) = v_code and amount_paid > 0 and status <> 'cancelled'),
    'people', coalesce((select jsonb_agg(split_part(coalesce(full_name, 'Someone'), ' ', 1)) from public.customer_profiles where referred_by_code = v_code), '[]'::jsonb));
end $$;

-- A richer order history for My Drezzy (progress, balance, items with product links for reorder).
create or replace function public.my_orders() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'Sign in first' using errcode = '42501'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'number', o.number, 'phone', c.phone, 'placed_at', o.created_at, 'status', o.status, 'payment_state', o.payment_state,
      'total', o.total, 'paid', o.amount_paid, 'balance', o.balance_due, 'est', o.est_delivery_date,
      'items', coalesce((select jsonb_agg(i.product_name || ' · ' || i.variant_label order by i.product_name) from public.order_items i where i.order_id = o.id), '[]'::jsonb),
      'lines', coalesce((select jsonb_agg(jsonb_build_object('variant_id', i.variant_id, 'qty', i.qty, 'name', i.product_name, 'detail', i.variant_label, 'price', i.unit_price)) from public.order_items i where i.order_id = o.id), '[]'::jsonb)
    ) order by o.created_at desc)
    from public.orders o join public.customers c on c.id = o.customer_id
    where c.auth_user_id = auth.uid()), '[]'::jsonb);
end $$;

-- ---------------------------------------------------------------------------
-- Triggers: loyalty points on delivery, wishlist and "notify me" alerts
-- ---------------------------------------------------------------------------
-- DEFAULT loyalty rule: 1 point per GHS 10 of a delivered order, for orders linked to an account.
create or replace function private.award_points() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid;
begin
  if new.status = 'delivered' and old.status is distinct from 'delivered' then
    select auth_user_id into v_user from public.customers where id = new.customer_id;
    if v_user is not null and floor(new.total / 10) > 0 then
      insert into public.loyalty_entries (user_id, points, reason, order_id) values (v_user, floor(new.total / 10)::int, 'Order delivered', new.id)
      on conflict do nothing;
    end if;
  end if;
  if new.status = 'delivered' and new.delivered_at is null then
    new.delivered_at := now();
  end if;
  return new;
end $$;
create trigger orders_points before update on public.orders for each row execute function private.award_points();

-- When a size comes back or the price drops, people who asked are told once.
create or replace function private.variant_alerts() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_back boolean := old.availability = 'unavailable' and new.availability <> 'unavailable';
  v_old numeric := private.effective_price(old.price, old.sale_price, old.sale_starts_at, old.sale_ends_at);
  v_new numeric := private.effective_price(new.price, new.sale_price, new.sale_starts_at, new.sale_ends_at);
  pr public.products%rowtype;
  r record;
begin
  if not v_back and not (v_new < v_old) then return new; end if;
  select * into pr from public.products where id = new.product_id;
  if not pr.published then return new; end if;

  if v_back then
    for r in select a.id, a.email from public.stock_alerts a where a.product_id = pr.id and a.kind = 'restock' and a.notified_at is null and (a.size is null or a.size = new.size) loop
      perform private.queue_message('email', 'stock_back', r.email, jsonb_build_object('product', pr.name, 'slug', pr.slug, 'size', new.size), null, 'stock:' || r.id);
      update public.stock_alerts set notified_at = now() where id = r.id;
    end loop;
    for r in select w.id, u.email from public.wishlist_items w join auth.users u on u.id = w.user_id
             where w.product_id = pr.id and w.notify_available and (w.size is null or w.size = new.size) loop
      perform private.queue_message('email', 'wishlist_back', r.email, jsonb_build_object('product', pr.name, 'slug', pr.slug, 'size', new.size), null,
        'wb:' || r.id || ':' || to_char(now(), 'YYYYMMDD'));
    end loop;
  end if;
  if v_new < v_old then
    for r in select w.id, u.email, w.price_at_add from public.wishlist_items w join auth.users u on u.id = w.user_id
             where w.product_id = pr.id and w.notify_price and (w.price_at_add is null or v_new < w.price_at_add) loop
      perform private.queue_message('email', 'wishlist_price', r.email, jsonb_build_object('product', pr.name, 'slug', pr.slug, 'price', v_new, 'was', coalesce(r.price_at_add, v_old)), null,
        'wp:' || r.id || ':' || v_new::text);
    end loop;
  end if;
  return new;
end $$;
create trigger variants_alerts after update on public.variants for each row execute function private.variant_alerts();

-- ---------------------------------------------------------------------------
-- Row-level security and grants
-- ---------------------------------------------------------------------------
alter table public.customer_profiles enable row level security;
alter table public.addresses enable row level security;
alter table public.wishlist_items enable row level security;
alter table public.stock_alerts enable row level security;
alter table public.reviews enable row level security;
alter table public.order_feedback enable row level security;
alter table public.coupons enable row level security;
alter table public.coupon_redemptions enable row level security;
alter table public.loyalty_entries enable row level security;
alter table public.data_requests enable row level security;
alter table public.newsletter_subscribers enable row level security;
alter table public.support_threads enable row level security;
alter table public.support_messages enable row level security;
alter table public.looks enable row level security;

-- profile: the shopper reads theirs (writes go through save_my_profile); staff who handle customers can read
create policy profiles_own on public.customer_profiles for select to authenticated using (user_id = auth.uid() or private.has_perm('customers', 'view'));

-- addresses and wishlist: the shopper's own rows
create policy addresses_read on public.addresses for select to authenticated using (user_id = auth.uid() or private.has_perm('customers', 'view'));
create policy addresses_insert on public.addresses for insert to authenticated
  with check (user_id = auth.uid() and not exists (select 1 from public.staff where id = auth.uid()));
create policy addresses_update on public.addresses for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy addresses_delete on public.addresses for delete to authenticated using (user_id = auth.uid());
create policy wishlist_own on public.wishlist_items for select to authenticated using (user_id = auth.uid() or private.has_perm('customers', 'view'));
create policy wishlist_delete_own on public.wishlist_items for delete to authenticated using (user_id = auth.uid());
create policy wishlist_update_own on public.wishlist_items for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy stock_alerts_staff on public.stock_alerts for select to authenticated using (private.has_perm('products', 'view') and private.has_perm('customers', 'view'));

-- reviews: the shop reads approved ones through product_reviews(); staff with content or customer rights moderate
create policy reviews_staff_read on public.reviews for select to authenticated using (private.has_perm('content', 'view') or private.has_perm('customers', 'view'));
create policy reviews_staff_write on public.reviews for update to authenticated using (private.has_perm('content', 'edit') or private.customers_full())
  with check (private.has_perm('content', 'edit') or private.customers_full());
create policy reviews_staff_insert on public.reviews for insert to authenticated
  with check ((private.has_perm('content', 'create') or private.customers_full()) and source in ('instagram', 'whatsapp', 'staff'));
create policy reviews_staff_delete on public.reviews for delete to authenticated using (private.has_perm('content', 'delete'));
create policy feedback_staff_read on public.order_feedback for select to authenticated using (exists (select 1 from public.orders o where o.id = order_id));

-- coupons: marketing tools for Owner and Admin (settings) and the Content Editor
create policy coupons_read on public.coupons for select to authenticated using (private.has_perm('settings', 'view') or private.has_perm('content', 'view') or private.has_perm('orders', 'create'));
create policy coupons_write on public.coupons for all to authenticated
  using (private.has_perm('settings', 'edit') or private.has_perm('content', 'edit'))
  with check (private.has_perm('settings', 'edit') or private.has_perm('content', 'edit'));
create policy coupon_redemptions_read on public.coupon_redemptions for select to authenticated using (private.has_perm('settings', 'view') or private.has_perm('content', 'view'));

create policy loyalty_own on public.loyalty_entries for select to authenticated using (user_id = auth.uid() or private.has_perm('customers', 'view'));

create policy data_requests_own on public.data_requests for select to authenticated using (user_id = auth.uid() or private.customers_full());
create policy data_requests_staff on public.data_requests for update to authenticated using (private.customers_full()) with check (private.customers_full());

create policy newsletter_staff on public.newsletter_subscribers for select to authenticated using (private.has_perm('content', 'view') or private.has_perm('customers', 'view'));

create policy threads_staff on public.support_threads for select to authenticated using (private.has_perm('customers', 'view') and private.perm_scope('customers') = 'all');
create policy threads_staff_update on public.support_threads for update to authenticated using (private.customers_full()) with check (private.customers_full());
create policy messages_staff on public.support_messages for select to authenticated using (private.has_perm('customers', 'view') and private.perm_scope('customers') = 'all');

create policy looks_public on public.looks for select to anon, authenticated using (published);
create policy looks_staff_read on public.looks for select to authenticated using (private.has_perm('content', 'view'));
create policy looks_write on public.looks for all to authenticated using (private.has_perm('content', 'edit')) with check (private.has_perm('content', 'edit'));

revoke all on public.customer_profiles, public.addresses, public.wishlist_items, public.stock_alerts, public.reviews, public.order_feedback,
  public.coupons, public.coupon_redemptions, public.loyalty_entries, public.data_requests, public.newsletter_subscribers,
  public.support_threads, public.support_messages, public.looks from anon, authenticated, public;
grant select on public.customer_profiles, public.wishlist_items, public.stock_alerts, public.reviews, public.order_feedback, public.coupons,
  public.coupon_redemptions, public.loyalty_entries, public.data_requests, public.newsletter_subscribers, public.support_threads,
  public.support_messages, public.looks to authenticated;
grant insert, update, delete on public.addresses to authenticated;
grant select on public.addresses to authenticated;
grant update, delete on public.wishlist_items to authenticated;
grant insert, update, delete on public.reviews, public.coupons, public.looks to authenticated;
grant update on public.data_requests, public.support_threads to authenticated;
grant select on public.looks to anon;

create trigger coupons_audit after insert or update or delete on public.coupons for each row execute function private.audit_row();
create trigger reviews_audit after update or delete on public.reviews for each row execute function private.audit_row();
create trigger data_requests_audit after update on public.data_requests for each row execute function private.audit_row();
create trigger looks_audit after insert or update or delete on public.looks for each row execute function private.audit_row();

-- function access
revoke execute on function
  public.check_coupon(text, numeric, text), public.my_profile(), public.save_my_profile(jsonb), public.save_style_profile(jsonb),
  public.my_data_export(), public.request_data_action(text, text, text, text), public.wishlist_toggle(uuid, text, boolean),
  public.request_stock_alert(text, uuid, text, text), public.submit_review(jsonb), public.submit_feedback(text, text, int, text),
  public.newsletter_subscribe(text, text), public.newsletter_unsubscribe(uuid), public.support_post(jsonb), public.support_threads_for(text, text),
  public.support_reply(uuid, text, boolean), public.also_bought(text, int), public.product_reviews(text), public.recent_reviews(int),
  public.my_referrals(), public.my_orders(), public.place_order(jsonb), public.track_order(text, text)
from public;
grant execute on function
  public.check_coupon(text, numeric, text), public.request_data_action(text, text, text, text), public.request_stock_alert(text, uuid, text, text),
  public.submit_review(jsonb), public.submit_feedback(text, text, int, text), public.newsletter_subscribe(text, text), public.newsletter_unsubscribe(uuid),
  public.support_post(jsonb), public.support_threads_for(text, text), public.also_bought(text, int), public.product_reviews(text), public.recent_reviews(int),
  public.place_order(jsonb), public.track_order(text, text)
to anon, authenticated;
grant execute on function
  public.my_profile(), public.save_my_profile(jsonb), public.save_style_profile(jsonb), public.my_data_export(), public.wishlist_toggle(uuid, text, boolean),
  public.support_reply(uuid, text, boolean), public.my_referrals(), public.my_orders()
to authenticated;
revoke execute on all functions in schema private from public, anon;
grant execute on all functions in schema private to authenticated;

-- Review photos: a public bucket (approved reviews are public anyway); only signed-in shoppers upload, into reviews/<their id>/.
do $$
begin
  if to_regclass('storage.buckets') is not null then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('reviews', 'reviews', true, 3145728, array['image/jpeg', 'image/png', 'image/webp'])
    on conflict (id) do nothing;
    drop policy if exists reviews_upload on storage.objects;
    create policy reviews_upload on storage.objects for insert to authenticated
      with check (bucket_id = 'reviews' and (storage.foldername(name))[1] = auth.uid()::text);
  end if;
end $$;
