-- Sprint 3/4: orders, payments and the customer tracker (PRD sections 9 and 14, data model section 20).
--
-- How this is protected:
--   * Shoppers have NO direct access to any order table. Guest checkout and tracking go through narrow functions
--     (place_order, track_order, submit_manual_payment) that validate everything inside the database.
--   * Prices, delivery fees and the half-payment rule are recomputed here from the catalogue and delivery zones.
--     Whatever the browser sends is only a list of variant ids and quantities.
--   * Payments are confirmed by confirm_payment(), callable by the service role only (the signed Paystack webhook),
--     which is idempotent and checks the amount against the order (FR-CO-003).
--   * Status and money columns can only be changed by the functions below, which enforce the PRD rules: steps only move
--     forward, an order with a balance cannot be Delivered, and only an Admin can move an order back, with a reason.
--   * Money is exact decimal in cedis (numeric 12,2).

-- ---------------------------------------------------------------------------
-- Types
-- ---------------------------------------------------------------------------
create type public.order_channel as enum ('web', 'whatsapp', 'phone', 'instagram_dm', 'walk_in');
create type public.order_status as enum (
  'awaiting_payment', 'to_confirm', 'to_source', 'ready_to_pack', 'packed',
  'dispatched', 'out_for_delivery', 'delivered', 'failed_delivery', 'cancelled'
);
create type public.payment_state as enum ('unpaid', 'pending_check', 'part_paid', 'paid', 'failed', 'partly_refunded', 'refunded');
create type public.payment_plan as enum ('full', 'half');
create type public.delivery_method as enum ('home', 'pickup');
create type public.payment_kind as enum ('checkout', 'balance', 'refund');
create type public.payment_status as enum ('pending', 'pending_check', 'success', 'failed');
create type public.payment_provider as enum ('paystack', 'manual_momo', 'cash', 'momo');

-- ---------------------------------------------------------------------------
-- Delivery zones (PRD section 9): fee and time by region, and whether half payment is allowed
-- ---------------------------------------------------------------------------
create table public.delivery_zones (
  region text primary key check (char_length(region) between 2 and 60),
  areas text,
  fee numeric(12, 2) not null default 0 check (fee >= 0),
  fee_on_arrival boolean not null default false,
  est_days int not null default 3 check (est_days between 0 and 30),
  half_payment_allowed boolean not null default false,
  branch public.app_branch not null default 'accra',
  active boolean not null default true,
  sort int not null default 0,
  updated_at timestamptz not null default now()
);

-- DEFAULT starting values, to be confirmed by the owner (PRD section 27). Half payment is allowed in Accra only.
insert into public.delivery_zones (region, fee, est_days, half_payment_allowed, branch, sort) values
  ('Greater Accra', 30, 1, true, 'accra', 1), ('Ashanti', 50, 2, false, 'kumasi', 2), ('Central', 55, 3, false, 'accra', 3),
  ('Eastern', 55, 3, false, 'accra', 4), ('Western', 60, 3, false, 'accra', 5), ('Volta', 60, 3, false, 'accra', 6),
  ('Bono', 65, 4, false, 'kumasi', 7), ('Ahafo', 65, 4, false, 'kumasi', 8), ('Bono East', 65, 4, false, 'kumasi', 9),
  ('Western North', 70, 4, false, 'accra', 10), ('Oti', 70, 4, false, 'accra', 11), ('Northern', 80, 5, false, 'kumasi', 12),
  ('Savannah', 80, 5, false, 'kumasi', 13), ('North East', 85, 5, false, 'kumasi', 14), ('Upper East', 85, 5, false, 'kumasi', 15),
  ('Upper West', 85, 5, false, 'kumasi', 16);

-- ---------------------------------------------------------------------------
-- Customers (guest checkout creates one per phone number)
-- ---------------------------------------------------------------------------
create table public.customers (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid references auth.users (id) on delete set null,
  full_name text not null check (char_length(full_name) between 2 and 100),
  phone text not null unique check (phone ~ '^\+233[0-9]{9}$'),
  email text,
  source text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Orders
-- ---------------------------------------------------------------------------
create sequence public.order_number_seq start 1001;

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  number text not null unique,
  customer_id uuid not null references public.customers (id),
  channel public.order_channel not null default 'web',
  branch public.app_branch not null default 'accra',
  status public.order_status not null default 'awaiting_payment',
  payment_state public.payment_state not null default 'unpaid',
  payment_plan public.payment_plan not null default 'full',
  currency text not null default 'GHS',
  subtotal numeric(12, 2) not null check (subtotal >= 0),
  delivery_fee numeric(12, 2) not null default 0 check (delivery_fee >= 0),
  discount numeric(12, 2) not null default 0 check (discount >= 0),
  discount_reason text,
  total numeric(12, 2) not null check (total >= 0),
  amount_paid numeric(12, 2) not null default 0 check (amount_paid >= 0),
  balance_due numeric(12, 2) not null default 0,
  delivery_method public.delivery_method not null default 'home',
  receiver_name text,
  receiver_phone text,
  region text,
  city text,
  area text,
  street text,
  gps_code text,
  rider_note text,
  source text,
  source_detail text,
  assigned_agent_id uuid references auth.users (id) on delete set null,
  agent_name text,
  assigned_dispatch_id uuid references auth.users (id) on delete set null,
  courier text,
  tracking_number text,
  rider_name text,
  rider_phone text,
  est_delivery_date date,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (discount = 0 or discount_reason is not null)
);
create index orders_customer_idx on public.orders (customer_id);
create index orders_status_idx on public.orders (status);
create index orders_agent_idx on public.orders (assigned_agent_id);
create index orders_created_idx on public.orders (created_at desc);

-- What was bought, copied at purchase time so later catalogue edits never change history (PRD section 20)
create table public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete cascade,
  variant_id uuid references public.variants (id) on delete set null,
  product_name text not null,
  variant_label text not null,
  sku text not null,
  qty int not null check (qty between 1 and 10),
  unit_price numeric(12, 2) not null check (unit_price >= 0),
  sourcing text not null default 'pending' check (sourcing in ('pending', 'ordered', 'received', 'failed'))
);
create index order_items_order_idx on public.order_items (order_id);

-- The order's timeline. "kind" says what happened; public_note is what the customer may read.
create table public.order_events (
  id bigint generated always as identity primary key,
  order_id uuid not null references public.orders (id) on delete cascade,
  kind text not null check (kind in ('placed', 'payment', 'status', 'supplier', 'note', 'override')),
  status public.order_status,
  actor_id uuid references auth.users (id) on delete set null,
  actor_name text,
  public_note text,
  internal_note text,
  at timestamptz not null default now()
);
create index order_events_order_idx on public.order_events (order_id, at);

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete cascade,
  kind public.payment_kind not null default 'checkout',
  provider public.payment_provider not null,
  method text,
  reference text not null unique,
  external_ref text,
  amount numeric(12, 2) not null check (amount > 0),
  status public.payment_status not null default 'pending',
  checked_by uuid references auth.users (id) on delete set null,
  raw jsonb,
  created_at timestamptz not null default now(),
  confirmed_at timestamptz
);
create index payments_order_idx on public.payments (order_id);
-- a manual MoMo transaction id can only ever be used once (FR-CO-007)
create unique index payments_manual_txn_unique on public.payments (external_ref) where provider = 'manual_momo' and external_ref is not null;

create table public.order_notes (
  id bigint generated always as identity primary key,
  order_id uuid not null references public.orders (id) on delete cascade,
  author_id uuid references auth.users (id) on delete set null,
  author_name text,
  body text not null check (char_length(body) between 1 and 2000),
  at timestamptz not null default now()
);

create trigger customers_touch before update on public.customers for each row execute function private.touch_updated_at();
create trigger orders_touch before update on public.orders for each row execute function private.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
-- Phone numbers are stored in international format (+233...). Returns null when it is not a Ghana number.
create or replace function private.norm_phone(p text) returns text
language sql immutable as $$
  select case
    when d ~ '^0[0-9]{9}$' then '+233' || substr(d, 2)
    when d ~ '^233[0-9]{9}$' then '+' || d
    when d ~ '^\+233[0-9]{9}$' then d
    else null
  end
  from (select regexp_replace(coalesce(p, ''), '[\s().-]', '', 'g') as d) s
$$;

create or replace function private.staff_name() returns text
language sql stable security definer set search_path = '' as $$
  select s.full_name from public.staff s where s.id = auth.uid()
$$;

create or replace function private.log_event(p_order uuid, p_kind text, p_status public.order_status, p_public text, p_internal text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  insert into public.order_events (order_id, kind, status, actor_id, actor_name, public_note, internal_note)
  values (p_order, p_kind, p_status, auth.uid(), private.staff_name(), p_public, p_internal);
end $$;

-- The order's place in the sequence of statuses. Orders only move forward (FR-TR-002).
create or replace function private.status_rank(s public.order_status) returns int
language sql immutable as $$
  select case s
    when 'awaiting_payment' then 1 when 'to_confirm' then 2 when 'to_source' then 3 when 'ready_to_pack' then 4
    when 'packed' then 5 when 'dispatched' then 6 when 'out_for_delivery' then 7 when 'failed_delivery' then 7
    when 'delivered' then 8 when 'cancelled' then 9
  end
$$;

-- Can the signed-in staff member see this order? "Own records only" means orders assigned to or created by them.
create or replace function private.can_see_order(p_agent uuid, p_creator uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select private.has_perm('orders', 'view')
     and (private.perm_scope('orders') = 'all' or p_agent = auth.uid() or p_creator = auth.uid())
$$;

-- ---------------------------------------------------------------------------
-- Guard: status and money change only through the functions below
-- ---------------------------------------------------------------------------
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
      new.delivery_fee, new.discount, new.discount_reason, new.total, new.amount_paid, new.balance_due, new.created_by)
     is distinct from
     (old.number, old.customer_id, old.channel, old.status, old.payment_state, old.payment_plan, old.currency, old.subtotal,
      old.delivery_fee, old.discount, old.discount_reason, old.total, old.amount_paid, old.balance_due, old.created_by) then
    raise exception 'Status and money can only be changed with the order actions' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger orders_guard before insert or update or delete on public.orders for each row execute function private.guard_orders();

-- ---------------------------------------------------------------------------
-- place_order: guest checkout and staff-created orders (FR-CO-001, FR-ORD-003)
-- ---------------------------------------------------------------------------
create or replace function public.place_order(p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_channel public.order_channel := coalesce(nullif(p ->> 'channel', ''), 'web')::public.order_channel;
  v_staff boolean := auth.uid() is not null and private.has_perm('orders', 'create');
  v_phone text := private.norm_phone(p #>> '{customer,phone}');
  v_name text := btrim(coalesce(p #>> '{customer,name}', ''));
  v_email text := nullif(btrim(coalesce(p #>> '{customer,email}', '')), '');
  v_method public.delivery_method := coalesce(nullif(p #>> '{delivery,method}', ''), 'home')::public.delivery_method;
  v_region text := case when coalesce(nullif(p #>> '{delivery,method}', ''), 'home') = 'pickup' then 'Greater Accra' else btrim(coalesce(p #>> '{delivery,region}', '')) end;
  v_plan public.payment_plan := coalesce(nullif(p ->> 'plan', ''), 'full')::public.payment_plan;
  v_zone public.delivery_zones%rowtype;
  v_cust uuid;
  v_order uuid;
  v_number text;
  v_it jsonb;
  v_items jsonb := '[]'::jsonb;
  v_rec record;
  v_qty int;
  v_subtotal numeric(12, 2) := 0;
  v_lead int := 0;
  v_fee numeric(12, 2);
  v_discount numeric(12, 2) := 0;
  v_total numeric(12, 2);
  v_due numeric(12, 2);
  v_method_pay text := coalesce(nullif(p ->> 'pay_method', ''), 'mtn');
  v_provider public.payment_provider;
  v_ref text;
  v_unpaid int;
  v_source text := nullif(btrim(coalesce(p ->> 'source', '')), '');
begin
  if v_channel <> 'web' and not v_staff then
    raise exception 'Only staff can create orders for other channels' using errcode = '42501';
  end if;
  if v_name = '' or char_length(v_name) < 2 then raise exception 'Enter your full name'; end if;
  if v_phone is null then raise exception 'Enter a valid Ghana phone number'; end if;
  if v_email is not null and v_email !~ '^[^\s@]+@[^\s@]+\.[^\s@]{2,}$' then raise exception 'Enter a valid email address'; end if;
  if v_channel = 'web' and v_source is null then raise exception 'Please tell us how you got to know Drezzy'; end if;
  if jsonb_typeof(p -> 'items') is distinct from 'array' or jsonb_array_length(p -> 'items') not between 1 and 20 then
    raise exception 'Add between 1 and 20 items';
  end if;

  select * into v_zone from public.delivery_zones where region = v_region and active;
  if not found then raise exception 'We do not deliver to that region yet'; end if;
  if v_method = 'home' and (btrim(coalesce(p #>> '{delivery,city}', '')) = '' or btrim(coalesce(p #>> '{delivery,street}', '')) = '') then
    raise exception 'Add the city and a street or landmark for delivery';
  end if;

  -- items: priced from the catalogue, never from the request
  for v_it in select * from jsonb_array_elements(p -> 'items') loop
    v_qty := coalesce((v_it ->> 'qty')::int, 0);
    if v_qty not between 1 and 10 then raise exception 'Quantity must be between 1 and 10'; end if;
    select v.id, v.price, v.availability, v.lead_days, v.sku, v.style, v.colour, v.size, pr.name, pr.published
      into v_rec
      from public.variants v join public.products pr on pr.id = v.product_id
      where v.id = (v_it ->> 'variant_id')::uuid;
    if not found or not v_rec.published then raise exception 'An item in your bag is no longer available'; end if;
    if v_rec.availability = 'unavailable' then raise exception '% (%) is unavailable right now', v_rec.name, v_rec.size; end if;
    v_subtotal := v_subtotal + v_rec.price * v_qty;
    v_lead := greatest(v_lead, v_rec.lead_days);
    v_items := v_items || jsonb_build_array(jsonb_build_object(
      'variant_id', v_rec.id, 'product_name', v_rec.name, 'sku', v_rec.sku, 'qty', v_qty, 'unit_price', v_rec.price,
      'variant_label', btrim(concat_ws(' · ', v_rec.style, v_rec.colour, case when v_rec.size <> 'One size' then 'Size ' || v_rec.size end))));
  end loop;

  -- totals (FR-CO delivery fee is part of what is paid at checkout)
  v_fee := case when v_method = 'pickup' then 0 else v_zone.fee end;
  if v_staff and coalesce((p #>> '{discount,amount}')::numeric, 0) > 0 then
    v_discount := (p #>> '{discount,amount}')::numeric;
    if v_discount > v_subtotal then raise exception 'The discount cannot be more than the items'; end if;
    if btrim(coalesce(p #>> '{discount,reason}', '')) = '' then raise exception 'A discount needs a reason'; end if;
  end if;
  v_total := v_subtotal + v_fee - v_discount;

  -- payment plan: half now, half on delivery is for Accra (and Accra pickup) only
  if v_plan = 'half' and not v_zone.half_payment_allowed then
    raise exception 'Outside Accra, orders are paid in full at checkout';
  end if;
  v_due := case when v_plan = 'half' then ceil(v_total * 100 / 2) / 100 else v_total end;

  -- guests cannot flood the system with unpaid orders
  if v_channel = 'web' then
    select count(*) into v_unpaid from public.orders o join public.customers c on c.id = o.customer_id
      where c.phone = v_phone and o.status = 'awaiting_payment' and o.created_at > now() - interval '1 hour';
    if v_unpaid >= 5 then raise exception 'You have several unpaid orders. Please complete one, or contact us on WhatsApp'; end if;
  end if;

  insert into public.customers (full_name, phone, email, source) values (v_name, v_phone, v_email, v_source)
    on conflict (phone) do update set
      email = coalesce(public.customers.email, excluded.email),
      source = coalesce(public.customers.source, excluded.source)
    returning id into v_cust;

  v_number := 'DRZ-' || nextval('public.order_number_seq');
  perform set_config('app.via_rpc', '1', true);
  insert into public.orders (
    number, customer_id, channel, branch, status, payment_state, payment_plan, subtotal, delivery_fee, discount, discount_reason, total,
    amount_paid, balance_due, delivery_method, receiver_name, receiver_phone, region, city, area, street, gps_code, rider_note,
    source, source_detail, assigned_agent_id, agent_name, created_by, est_delivery_date)
  values (
    v_number, v_cust, v_channel, v_zone.branch, 'awaiting_payment', 'unpaid', v_plan, v_subtotal, v_fee, v_discount, nullif(p #>> '{discount,reason}', ''), v_total,
    0, v_total, v_method, nullif(btrim(coalesce(p #>> '{receiver,name}', '')), ''), private.norm_phone(p #>> '{receiver,phone}'),
    case when v_method = 'home' then v_region end, nullif(btrim(coalesce(p #>> '{delivery,city}', '')), ''), nullif(btrim(coalesce(p #>> '{delivery,area}', '')), ''),
    nullif(btrim(coalesce(p #>> '{delivery,street}', '')), ''), nullif(btrim(coalesce(p #>> '{delivery,gps}', '')), ''), nullif(btrim(coalesce(p #>> '{delivery,note}', '')), ''),
    v_source, nullif(btrim(coalesce(p ->> 'source_detail', '')), ''), case when v_staff then auth.uid() end, case when v_staff then private.staff_name() end, auth.uid(),
    (now() + make_interval(days => v_lead + v_zone.est_days))::date)
  returning id into v_order;

  insert into public.order_items (order_id, variant_id, product_name, variant_label, sku, qty, unit_price)
  select v_order, (i ->> 'variant_id')::uuid, i ->> 'product_name', i ->> 'variant_label', i ->> 'sku', (i ->> 'qty')::int, (i ->> 'unit_price')::numeric
  from jsonb_array_elements(v_items) i;

  v_provider := case when v_method_pay = 'manual_momo' then 'manual_momo'::public.payment_provider else 'paystack'::public.payment_provider end;
  v_ref := v_number || '-' || substr(md5(random()::text || clock_timestamp()::text), 1, 8);
  insert into public.payments (order_id, kind, provider, method, reference, amount, status)
  values (v_order, 'checkout', v_provider, v_method_pay, v_ref, v_due, 'pending');

  perform private.log_event(v_order, 'placed', 'awaiting_payment', 'Order placed', case when v_staff then 'Created by staff from ' || v_channel::text end);
  perform set_config('app.via_rpc', '', true);

  return jsonb_build_object(
    'order_id', v_order, 'number', v_number, 'total', v_total, 'due_now', v_due, 'balance_due', v_total - v_due,
    'payment_reference', v_ref, 'provider', v_provider, 'est_delivery_date', (now() + make_interval(days => v_lead + v_zone.est_days))::date);
end $$;

-- ---------------------------------------------------------------------------
-- track_order: the public tracking page. Needs the order number AND the phone number, and returns safe fields only.
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
    'total', o.total, 'amount_paid', o.amount_paid, 'balance_due', o.balance_due, 'est_delivery_date', o.est_delivery_date,
    'delivery_method', o.delivery_method, 'region', o.region, 'city', o.city, 'area', o.area,
    'receiver_name', coalesce(o.receiver_name, (select full_name from public.customers where id = o.customer_id)),
    'courier', o.courier, 'tracking_number', o.tracking_number, 'rider_name', o.rider_name, 'rider_phone', o.rider_phone, 'branch', o.branch,
    'items', coalesce((select jsonb_agg(jsonb_build_object('name', i.product_name, 'detail', i.variant_label, 'qty', i.qty) order by i.id) from public.order_items i where i.order_id = o.id), '[]'::jsonb),
    'events', coalesce((select jsonb_agg(jsonb_build_object('kind', e.kind, 'status', e.status, 'at', e.at, 'note', e.public_note, 'by', split_part(coalesce(e.actor_name, ''), ' ', 1)) order by e.at, e.id)
                        from public.order_events e where e.order_id = o.id and e.public_note is not null), '[]'::jsonb),
    'payments', coalesce((select jsonb_agg(jsonb_build_object('kind', pm.kind, 'method', pm.method, 'amount', pm.amount, 'at', pm.confirmed_at) order by pm.confirmed_at)
                          from public.payments pm where pm.order_id = o.id and pm.status = 'success'), '[]'::jsonb));
end $$;

-- ---------------------------------------------------------------------------
-- Payments
-- ---------------------------------------------------------------------------
-- Applies a successful payment to its order. Internal; callers check who is allowed.
create or replace function private.apply_payment(p_payment uuid, p_raw jsonb, p_checked_by uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  pay public.payments%rowtype;
  o public.orders%rowtype;
  v_paid numeric(12, 2);
  v_balance numeric(12, 2);
begin
  select * into pay from public.payments where id = p_payment for update;
  if not found or pay.status = 'success' then return; end if; -- idempotent: a repeated webhook changes nothing
  select * into o from public.orders where id = pay.order_id for update;

  update public.payments set status = 'success', confirmed_at = now(), checked_by = p_checked_by, raw = coalesce(p_raw, raw) where id = pay.id;

  v_paid := o.amount_paid + pay.amount;
  v_balance := greatest(o.total - v_paid, 0);
  perform set_config('app.via_rpc', '1', true);
  update public.orders set
    amount_paid = v_paid,
    balance_due = v_balance,
    payment_state = case when v_balance = 0 then 'paid'::public.payment_state else 'part_paid'::public.payment_state end,
    status = case when o.status = 'awaiting_payment' then 'to_confirm'::public.order_status else o.status end
  where id = o.id;
  perform private.log_event(o.id, 'payment', case when o.status = 'awaiting_payment' then 'to_confirm' else o.status end,
    case when pay.kind = 'balance' then 'Balance paid' else 'Payment confirmed' end,
    pay.kind::text || ' ' || pay.amount::text || ' via ' || pay.provider::text || ' ' || coalesce(pay.method, ''));
  perform set_config('app.via_rpc', '', true);
end $$;

-- Called by the payment webhook (service role only) after it has verified the provider's signature.
create or replace function public.confirm_payment(p_reference text, p_amount numeric, p_raw jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  pay public.payments%rowtype;
begin
  select * into pay from public.payments where reference = p_reference for update;
  if not found then return jsonb_build_object('ok', false, 'reason', 'unknown_reference'); end if;
  if pay.status = 'success' then return jsonb_build_object('ok', true, 'duplicate', true); end if;
  if pay.amount <> p_amount then
    -- the amount must match what the order asked for, so a tampered or short payment never marks an order paid
    update public.payments set status = 'failed', raw = p_raw where id = pay.id;
    return jsonb_build_object('ok', false, 'reason', 'amount_mismatch');
  end if;
  perform private.apply_payment(pay.id, p_raw, null);
  return jsonb_build_object('ok', true);
end $$;

-- The customer enters their MoMo transaction id after paying manually (FR-CO-006). Duplicate ids are refused.
create or replace function public.submit_manual_payment(p_number text, p_phone text, p_txn text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_phone text := private.norm_phone(p_phone);
  pay public.payments%rowtype;
  o public.orders%rowtype;
  v_txn text := upper(btrim(coalesce(p_txn, '')));
begin
  if v_phone is null or char_length(v_txn) < 6 then raise exception 'Enter the transaction ID from your MoMo message'; end if;
  select ord.* into o from public.orders ord join public.customers c on c.id = ord.customer_id
    where ord.number = upper(btrim(p_number)) and c.phone = v_phone;
  if not found then raise exception 'We could not find that order'; end if;
  select * into pay from public.payments where order_id = o.id and provider = 'manual_momo' and status in ('pending', 'pending_check') order by created_at desc limit 1;
  if not found then raise exception 'This order is not waiting for a manual payment'; end if;
  if exists (select 1 from public.payments where provider = 'manual_momo' and external_ref = v_txn) then
    raise exception 'That transaction ID has already been used';
  end if;
  update public.payments set external_ref = v_txn, status = 'pending_check' where id = pay.id;
  perform set_config('app.via_rpc', '1', true);
  update public.orders set payment_state = 'pending_check' where id = o.id and payment_state = 'unpaid';
  perform private.log_event(o.id, 'payment', o.status, 'Payment received, we are checking it', 'Manual MoMo transaction ' || v_txn);
  perform set_config('app.via_rpc', '', true);
  return jsonb_build_object('ok', true);
end $$;

-- Finance or an Admin matches the transaction id to the MoMo statement and confirms or rejects it.
create or replace function public.review_manual_payment(p_payment uuid, p_approve boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare
  pay public.payments%rowtype;
begin
  if not (private.has_perm('expenses', 'edit') or private.has_perm('orders', 'delete')) then
    raise exception 'You cannot review payments' using errcode = '42501';
  end if;
  select * into pay from public.payments where id = p_payment for update;
  if not found or pay.provider <> 'manual_momo' or pay.status <> 'pending_check' then raise exception 'That payment is not waiting for a check'; end if;
  if p_approve then
    perform private.apply_payment(pay.id, null, auth.uid());
  else
    update public.payments set status = 'failed', checked_by = auth.uid() where id = pay.id;
    perform set_config('app.via_rpc', '1', true);
    update public.orders set payment_state = 'unpaid' where id = pay.order_id and payment_state = 'pending_check';
    perform private.log_event(pay.order_id, 'payment', null, 'We could not match your payment. Please contact us', 'Manual MoMo payment rejected');
    perform set_config('app.via_rpc', '', true);
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Staff actions on an order
-- ---------------------------------------------------------------------------
create or replace function private.public_label(s public.order_status) returns text
language sql immutable as $$
  select case s
    -- to_confirm is internal (paid, waiting for staff), so the customer sees nothing new until it is confirmed
    when 'to_source' then 'Confirmed by Drezzy'
    when 'ready_to_pack' then 'Item received at our branch' when 'packed' then 'Checked and packed' when 'dispatched' then 'Dispatched'
    when 'out_for_delivery' then 'Out for delivery' when 'delivered' then 'Delivered' when 'failed_delivery' then 'Delivery attempt failed'
    when 'cancelled' then 'Cancelled' else null end
$$;

-- Moves an order to its next stage (FR-TR-002: forward only; FR-CO-008: no Delivered while a balance is due).
create or replace function public.advance_order(p_order uuid, p_to public.order_status, p_note text default null) returns void
language plpgsql security definer set search_path = '' as $$
declare
  o public.orders%rowtype;
begin
  select * into o from public.orders where id = p_order for update;
  if not found then raise exception 'Order not found'; end if;
  if not (private.has_perm('orders', 'edit') and private.can_see_order(o.assigned_agent_id, o.created_by)) then
    raise exception 'You cannot change this order' using errcode = '42501';
  end if;
  if o.status = p_to then return; end if;
  if o.status in ('delivered', 'cancelled') then raise exception 'This order is already %', o.status; end if;
  if o.payment_state = 'pending_check' or (o.payment_state = 'unpaid' and p_to <> 'cancelled') then
    raise exception 'Confirm the payment first';
  end if;
  if p_to = 'cancelled' then
    if o.amount_paid > 0 and not private.has_perm('orders', 'delete') then raise exception 'Only an Admin can cancel a paid order' using errcode = '42501'; end if;
  elsif p_to = 'failed_delivery' then
    if o.status not in ('dispatched', 'out_for_delivery') then raise exception 'Only a dispatched order can fail delivery'; end if;
  elsif o.status = 'failed_delivery' and p_to = 'out_for_delivery' then
    null; -- rescheduled
  elsif private.status_rank(p_to) <= private.status_rank(o.status) then
    raise exception 'Only an Admin can move an order back, with a reason' using errcode = '42501';
  end if;
  if p_to = 'delivered' and o.balance_due > 0 then
    raise exception 'Record the balance collected (GHS %) before marking it delivered', o.balance_due;
  end if;

  perform set_config('app.via_rpc', '1', true);
  update public.orders set status = p_to, assigned_dispatch_id = case when p_to in ('dispatched', 'out_for_delivery') then coalesce(assigned_dispatch_id, auth.uid()) else assigned_dispatch_id end where id = o.id;
  perform private.log_event(o.id, 'status', p_to, private.public_label(p_to), p_note);
  perform set_config('app.via_rpc', '', true);
end $$;

-- Admin override: move an order backwards, with a reason that is kept (FR-TR-002).
create or replace function public.move_order_back(p_order uuid, p_to public.order_status, p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  o public.orders%rowtype;
begin
  if not private.has_perm('orders', 'delete') then raise exception 'Only an Admin can move an order back' using errcode = '42501'; end if;
  if btrim(coalesce(p_reason, '')) = '' then raise exception 'Give a reason'; end if;
  select * into o from public.orders where id = p_order for update;
  if not found then raise exception 'Order not found'; end if;
  if private.status_rank(p_to) >= private.status_rank(o.status) then raise exception 'That is not going back'; end if;
  perform set_config('app.via_rpc', '1', true);
  update public.orders set status = p_to where id = o.id;
  perform private.log_event(o.id, 'override', p_to, null, 'Moved back to ' || p_to::text || '. Reason: ' || btrim(p_reason));
  perform set_config('app.via_rpc', '', true);
end $$;

-- The rider or dispatch records how the balance was paid (FR-CO-008): MoMo with a reference, or cash.
create or replace function public.record_balance(p_order uuid, p_method text, p_reference text default null) returns void
language plpgsql security definer set search_path = '' as $$
declare
  o public.orders%rowtype;
  v_ref text;
begin
  select * into o from public.orders where id = p_order for update;
  if not found then raise exception 'Order not found'; end if;
  if not (private.has_perm('orders', 'edit') and private.can_see_order(o.assigned_agent_id, o.created_by)) then
    raise exception 'You cannot change this order' using errcode = '42501';
  end if;
  if o.balance_due <= 0 then raise exception 'There is no balance to collect'; end if;
  if p_method not in ('momo', 'cash') then raise exception 'Choose MoMo or cash'; end if;
  if p_method = 'momo' and btrim(coalesce(p_reference, '')) = '' then raise exception 'Enter the MoMo reference'; end if;
  v_ref := o.number || '-B-' || substr(md5(random()::text || clock_timestamp()::text), 1, 6);
  insert into public.payments (order_id, kind, provider, method, reference, external_ref, amount, status)
  values (o.id, 'balance', case when p_method = 'cash' then 'cash'::public.payment_provider else 'momo'::public.payment_provider end, p_method, v_ref, nullif(btrim(p_reference), ''), o.balance_due, 'pending');
  perform private.apply_payment((select id from public.payments where reference = v_ref), null, auth.uid());
end $$;

-- A customer whose payment failed or timed out retries, optionally with another number or method (FR-CO-004).
-- The order and bag are kept; this only creates a fresh payment for the amount still due now.
create or replace function public.retry_payment(p_number text, p_phone text, p_method text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_phone text := private.norm_phone(p_phone);
  o public.orders%rowtype;
  v_due numeric(12, 2);
  v_ref text;
  v_provider public.payment_provider;
begin
  if v_phone is null then raise exception 'Enter the phone number you used at checkout'; end if;
  select ord.* into o from public.orders ord join public.customers c on c.id = ord.customer_id
    where ord.number = upper(btrim(p_number)) and c.phone = v_phone for update of ord;
  if not found then raise exception 'We could not find that order'; end if;
  if o.status <> 'awaiting_payment' or o.payment_state not in ('unpaid', 'failed') then raise exception 'This order is not waiting for payment'; end if;
  if p_method not in ('mtn', 'telecel', 'airtel', 'card', 'manual_momo') then raise exception 'Choose a payment method'; end if;
  v_due := case when o.payment_plan = 'half' then ceil(o.total * 100 / 2) / 100 else o.total end;
  v_provider := case when p_method = 'manual_momo' then 'manual_momo'::public.payment_provider else 'paystack'::public.payment_provider end;
  v_ref := o.number || '-' || substr(md5(random()::text || clock_timestamp()::text), 1, 8);
  -- older attempts stop showing as pending. If the provider later confirms one anyway (the customer did pay), the money is still recorded.
  update public.payments set status = 'failed' where order_id = o.id and kind = 'checkout' and status in ('pending', 'pending_check');
  insert into public.payments (order_id, kind, provider, method, reference, amount, status) values (o.id, 'checkout', v_provider, p_method, v_ref, v_due, 'pending');
  return jsonb_build_object('payment_reference', v_ref, 'amount', v_due, 'provider', v_provider, 'number', o.number);
end $$;

-- Staff record the payment due now when it was taken outside the website: cash in person, or a MoMo transfer
-- they have seen. The amount is whatever the order asked for at checkout, so staff cannot under-record it.
create or replace function public.record_checkout_payment(p_order uuid, p_method text, p_reference text default null) returns void
language plpgsql security definer set search_path = '' as $$
declare
  o public.orders%rowtype;
  pay public.payments%rowtype;
begin
  select * into o from public.orders where id = p_order for update;
  if not found then raise exception 'Order not found'; end if;
  if not (private.has_perm('orders', 'edit') and private.can_see_order(o.assigned_agent_id, o.created_by)) then
    raise exception 'You cannot change this order' using errcode = '42501';
  end if;
  if p_method not in ('momo', 'cash') then raise exception 'Choose MoMo or cash'; end if;
  if p_method = 'momo' and btrim(coalesce(p_reference, '')) = '' then raise exception 'Enter the MoMo transaction ID'; end if;
  select * into pay from public.payments where order_id = o.id and kind = 'checkout' and status in ('pending', 'pending_check') order by created_at desc limit 1;
  if not found then raise exception 'This order has no payment waiting'; end if;
  update public.payments set
    provider = case when p_method = 'cash' then 'cash'::public.payment_provider else 'manual_momo'::public.payment_provider end,
    method = p_method,
    external_ref = case when p_method = 'momo' then upper(btrim(p_reference)) end
  where id = pay.id;
  perform private.apply_payment(pay.id, null, auth.uid());
end $$;

-- ---------------------------------------------------------------------------
-- Row-level security (staff only; shoppers use the functions above)
-- ---------------------------------------------------------------------------
alter table public.delivery_zones enable row level security;
alter table public.customers enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.order_events enable row level security;
alter table public.payments enable row level security;
alter table public.order_notes enable row level security;

create policy zones_read on public.delivery_zones for select to anon, authenticated using (true);
create policy zones_write on public.delivery_zones for all to authenticated
  using (private.has_perm('settings', 'edit')) with check (private.has_perm('settings', 'edit'));

create policy customers_read on public.customers for select to authenticated using (
  private.has_perm('customers', 'view')
  and (private.perm_scope('customers') = 'all' or exists (select 1 from public.orders o where o.customer_id = customers.id and (o.assigned_agent_id = auth.uid() or o.created_by = auth.uid())))
);
create policy customers_update on public.customers for update to authenticated
  using (private.has_perm('customers', 'edit')) with check (private.has_perm('customers', 'edit'));

create policy orders_read on public.orders for select to authenticated using (private.can_see_order(assigned_agent_id, created_by));
create policy orders_update on public.orders for update to authenticated
  using (private.has_perm('orders', 'edit') and private.can_see_order(assigned_agent_id, created_by))
  with check (private.has_perm('orders', 'edit'));

create policy order_items_read on public.order_items for select to authenticated using (exists (select 1 from public.orders o where o.id = order_id));
create policy order_events_read on public.order_events for select to authenticated using (exists (select 1 from public.orders o where o.id = order_id));
create policy payments_read on public.payments for select to authenticated using (exists (select 1 from public.orders o where o.id = order_id));
create policy order_notes_read on public.order_notes for select to authenticated using (exists (select 1 from public.orders o where o.id = order_id));
create policy order_notes_insert on public.order_notes for insert to authenticated
  with check (private.has_perm('orders', 'edit') and author_id = auth.uid() and exists (select 1 from public.orders o where o.id = order_id));

-- Grants. Shoppers get the delivery zones and the three functions, nothing else.
revoke all on public.delivery_zones, public.customers, public.orders, public.order_items, public.order_events, public.payments, public.order_notes from anon, public;
grant select on public.delivery_zones to anon;
grant select on public.delivery_zones, public.customers, public.orders, public.order_items, public.order_events, public.payments, public.order_notes to authenticated;
grant update on public.delivery_zones, public.customers, public.orders to authenticated;
grant insert, update, delete on public.delivery_zones to authenticated;
grant insert on public.order_notes to authenticated;
grant usage on sequence public.order_number_seq to authenticated;

revoke execute on all functions in schema public from public, anon, authenticated;
grant execute on function public.place_order(jsonb) to anon, authenticated;
grant execute on function public.track_order(text, text) to anon, authenticated;
grant execute on function public.submit_manual_payment(text, text, text) to anon, authenticated;
grant execute on function public.retry_payment(text, text, text) to anon, authenticated;
grant execute on function public.advance_order(uuid, public.order_status, text) to authenticated;
grant execute on function public.move_order_back(uuid, public.order_status, text) to authenticated;
grant execute on function public.record_balance(uuid, text, text) to authenticated;
grant execute on function public.record_checkout_payment(uuid, text, text) to authenticated;
grant execute on function public.review_manual_payment(uuid, boolean) to authenticated;
grant execute on function public.confirm_payment(text, numeric, jsonb) to service_role;

revoke execute on all functions in schema private from public, anon;
grant execute on all functions in schema private to authenticated;

-- ---------------------------------------------------------------------------
-- Audit: orders and payments are money
-- ---------------------------------------------------------------------------
-- audit_row also understands tables keyed by region (delivery zones).
create or replace function private.audit_row() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_old jsonb := case when tg_op = 'INSERT' then null else to_jsonb(old) end;
  v_new jsonb := case when tg_op = 'DELETE' then null else to_jsonb(new) end;
  v_row jsonb := coalesce(v_new, v_old);
  v_name text;
  v_role text;
begin
  if tg_op = 'UPDATE' and v_old = v_new then
    return new;
  end if;

  select s.full_name, r.key into v_name, v_role
  from public.staff s join public.roles r on r.id = s.role_id
  where s.id = auth.uid();

  insert into public.audit_log (actor_id, actor_name, actor_role, action, table_name, record_id, old_values, new_values)
  values (
    auth.uid(), v_name, v_role, tg_op, tg_table_name,
    coalesce(
      v_row ->> 'id',
      case when v_row ? 'role_id' then (v_row ->> 'role_id') || ':' || coalesce(v_row ->> 'module', '') end,
      case when v_row ? 'variant_id' then (v_row ->> 'variant_id') || ':' || coalesce(v_row ->> 'supplier_id', '') end,
      v_row ->> 'region'
    ),
    v_old, v_new
  );
  return coalesce(new, old);
end $$;
revoke execute on function private.audit_row() from public, anon;

create trigger orders_audit after insert or update or delete on public.orders for each row execute function private.audit_row();
create trigger payments_audit after insert or update or delete on public.payments for each row execute function private.audit_row();
create trigger delivery_zones_audit after insert or update or delete on public.delivery_zones for each row execute function private.audit_row();
