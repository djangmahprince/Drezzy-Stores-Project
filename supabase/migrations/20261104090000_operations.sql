-- Operations (PRD sections 12, 14, 15 and 17): settings, in-app alerts for staff, riders and the partner portal,
-- order actions the PRD lists (reassign, rider assignment, could-not-source outcome, delivery with code or override,
-- payment links), rider cash, the CRM (directory, 360 view, merge, import) and saved views.

-- ---------------------------------------------------------------------------
-- Settings (thresholds and switches the Owner and Admins can change without a developer)
-- ---------------------------------------------------------------------------
create table public.app_settings (
  key text primary key check (key ~ '^[a-z_]{2,40}$'),
  value jsonb not null,
  updated_by uuid references auth.users (id) on delete set null,
  updated_at timestamptz not null default now()
);

insert into public.app_settings (key, value) values
  ('alerts', '{"confirm_hours": 2, "supplier_place_hours": 24, "dispatch_hours": 24, "stale_days": 7, "report_cutoff_hour": 18, "pace_threshold": 0.7, "feedback_after_hours": 24, "abandoned_after_hours": 2}'),
  ('delivery', '{"require_delivery_code": false}'),
  ('loyalty', '{"ghs_per_point": 10}'),
  ('leaderboard', '{"roles": []}'),
  ('retention', '{"inactive_review_years": 3, "events_aggregate_months": 24, "logs_months": 12}'),
  ('alert_routes', '{
     "new_order": ["owner", "admin", "sales_agent"], "payment_failed": ["owner", "admin", "sales_agent"],
     "manual_payment": ["owner", "admin", "finance"], "to_source": ["owner", "admin", "sourcing_officer"],
     "ready_to_pack": ["admin", "dispatch_coordinator"], "support": ["admin", "customer_support"],
     "refund_requested": ["owner", "admin", "finance"], "stuck": ["owner", "admin"], "supplier_late": ["admin", "sourcing_officer"],
     "stale_availability": ["sourcing_officer"], "report_missing": ["owner", "admin"], "budget": ["owner", "finance"],
     "pace": ["owner", "admin"], "data_request": ["admin", "customer_support"], "balances_today": ["dispatch_coordinator"],
     "rider_cash": ["finance"], "export": []
   }'),
  ('reports', '{"daily_summary_to": ["owner"], "weekly_report_to": ["owner", "admin"]}')
on conflict (key) do nothing;

create or replace function private.setting(p_key text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce((select value from public.app_settings where key = p_key), '{}'::jsonb)
$$;

alter table public.app_settings enable row level security;
create policy app_settings_read on public.app_settings for select to authenticated using (private.is_staff());
create policy app_settings_write on public.app_settings for update to authenticated using (private.has_perm('settings', 'edit')) with check (private.has_perm('settings', 'edit'));
revoke all on public.app_settings from anon, authenticated, public;
grant select, update on public.app_settings to authenticated;
create trigger app_settings_audit after update on public.app_settings for each row execute function private.audit_row();

-- audit_row learns tables keyed by "key" and by "staff_id"
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
      v_row ->> 'region',
      v_row ->> 'supplier_order_id',
      v_row ->> 'key',
      v_row ->> 'month',
      v_row ->> 'order_id'
    ),
    v_old, v_new
  );
  return coalesce(new, old);
end $$;
revoke execute on function private.audit_row() from public, anon;

-- loyalty reads its rate from settings now
create or replace function private.award_points() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid;
  v_rate numeric := greatest(coalesce((private.setting('loyalty') ->> 'ghs_per_point')::numeric, 10), 1);
begin
  if new.status = 'delivered' and old.status is distinct from 'delivered' then
    select auth_user_id into v_user from public.customers where id = new.customer_id;
    if v_user is not null and floor(new.total / v_rate) > 0 then
      insert into public.loyalty_entries (user_id, points, reason, order_id) values (v_user, floor(new.total / v_rate)::int, 'Order delivered', new.id)
      on conflict do nothing;
    end if;
  end if;
  if new.status = 'delivered' and new.delivered_at is null then
    new.delivered_at := now();
  end if;
  return new;
end $$;

-- ---------------------------------------------------------------------------
-- Staff records: start date, employment status, team (PRD FR-DATA-002, FR-DB-010). No attendance or shifts.
-- ---------------------------------------------------------------------------
alter table public.staff
  add column if not exists start_date date,
  add column if not exists employment_status text not null default 'active' check (employment_status in ('active', 'on_leave', 'inactive')),
  add column if not exists team text check (char_length(team) <= 40);

-- ---------------------------------------------------------------------------
-- In-app alerts for staff (PRD FR-DB-006, section 18 staff messages)
-- ---------------------------------------------------------------------------
create table public.staff_alerts (
  id bigint generated always as identity primary key,
  staff_id uuid not null references public.staff (id) on delete cascade,
  kind text not null,
  title text not null,
  body text,
  link text,
  dedupe_key text unique,
  created_at timestamptz not null default now(),
  read_at timestamptz
);
create index staff_alerts_inbox_idx on public.staff_alerts (staff_id, created_at desc);

alter table public.staff_alerts enable row level security;
create policy staff_alerts_own on public.staff_alerts for select to authenticated using (staff_id = auth.uid() and private.is_staff());
create policy staff_alerts_mark on public.staff_alerts for update to authenticated using (staff_id = auth.uid() and private.is_staff()) with check (staff_id = auth.uid());
revoke all on public.staff_alerts from anon, authenticated, public;
grant select on public.staff_alerts to authenticated;
grant update (read_at) on public.staff_alerts to authenticated;

create or replace function private.alert_staff(p_staff uuid, p_kind text, p_title text, p_body text, p_link text, p_dedupe text default null) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if p_staff is null or not exists (select 1 from public.staff where id = p_staff and active) then return; end if;
  insert into public.staff_alerts (staff_id, kind, title, body, link, dedupe_key)
  values (p_staff, p_kind, left(p_title, 160), left(p_body, 500), p_link, case when p_dedupe is not null then p_dedupe || ':' || p_staff end)
  on conflict (dedupe_key) do nothing;
end $$;

-- Sends an alert to everyone whose role is on the route (Settings → alert routes).
create or replace function private.alert_route(p_route text, p_title text, p_body text, p_link text, p_dedupe text default null) returns void
language plpgsql security definer set search_path = '' as $$
declare
  r record;
begin
  for r in
    select s.id from public.staff s join public.roles ro on ro.id = s.role_id
    where s.active and s.employment_status <> 'inactive'
      and ro.key in (select jsonb_array_elements_text(coalesce(private.setting('alert_routes') -> p_route, '[]'::jsonb)))
  loop
    perform private.alert_staff(r.id, p_route, p_title, p_body, p_link, p_dedupe);
  end loop;
end $$;

-- Order and payment events become alerts.
create or replace function private.order_alerts() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_link text := '/dashboard/orders/' || new.id;
begin
  if new.payment_state in ('paid', 'part_paid') and old.payment_state not in ('paid', 'part_paid') and old.status = 'awaiting_payment' then
    perform private.alert_route('new_order', 'New paid order ' || new.number, 'GHS ' || new.amount_paid || ' paid · ' || coalesce(new.region, 'pickup') || ' · confirm within the hour', v_link, 'paid:' || new.id);
  end if;
  if new.status = 'to_source' and old.status is distinct from 'to_source' then
    perform private.alert_route('to_source', 'Supplier order to place · ' || new.number, 'The order is confirmed and waiting for a supplier order.', v_link, 'src:' || new.id);
  end if;
  if new.status = 'ready_to_pack' and old.status is distinct from 'ready_to_pack' then
    perform private.alert_route('ready_to_pack', 'Ready to pack · ' || new.number, 'Everything has arrived at the branch.', v_link, 'pack:' || new.id);
  end if;
  if new.assigned_agent_id is distinct from old.assigned_agent_id and new.assigned_agent_id is not null and new.assigned_agent_id is distinct from auth.uid() then
    perform private.alert_staff(new.assigned_agent_id, 'assigned', 'Order ' || new.number || ' was assigned to you', null, v_link, 'agent:' || new.id || ':' || new.updated_at);
  end if;
  if new.assigned_dispatch_id is distinct from old.assigned_dispatch_id and new.assigned_dispatch_id is not null and new.assigned_dispatch_id is distinct from auth.uid() then
    perform private.alert_staff(new.assigned_dispatch_id, 'assigned', 'Delivery of ' || new.number || ' was assigned to you', null, v_link, 'disp:' || new.id || ':' || new.updated_at);
  end if;
  return new;
end $$;
create trigger orders_alerts after update on public.orders for each row execute function private.order_alerts();

create or replace function private.payment_alerts() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_number text := (select number from public.orders where id = new.order_id);
begin
  if new.status = 'pending_check' and old.status is distinct from 'pending_check' then
    perform private.alert_route('manual_payment', 'Manual MoMo payment to check · ' || v_number, 'Transaction ' || coalesce(new.external_ref, '') || ' for GHS ' || new.amount, '/dashboard/orders/' || new.order_id, 'chk:' || new.id);
  end if;
  if new.status = 'failed' and old.status = 'pending' and new.kind = 'checkout' and new.raw is not null then
    perform private.alert_route('payment_failed', 'Payment failed · ' || v_number, 'Follow up with the customer on WhatsApp.', '/dashboard/orders/' || new.order_id, 'fail:' || new.id);
  end if;
  return new;
end $$;
create trigger payments_alerts after update on public.payments for each row execute function private.payment_alerts();

create or replace function private.support_alerts() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if not new.from_staff then
    perform private.alert_route('support', 'New customer message', left(new.body, 140), '/dashboard/support?thread=' || new.thread_id, 'msg:' || new.id);
  end if;
  return new;
end $$;
create trigger support_messages_alerts after insert on public.support_messages for each row execute function private.support_alerts();

create or replace function private.refund_alerts() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform private.alert_route('refund_requested', 'Refund to decide · GHS ' || new.amount, new.reason, '/dashboard/orders/' || new.order_id, 'rf:' || new.id);
  return new;
end $$;
create trigger refunds_alerts after insert on public.refunds for each row execute function private.refund_alerts();

create or replace function private.data_request_alerts() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform private.alert_route('data_request', 'Data request: ' || replace(new.kind, '_', ' '), 'Answer within 30 days.', '/dashboard/customers/requests', 'dr:' || new.id);
  return new;
end $$;
create trigger data_requests_alerts after insert on public.data_requests for each row execute function private.data_request_alerts();

create or replace function private.target_alerts() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.staff_id is not null then
    perform private.alert_staff(new.staff_id, 'target', 'A new target was set for you', replace(new.metric::text, '_', ' ') || ': ' || new.goal || ' by ' || to_char(new.period_end, 'DD Mon'), '/dashboard/staff', 'tg:' || new.id);
  end if;
  return new;
end $$;
create trigger targets_alerts after insert on public.targets for each row execute function private.target_alerts();

-- A staff sign-in from a device we have not seen before (PRD section 18: "new sign-in from a new device").
create table public.staff_devices (
  staff_id uuid not null references public.staff (id) on delete cascade,
  device_hash text not null check (char_length(device_hash) between 16 and 128),
  label text check (char_length(label) <= 120),
  first_seen timestamptz not null default now(),
  last_seen timestamptz not null default now(),
  primary key (staff_id, device_hash)
);
alter table public.staff_devices enable row level security;
create policy staff_devices_own on public.staff_devices for select to authenticated using (staff_id = auth.uid());
revoke all on public.staff_devices from anon, authenticated, public;
grant select on public.staff_devices to authenticated;

create or replace function public.note_sign_in(p_hash text, p_label text) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  v_known boolean;
  v_any boolean;
begin
  if not private.is_staff() then return false; end if;
  select exists (select 1 from public.staff_devices where staff_id = auth.uid()), exists (select 1 from public.staff_devices where staff_id = auth.uid() and device_hash = p_hash)
    into v_any, v_known;
  insert into public.staff_devices (staff_id, device_hash, label) values (auth.uid(), p_hash, left(p_label, 120))
    on conflict (staff_id, device_hash) do update set last_seen = now();
  if v_any and not v_known then
    perform private.alert_staff(auth.uid(), 'security', 'New sign-in from a new device', coalesce(left(p_label, 120), 'Unknown device') || '. If this was not you, change your password now.', '/dashboard/account', 'dev:' || p_hash);
  end if;
  return not v_known;
end $$;

-- ---------------------------------------------------------------------------
-- Riders, couriers and partners (PRD FR-ORD-006, FR-TG-010 partner portal)
-- ---------------------------------------------------------------------------
create table public.riders (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 80),
  phone text check (phone is null or phone ~ '^\+233[0-9]{9}$'),
  kind text not null default 'rider' check (kind in ('rider', 'courier', 'affiliate')),
  company text check (char_length(company) <= 60),
  region text,
  branch public.app_branch not null default 'accra',
  user_id uuid unique references auth.users (id) on delete set null,
  active boolean not null default true,
  notes text,
  created_at timestamptz not null default now()
);
alter table public.orders add column if not exists rider_id uuid references public.riders (id) on delete set null;
alter table public.payments add column if not exists collected_by_rider uuid references public.riders (id) on delete set null;
create index if not exists orders_rider_idx on public.orders (rider_id);

-- Full order access (not "own records only"): Owner, Admin, Dispatch, Support
create or replace function private.orders_full() returns boolean
language sql stable security definer set search_path = '' as $$
  select private.has_perm('orders', 'edit') and private.perm_scope('orders') = 'all'
$$;

alter table public.riders enable row level security;
create policy riders_read on public.riders for select to authenticated using (private.has_perm('orders', 'view') or user_id = auth.uid());
create policy riders_write on public.riders for all to authenticated using (private.orders_full()) with check (private.orders_full());
revoke all on public.riders from anon, authenticated, public;
grant select, insert, update, delete on public.riders to authenticated;
create trigger riders_audit after insert or update or delete on public.riders for each row execute function private.audit_row();

create table public.rider_cash_handovers (
  id uuid primary key default gen_random_uuid(),
  rider_id uuid not null references public.riders (id) on delete restrict,
  day date not null,
  handed_in numeric(12, 2) not null check (handed_in >= 0),
  note text check (char_length(note) <= 300),
  checked_by uuid references auth.users (id) on delete set null,
  checked_by_name text,
  created_at timestamptz not null default now(),
  unique (rider_id, day)
);
alter table public.rider_cash_handovers enable row level security;
create policy handovers_read on public.rider_cash_handovers for select to authenticated using (private.has_perm('expenses', 'view') and private.expense_categories() is null);
revoke all on public.rider_cash_handovers from anon, authenticated, public;
grant select on public.rider_cash_handovers to authenticated;
create trigger handovers_audit after insert or update or delete on public.rider_cash_handovers for each row execute function private.audit_row();

-- Finance reconciles what each rider collected in cash against what they handed in (FR-FIN-006).
create or replace function public.record_handover(p_rider uuid, p_day date, p_amount numeric, p_note text default null) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not (private.has_perm('expenses', 'edit') and private.expense_categories() is null) then
    raise exception 'Only Finance records cash handed in' using errcode = '42501';
  end if;
  if p_amount is null or p_amount < 0 then raise exception 'Enter the amount handed in'; end if;
  if p_day is null or p_day > current_date then raise exception 'Choose the day'; end if;
  insert into public.rider_cash_handovers (rider_id, day, handed_in, note, checked_by, checked_by_name)
  values (p_rider, p_day, round(p_amount, 2), nullif(btrim(coalesce(p_note, '')), ''), auth.uid(), private.staff_name())
  on conflict (rider_id, day) do update set handed_in = excluded.handed_in, note = excluded.note, checked_by = excluded.checked_by, checked_by_name = excluded.checked_by_name;
end $$;

create or replace function public.rider_cash(p_day date) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not ((private.has_perm('expenses', 'view') and private.expense_categories() is null) or private.orders_full()) then
    raise exception 'You cannot see rider cash' using errcode = '42501';
  end if;
  return coalesce((select jsonb_agg(x order by x ->> 'name') from (
    select jsonb_build_object('rider_id', r.id, 'name', r.name, 'phone', r.phone,
      'collected', coalesce((select sum(p.amount) from public.payments p where p.collected_by_rider = r.id and p.provider = 'cash' and p.status = 'success' and p.confirmed_at::date = p_day), 0),
      'handed_in', h.handed_in, 'checked_by', h.checked_by_name, 'note', h.note) x
    from public.riders r left join public.rider_cash_handovers h on h.rider_id = r.id and h.day = p_day
    where r.active or h.id is not null
  ) t), '[]'::jsonb);
end $$;

-- Balance collection now records which rider took the cash.
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
  insert into public.payments (order_id, kind, provider, method, reference, external_ref, amount, status, collected_by_rider)
  values (o.id, 'balance', case when p_method = 'cash' then 'cash'::public.payment_provider else 'momo'::public.payment_provider end, p_method, v_ref,
          nullif(btrim(p_reference), ''), o.balance_due, 'pending', case when p_method = 'cash' then o.rider_id end);
  perform private.apply_payment((select id from public.payments where reference = v_ref), null, auth.uid());
end $$;

-- ---------------------------------------------------------------------------
-- Order actions
-- ---------------------------------------------------------------------------
-- Reassign the sales agent who gets credit (Admin, Owner).
create or replace function public.reassign_order(p_order uuid, p_agent uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_name text;
  o public.orders%rowtype;
begin
  if not private.has_perm('orders', 'delete') then raise exception 'Only an Admin can reassign orders' using errcode = '42501'; end if;
  select * into o from public.orders where id = p_order for update;
  if not found then raise exception 'Order not found'; end if;
  select full_name into v_name from public.staff where id = p_agent and active;
  if v_name is null then raise exception 'Choose an active staff member'; end if;
  perform set_config('app.via_rpc', '1', true);
  update public.orders set assigned_agent_id = p_agent, agent_name = v_name where id = p_order;
  perform private.log_event(p_order, 'note', null, null, 'Reassigned from ' || coalesce(o.agent_name, 'nobody') || ' to ' || v_name);
  perform set_config('app.via_rpc', '', true);
end $$;

-- Give the order to a rider or courier, with tracking details.
create or replace function public.assign_rider(p_order uuid, p_rider uuid, p_courier text default null, p_tracking text default null) returns void
language plpgsql security definer set search_path = '' as $$
declare
  r public.riders%rowtype;
  o public.orders%rowtype;
begin
  if not private.orders_full() then raise exception 'You cannot assign deliveries' using errcode = '42501'; end if;
  select * into o from public.orders where id = p_order for update;
  if not found then raise exception 'Order not found'; end if;
  if o.status in ('delivered', 'cancelled') then raise exception 'This order is already %', o.status; end if;
  if p_rider is not null then
    select * into r from public.riders where id = p_rider and active;
    if not found then raise exception 'Choose an active rider or courier'; end if;
  end if;
  update public.orders set rider_id = p_rider, rider_name = r.name, rider_phone = r.phone,
    courier = coalesce(nullif(btrim(coalesce(p_courier, '')), ''), case when r.kind = 'courier' then coalesce(r.company, r.name) end, courier),
    tracking_number = coalesce(nullif(btrim(coalesce(p_tracking, '')), ''), tracking_number),
    assigned_dispatch_id = coalesce(assigned_dispatch_id, auth.uid())
  where id = p_order;
  perform private.log_event(p_order, 'note', null, null, 'Delivery assigned to ' || coalesce(r.name, 'nobody'));
end $$;

-- No supplier could provide an item: tell the customer at once, with the alternative or a refund (FR-CO-011, AC-06).
create or replace function public.set_sourcing_outcome(p_order uuid, p_outcome text, p_note text default null) returns void
language plpgsql security definer set search_path = '' as $$
declare
  o public.orders%rowtype;
  v_public text;
begin
  if not (private.has_perm('availability', 'edit') or private.orders_full()) then raise exception 'You cannot record sourcing outcomes' using errcode = '42501'; end if;
  if p_outcome not in ('alternative_offered', 'alternative_accepted', 'refund') then raise exception 'Choose alternative or refund'; end if;
  select * into o from public.orders where id = p_order for update;
  if not found then raise exception 'Order not found'; end if;
  if not exists (select 1 from public.order_items where order_id = o.id and sourcing = 'failed') then
    raise exception 'Mark the supplier order as failed first';
  end if;
  if p_outcome = 'alternative_offered' and char_length(btrim(coalesce(p_note, ''))) < 3 then raise exception 'Describe the alternative you are offering'; end if;
  v_public := case p_outcome
    when 'alternative_offered' then 'We could not get your item from our suppliers. We are offering an alternative: ' || btrim(p_note) || '. Reply on WhatsApp to accept, or ask for a full refund'
    when 'alternative_accepted' then 'Thank you for accepting the alternative. We are getting it for you now'
    else 'We could not get your item from our suppliers. A full refund of what you paid is on its way' end;
  perform set_config('app.via_rpc', '1', true);
  update public.orders set sourcing_outcome = p_outcome, alternative_note = coalesce(nullif(btrim(coalesce(p_note, '')), ''), alternative_note) where id = o.id;
  insert into public.order_events (order_id, kind, status, actor_id, actor_name, public_note, internal_note)
  values (o.id, 'supplier', o.status, auth.uid(), private.staff_name(), v_public, 'Sourcing outcome: ' || p_outcome);
  if p_outcome = 'alternative_accepted' then
    update public.order_items set sourcing = 'pending' where order_id = o.id and sourcing = 'failed';
  end if;
  if p_outcome = 'refund' and o.amount_paid > 0
     and not exists (select 1 from public.refunds where order_id = o.id and status in ('requested', 'approved', 'paid')) then
    insert into public.refunds (order_id, amount, reason, requested_by, requested_by_name)
    values (o.id, o.amount_paid, 'Could not source the item', auth.uid(), private.staff_name());
  end if;
  perform set_config('app.via_rpc', '', true);
end $$;

-- Moving an order to Delivered with the plain status action is refused when the delivery code is required: staff use
-- deliver_order, which checks the code or the photo. Everything else is as before (FR-TR-002, FR-CO-008).
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
  if p_to = 'delivered' and coalesce((private.setting('delivery') ->> 'require_delivery_code')::boolean, false) then
    raise exception 'Enter the customer''s delivery code (or add a photo) to mark it delivered';
  end if;

  perform set_config('app.via_rpc', '1', true);
  update public.orders set status = p_to, assigned_dispatch_id = case when p_to in ('dispatched', 'out_for_delivery') then coalesce(assigned_dispatch_id, auth.uid()) else assigned_dispatch_id end where id = o.id;
  perform private.log_event(o.id, 'status', p_to, private.public_label(p_to), p_note);
  perform set_config('app.via_rpc', '', true);
end $$;

-- Mark delivered (FR-CO-005, FR-ORD-011): the customer's delivery code or a photo, and the balance collected,
-- unless an Admin overrides with a reason that is kept.
create or replace function public.deliver_order(p_order uuid, p_code text default null, p_proof text default null, p_override text default null) returns void
language plpgsql security definer set search_path = '' as $$
declare
  o public.orders%rowtype;
  v_override boolean := char_length(btrim(coalesce(p_override, ''))) >= 3;
  v_need_code boolean := coalesce((private.setting('delivery') ->> 'require_delivery_code')::boolean, false);
begin
  select * into o from public.orders where id = p_order for update;
  if not found then raise exception 'Order not found'; end if;
  if not (private.has_perm('orders', 'edit') and private.can_see_order(o.assigned_agent_id, o.created_by)) then
    raise exception 'You cannot change this order' using errcode = '42501';
  end if;
  if o.status not in ('dispatched', 'out_for_delivery') then raise exception 'Only an order on its way can be delivered'; end if;
  if v_override and not private.has_perm('orders', 'delete') then raise exception 'Only an Admin can override' using errcode = '42501'; end if;
  if p_code is not null and btrim(p_code) <> '' and btrim(p_code) <> o.delivery_code then raise exception 'That delivery code is not right'; end if;
  if v_need_code and not v_override and coalesce(btrim(p_code), '') = '' and p_proof is null then
    raise exception 'Enter the customer''s delivery code or add a photo';
  end if;
  if p_proof is not null and (p_proof not like o.id::text || '/%' or p_proof like '%..%') then raise exception 'That photo does not belong to this order'; end if;
  if o.balance_due > 0 and not v_override then
    raise exception 'Record the balance collected (GHS %) before marking it delivered', o.balance_due;
  end if;
  perform set_config('app.via_rpc', '1', true);
  update public.orders set status = 'delivered', proof_path = coalesce(p_proof, proof_path) where id = o.id;
  perform private.log_event(o.id, 'status', 'delivered', 'Delivered',
    concat_ws('. ', case when coalesce(btrim(p_code), '') <> '' then 'Delivery code checked' end, case when p_proof is not null then 'Photo proof attached' end,
              case when v_override then 'Admin override: ' || btrim(p_override) || case when o.balance_due > 0 then ' (balance GHS ' || o.balance_due || ' not collected)' else '' end end));
  perform set_config('app.via_rpc', '', true);
end $$;

-- A payment link for the amount still due, which staff paste into WhatsApp (FR-CO-009). The app turns the
-- reference into a Paystack link; the webhook confirms it like any other payment.
create or replace function public.create_payment_link(p_order uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  o public.orders%rowtype;
  pay public.payments%rowtype;
  v_ref text;
  v_email text;
begin
  select * into o from public.orders where id = p_order for update;
  if not found then raise exception 'Order not found'; end if;
  if not (private.has_perm('orders', 'edit') and private.can_see_order(o.assigned_agent_id, o.created_by)) then
    raise exception 'You cannot change this order' using errcode = '42501';
  end if;
  select email into v_email from public.customers where id = o.customer_id;
  if o.status = 'awaiting_payment' then
    select * into pay from public.payments where order_id = o.id and kind = 'checkout' and status = 'pending' order by created_at desc limit 1;
    if not found then raise exception 'This order has no payment waiting'; end if;
    update public.payments set provider = 'paystack', method = 'link' where id = pay.id;
    return jsonb_build_object('reference', pay.reference, 'amount', pay.amount, 'email', v_email, 'number', o.number);
  end if;
  if o.balance_due <= 0 or o.status in ('cancelled', 'delivered') then raise exception 'Nothing is owed on this order'; end if;
  update public.payments set status = 'failed' where order_id = o.id and kind = 'balance' and status = 'pending' and provider = 'paystack';
  v_ref := o.number || '-L-' || substr(md5(random()::text || clock_timestamp()::text), 1, 8);
  insert into public.payments (order_id, kind, provider, method, reference, amount, status) values (o.id, 'balance', 'paystack', 'link', v_ref, o.balance_due, 'pending');
  return jsonb_build_object('reference', v_ref, 'amount', o.balance_due, 'email', v_email, 'number', o.number);
end $$;

-- ---------------------------------------------------------------------------
-- Partner portal (P1): a rider or courier agent signs in and sees only their own jobs
-- ---------------------------------------------------------------------------
create or replace function private.my_rider() returns uuid
language sql stable security definer set search_path = '' as $$
  select id from public.riders where user_id = auth.uid() and active
$$;

create or replace function public.partner_jobs() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_rider uuid := private.my_rider();
begin
  if v_rider is null then raise exception 'This login is not a delivery partner' using errcode = '42501'; end if;
  return jsonb_build_object(
    'rider', (select jsonb_build_object('name', name, 'kind', kind) from public.riders where id = v_rider),
    'jobs', coalesce((select jsonb_agg(jsonb_build_object('id', o.id, 'number', o.number, 'status', o.status,
        'receiver', coalesce(o.receiver_name, c.full_name), 'phone', coalesce(o.receiver_phone, c.phone),
        'region', o.region, 'city', o.city, 'area', o.area, 'street', o.street, 'landmark', o.landmark, 'gps', o.gps_code, 'note', o.rider_note,
        'balance', o.balance_due, 'est', o.est_delivery_date) order by o.est_delivery_date nulls last)
      from public.orders o join public.customers c on c.id = o.customer_id
      where o.rider_id = v_rider and (o.status in ('packed', 'dispatched', 'out_for_delivery', 'failed_delivery') or (o.status = 'delivered' and o.delivered_at > now() - interval '1 day'))), '[]'::jsonb),
    'week', jsonb_build_object(
      'delivered', (select count(*) from public.orders where rider_id = v_rider and status = 'delivered' and delivered_at >= date_trunc('week', now())),
      'on_time', (select count(*) from public.orders where rider_id = v_rider and status = 'delivered' and delivered_at >= date_trunc('week', now()) and delivered_at::date <= est_delivery_date),
      'cash', (select coalesce(sum(amount), 0) from public.payments where collected_by_rider = v_rider and status = 'success' and confirmed_at >= date_trunc('week', now()))),
    'targets', coalesce((select jsonb_agg(jsonb_build_object('metric', t.metric, 'goal', t.goal, 'from', t.period_start, 'to', t.period_end)) from public.targets t
                         where t.rider_id = v_rider and t.period_end >= current_date), '[]'::jsonb));
end $$;

-- What a partner may do with their own job: set out, fail an attempt, collect the balance and deliver with the code.
create or replace function public.partner_update(p_order uuid, p_action text, p_code text default null, p_method text default null, p_reference text default null, p_note text default null) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_rider uuid := private.my_rider();
  o public.orders%rowtype;
  v_ref text;
begin
  if v_rider is null then raise exception 'This login is not a delivery partner' using errcode = '42501'; end if;
  select * into o from public.orders where id = p_order and rider_id = v_rider for update;
  if not found then raise exception 'That job is not yours'; end if;
  perform set_config('app.via_rpc', '1', true);
  if p_action = 'out_for_delivery' then
    if o.status not in ('packed', 'dispatched', 'failed_delivery') then raise exception 'This job cannot set out now'; end if;
    update public.orders set status = 'out_for_delivery' where id = o.id;
    insert into public.order_events (order_id, kind, status, actor_name, public_note, internal_note) values (o.id, 'status', 'out_for_delivery', (select name from public.riders where id = v_rider), 'Out for delivery', 'By partner');
  elsif p_action = 'failed' then
    if o.status not in ('dispatched', 'out_for_delivery') then raise exception 'Only a job on its way can fail'; end if;
    if char_length(btrim(coalesce(p_note, ''))) < 3 then raise exception 'Say what happened'; end if;
    update public.orders set status = 'failed_delivery' where id = o.id;
    insert into public.order_events (order_id, kind, status, actor_name, public_note, internal_note) values (o.id, 'status', 'failed_delivery', (select name from public.riders where id = v_rider), 'Delivery attempt failed', btrim(p_note));
  elsif p_action = 'collect' then
    if o.balance_due <= 0 then raise exception 'There is no balance to collect'; end if;
    if p_method not in ('cash', 'momo') or (p_method = 'momo' and btrim(coalesce(p_reference, '')) = '') then raise exception 'Choose cash, or MoMo with the reference'; end if;
    v_ref := o.number || '-B-' || substr(md5(random()::text || clock_timestamp()::text), 1, 6);
    insert into public.payments (order_id, kind, provider, method, reference, external_ref, amount, status, collected_by_rider)
    values (o.id, 'balance', case when p_method = 'cash' then 'cash'::public.payment_provider else 'momo'::public.payment_provider end, p_method, v_ref, nullif(btrim(p_reference), ''), o.balance_due, 'pending', v_rider);
    perform private.apply_payment((select id from public.payments where reference = v_ref), null, null);
  elsif p_action = 'delivered' then
    if o.status not in ('dispatched', 'out_for_delivery') then raise exception 'Only a job on its way can be delivered'; end if;
    if btrim(coalesce(p_code, '')) <> o.delivery_code then raise exception 'Ask the customer for their 4-digit delivery code'; end if;
    if o.balance_due > 0 then raise exception 'Collect the balance (GHS %) first', o.balance_due; end if;
    update public.orders set status = 'delivered' where id = o.id;
    insert into public.order_events (order_id, kind, status, actor_name, public_note, internal_note) values (o.id, 'status', 'delivered', (select name from public.riders where id = v_rider), 'Delivered', 'Delivery code checked by partner');
  else
    raise exception 'Unknown action';
  end if;
  perform set_config('app.via_rpc', '', true);
end $$;

-- targets can belong to a partner too (FR-TG-010)
alter table public.targets add column if not exists rider_id uuid references public.riders (id) on delete cascade;

-- ---------------------------------------------------------------------------
-- CRM: directory, 360 view, merge and import (PRD section 17)
-- ---------------------------------------------------------------------------
create table public.customer_merges (
  id bigint generated always as identity primary key,
  kept_id uuid not null references public.customers (id),
  merged_id uuid not null references public.customers (id),
  reason text not null,
  by_id uuid references auth.users (id) on delete set null,
  by_name text,
  at timestamptz not null default now()
);
alter table public.customer_merges enable row level security;
create policy merges_read on public.customer_merges for select to authenticated using (private.customers_full());
revoke all on public.customer_merges from anon, authenticated, public;
grant select on public.customer_merges to authenticated;

-- One person's ids: the record and everything merged into it.
create or replace function private.customer_group(p_id uuid) returns uuid[]
language sql stable security definer set search_path = '' as $$
  select array_agg(id) from public.customers where id = p_id or merged_into = p_id
$$;

-- Can the signed-in staff member see this customer? "Own" means a customer on one of their orders.
create or replace function private.can_see_customer(p_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select private.has_perm('customers', 'view') and (private.perm_scope('customers') = 'all'
    or exists (select 1 from public.orders o where o.customer_id = any (private.customer_group(p_id)) and (o.assigned_agent_id = auth.uid() or o.created_by = auth.uid())))
$$;

-- The customer list with lifetime value, orders and last order, searchable and filterable (FR-DATA-001).
create or replace function public.customer_directory(p jsonb default '{}'::jsonb) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_q text := nullif(btrim(coalesce(p ->> 'q', '')), '');
  v_limit int := greatest(1, least(coalesce((p ->> 'limit')::int, 50), 500));
  v_offset int := greatest(0, coalesce((p ->> 'offset')::int, 0));
  v_sort text := coalesce(p ->> 'sort', 'last_order');
  v_delivery_only boolean := coalesce((select rp.restriction ilike 'delivery%' from public.role_permissions rp where rp.role_id = private.my_role() and rp.module = 'customers'), false);
  v_money boolean := private.has_perm('expenses', 'view') or private.has_perm('orders', 'delete') or private.customers_full();
  v_rows jsonb;
  v_total int;
begin
  if not private.has_perm('customers', 'view') then raise exception 'You cannot see customers' using errcode = '42501'; end if;
  with base as (
    select c.id, c.full_name, c.phone, c.email, c.region, c.source, c.tags, c.marketing_consent, c.created_at, c.birthday, c.auth_user_id is not null as has_account,
      (select count(*) from public.orders o where o.customer_id = any (private.customer_group(c.id)) and o.amount_paid > 0 and o.status <> 'cancelled') as orders,
      (select coalesce(sum(o.amount_paid), 0) from public.orders o where o.customer_id = any (private.customer_group(c.id)) and o.status <> 'cancelled') as spend,
      (select max(o.created_at) from public.orders o where o.customer_id = any (private.customer_group(c.id))) as last_order,
      (select coalesce(sum(o.balance_due), 0) from public.orders o where o.customer_id = any (private.customer_group(c.id)) and o.payment_state = 'part_paid' and o.status <> 'cancelled') as balance
    from public.customers c
    where c.merged_into is null and c.erased_at is null and private.can_see_customer(c.id)
      and (v_q is null or c.full_name ilike '%' || v_q || '%' or c.phone like '%' || regexp_replace(v_q, '\D', '', 'g') || '%' and regexp_replace(v_q, '\D', '', 'g') <> '' or c.email ilike '%' || v_q || '%')
      and (nullif(p ->> 'region', '') is null or c.region = p ->> 'region')
      and (nullif(p ->> 'source', '') is null or c.source = p ->> 'source')
      and (nullif(p ->> 'tag', '') is null or (p ->> 'tag') = any (c.tags))
      and (nullif(p ->> 'birthday_month', '') is null or extract(month from c.birthday) = (p ->> 'birthday_month')::int)
  ), filtered as (
    select * from base
    where (nullif(p ->> 'min_spend', '') is null or spend >= (p ->> 'min_spend')::numeric)
      and (nullif(p ->> 'last_after', '') is null or last_order >= (p ->> 'last_after')::date)
      and (nullif(p ->> 'last_before', '') is null or last_order < (p ->> 'last_before')::date + 1)
      and (not coalesce((p ->> 'with_balance')::boolean, false) or balance > 0)
      and (not coalesce((p ->> 'repeat')::boolean, false) or orders >= 2)
  )
  select count(*)::int, coalesce(jsonb_agg(row_json), '[]'::jsonb) into v_total, v_rows from (
    select jsonb_build_object('id', id, 'name', full_name, 'phone', phone, 'email', case when v_delivery_only then null else email end, 'region', region,
      'source', case when v_delivery_only then null else source end, 'tags', tags, 'consent', marketing_consent, 'has_account', has_account,
      'orders', orders, 'spend', case when v_money and not v_delivery_only then spend end, 'last_order', last_order,
      'balance', balance, 'since', created_at) as row_json
    from filtered
    order by case when v_sort = 'spend' then spend end desc nulls last, case when v_sort = 'name' then full_name end asc,
             case when v_sort = 'orders' then orders end desc nulls last, last_order desc nulls last, created_at desc
    offset v_offset limit v_limit
  ) x;
  return jsonb_build_object('total', v_total, 'rows', v_rows);
end $$;

-- Customer 360 (PRD section 17).
create or replace function public.customer_360(p_id uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  c public.customers%rowtype;
  v_group uuid[];
  v_delivery_only boolean := coalesce((select rp.restriction ilike 'delivery%' from public.role_permissions rp where rp.role_id = private.my_role() and rp.module = 'customers'), false);
  v_paid numeric;
  v_n int;
begin
  if not private.can_see_customer(p_id) then raise exception 'You cannot see this customer' using errcode = '42501'; end if;
  select * into c from public.customers where id = p_id;
  if not found then raise exception 'Customer not found'; end if;
  v_group := private.customer_group(p_id);
  select coalesce(sum(amount_paid), 0), count(*) filter (where amount_paid > 0) into v_paid, v_n from public.orders where customer_id = any (v_group) and status <> 'cancelled';
  return jsonb_build_object(
    'id', c.id, 'name', c.full_name, 'phone', c.phone, 'email', c.email, 'region', c.region, 'merged_into', c.merged_into,
    'source', case when not v_delivery_only then c.source end, 'tags', c.tags, 'notes', case when not v_delivery_only then c.notes end,
    'birthday', case when not v_delivery_only then c.birthday end, 'consent', jsonb_build_object('marketing', c.marketing_consent, 'whatsapp', c.updates_whatsapp, 'sms', c.updates_sms, 'at', c.consent_at),
    'since', c.created_at, 'has_account', c.auth_user_id is not null,
    'lifetime_value', case when not v_delivery_only then v_paid end, 'orders_count', v_n,
    'average_order', case when not v_delivery_only and v_n > 0 then round(v_paid / v_n, 2) end,
    'last_purchase', (select max(created_at) from public.orders where customer_id = any (v_group) and amount_paid > 0),
    'balance_due', (select coalesce(sum(balance_due), 0) from public.orders where customer_id = any (v_group) and payment_state = 'part_paid' and status <> 'cancelled'),
    'merged', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'name', full_name, 'phone', phone)) from public.customers where merged_into = p_id), '[]'::jsonb),
    'orders', coalesce((select jsonb_agg(jsonb_build_object('id', o.id, 'number', o.number, 'status', o.status, 'payment_state', o.payment_state, 'total', o.total,
        'balance', o.balance_due, 'channel', o.channel, 'at', o.created_at, 'region', o.region) order by o.created_at desc)
      from public.orders o where o.customer_id = any (v_group) and private.can_see_order(o.assigned_agent_id, o.created_by)), '[]'::jsonb),
    'profile', case when c.auth_user_id is not null and not v_delivery_only then (select jsonb_build_object('shoe_size', pr.shoe_size_eu, 'clothing_size', pr.clothing_size, 'style_tags', pr.style_tags, 'points', (select coalesce(sum(points), 0) from public.loyalty_entries where user_id = pr.user_id))
                                                         from public.customer_profiles pr where pr.user_id = c.auth_user_id) end,
    'addresses', case when c.auth_user_id is not null then coalesce((select jsonb_agg(jsonb_build_object('label', a.label, 'region', a.region, 'city', a.city, 'area', a.area, 'street', a.street, 'landmark', a.landmark, 'gps', a.gps_code, 'default', a.is_default))
                                                                     from public.addresses a where a.user_id = c.auth_user_id), '[]'::jsonb) else '[]'::jsonb end,
    'wishlist', case when c.auth_user_id is not null and not v_delivery_only then coalesce((select jsonb_agg(p.name) from public.wishlist_items w join public.products p on p.id = w.product_id where w.user_id = c.auth_user_id), '[]'::jsonb) else '[]'::jsonb end,
    'threads', case when not v_delivery_only and private.perm_scope('customers') = 'all' then coalesce((select jsonb_agg(jsonb_build_object('id', t.id, 'subject', t.subject, 'status', t.status, 'at', t.last_message_at) order by t.last_message_at desc)
                                                                     from public.support_threads t where t.customer_id = any (v_group) or (c.auth_user_id is not null and t.user_id = c.auth_user_id)), '[]'::jsonb) else '[]'::jsonb end,
    'reviews', coalesce((select jsonb_agg(jsonb_build_object('rating', r.rating, 'body', r.body, 'status', r.status, 'product', (select name from public.products where id = r.product_id)))
                         from public.reviews r where r.customer_id = any (v_group)), '[]'::jsonb));
end $$;

-- Tags and notes on a customer (Support, Admin, Owner; Sales on their own customers).
create or replace function public.update_customer(p_id uuid, p jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_phone text;
begin
  if not (private.has_perm('customers', 'edit') and private.can_see_customer(p_id)) then raise exception 'You cannot change this customer' using errcode = '42501'; end if;
  if p ? 'phone' then
    v_phone := private.norm_phone(p ->> 'phone');
    if v_phone is null then raise exception 'Enter a valid Ghana phone number'; end if;
    if exists (select 1 from public.customers where phone = v_phone and id <> p_id) then raise exception 'Another customer has that number. Merge them instead'; end if;
  end if;
  update public.customers set
    full_name = coalesce(nullif(btrim(p ->> 'name'), ''), full_name),
    phone = coalesce(v_phone, phone),
    email = case when p ? 'email' then lower(nullif(btrim(p ->> 'email'), '')) else email end,
    region = case when p ? 'region' then nullif(p ->> 'region', '') else region end,
    birthday = case when p ? 'birthday' then nullif(p ->> 'birthday', '')::date else birthday end,
    notes = case when p ? 'notes' then left(nullif(btrim(p ->> 'notes'), ''), 2000) else notes end,
    tags = case when p ? 'tags' then coalesce(array(select distinct left(btrim(t), 30) from jsonb_array_elements_text(p -> 'tags') t where btrim(t) <> '' limit 12), '{}') else tags end
  where id = p_id;
end $$;

-- Merge a duplicate into the record to keep (FR-DATA-004). Orders stay on their original record, so the customer can
-- still track them with the phone they used; the 360 view and the directory show them together, and the merge is logged.
create or replace function public.merge_customers(p_keep uuid, p_merge uuid, p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  k public.customers%rowtype;
  m public.customers%rowtype;
begin
  if not private.customers_full() then raise exception 'You cannot merge customers' using errcode = '42501'; end if;
  if p_keep = p_merge then raise exception 'Choose two different customers'; end if;
  if char_length(btrim(coalesce(p_reason, ''))) < 3 then raise exception 'Say why they are the same person'; end if;
  select * into k from public.customers where id = p_keep for update;
  select * into m from public.customers where id = p_merge for update;
  if k.id is null or m.id is null then raise exception 'Customer not found'; end if;
  if k.merged_into is not null or m.merged_into is not null then raise exception 'One of them is already merged'; end if;
  update public.customers set merged_into = p_keep where merged_into = p_merge; -- anything merged into it moves along
  update public.customers set merged_into = p_keep where id = p_merge;
  update public.customers set
    email = coalesce(k.email, m.email), region = coalesce(k.region, m.region), source = coalesce(k.source, m.source), birthday = coalesce(k.birthday, m.birthday),
    tags = array(select distinct unnest(k.tags || m.tags)),
    notes = nullif(concat_ws(E'\n', k.notes, case when m.notes is not null then 'From merged record: ' || m.notes end), ''),
    auth_user_id = coalesce(k.auth_user_id, m.auth_user_id),
    marketing_consent = k.marketing_consent or m.marketing_consent
  where id = p_keep;
  insert into public.customer_merges (kept_id, merged_id, reason, by_id, by_name) values (p_keep, p_merge, btrim(p_reason), auth.uid(), private.staff_name());
end $$;

-- Import customers from a CSV (FR-DATA-008), with duplicate detection by phone number and a consent field.
create or replace function public.import_customers(p_rows jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  r jsonb;
  v_phone text;
  v_name text;
  v_email text;
  v_created int := 0;
  v_updated int := 0;
  v_errors jsonb := '[]'::jsonb;
  v_i int := 0;
  v_consent boolean;
begin
  if not (private.has_perm('customers', 'create') and private.perm_scope('customers') = 'all') then raise exception 'You cannot import customers' using errcode = '42501'; end if;
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) > 5000 then raise exception 'Send up to 5,000 rows'; end if;
  for r in select * from jsonb_array_elements(p_rows) loop
    v_i := v_i + 1;
    v_phone := private.norm_phone(r ->> 'phone');
    v_name := btrim(coalesce(r ->> 'name', ''));
    v_email := lower(nullif(btrim(coalesce(r ->> 'email', '')), ''));
    v_consent := lower(coalesce(r ->> 'consent', '')) in ('yes', 'y', 'true', '1');
    if v_phone is null then v_errors := v_errors || jsonb_build_object('row', v_i, 'problem', 'Phone number is not a Ghana number'); continue; end if;
    if char_length(v_name) < 2 then v_errors := v_errors || jsonb_build_object('row', v_i, 'problem', 'Name is missing'); continue; end if;
    if v_email is not null and v_email !~ '^[^\s@]+@[^\s@]+\.[^\s@]{2,}$' then v_errors := v_errors || jsonb_build_object('row', v_i, 'problem', 'Email is not valid'); continue; end if;
    if exists (select 1 from public.customers where phone = v_phone) then
      update public.customers set email = coalesce(email, v_email), region = coalesce(region, nullif(r ->> 'region', '')), source = coalesce(source, nullif(r ->> 'source', '')),
        tags = array(select distinct unnest(tags || coalesce(string_to_array(nullif(r ->> 'tags', ''), ';'), '{}'))),
        marketing_consent = marketing_consent or v_consent, consent_at = coalesce(consent_at, case when v_consent then now() end)
      where phone = v_phone;
      v_updated := v_updated + 1;
    else
      insert into public.customers (full_name, phone, email, region, source, tags, marketing_consent, consent_at, notes)
      values (left(v_name, 100), v_phone, v_email, nullif(r ->> 'region', ''), coalesce(nullif(r ->> 'source', ''), 'Imported'),
              coalesce(string_to_array(nullif(r ->> 'tags', ''), ';'), '{}'), v_consent, case when v_consent then now() end, 'Imported ' || to_char(now(), 'DD Mon YYYY'));
      v_created := v_created + 1;
    end if;
  end loop;
  return jsonb_build_object('created', v_created, 'updated', v_updated, 'errors', v_errors);
end $$;

-- Erase a customer's personal data after a deletion request (orders and money records are kept, without the person).
create or replace function public.erase_customer(p_id uuid, p_request uuid default null) returns void
language plpgsql security definer set search_path = '' as $$
declare
  c public.customers%rowtype;
begin
  if not (private.customers_full() and private.has_perm('customers', 'delete')) then raise exception 'Only an Admin or the Owner can erase a customer' using errcode = '42501'; end if;
  select * into c from public.customers where id = p_id for update;
  if not found then raise exception 'Customer not found'; end if;
  if exists (select 1 from public.orders where customer_id = p_id and status not in ('delivered', 'cancelled')) then
    raise exception 'This customer has an open order. Finish or cancel it first';
  end if;
  update public.customers set full_name = 'Erased customer', phone = null, email = null, notes = null, tags = '{}', birthday = null, momo_number = null,
    marketing_consent = false, updates_sms = false, updates_whatsapp = false, erased_at = now(), auth_user_id = null where id = p_id;
  perform set_config('app.via_rpc', '1', true);
  update public.orders set receiver_name = null, receiver_phone = null, street = null, landmark = null, gps_code = null, lat = null, lng = null, rider_note = null where customer_id = p_id;
  perform set_config('app.via_rpc', '', true);
  if c.auth_user_id is not null then
    delete from public.customer_profiles where user_id = c.auth_user_id;
    delete from public.addresses where user_id = c.auth_user_id;
    delete from public.wishlist_items where user_id = c.auth_user_id;
  end if;
  update public.reviews set display_name = 'A customer', photos = '{}' where customer_id = p_id;
  if p_request is not null then
    update public.data_requests set status = 'done', handled_by = auth.uid(), handled_by_name = private.staff_name(), handled_at = now(), response = 'Personal data erased' where id = p_request;
  end if;
end $$;

grant update (notes, tags) on public.customers to authenticated;

-- ---------------------------------------------------------------------------
-- Saved views for every list (FR-DB-002)
-- ---------------------------------------------------------------------------
create table public.saved_views (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null default auth.uid() references public.staff (id) on delete cascade,
  list text not null check (list ~ '^[a-z_]{2,30}$'),
  name text not null check (char_length(name) between 1 and 40),
  params jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (staff_id, list, name)
);
alter table public.saved_views enable row level security;
create policy saved_views_own on public.saved_views for all to authenticated using (staff_id = auth.uid() and private.is_staff()) with check (staff_id = auth.uid() and private.is_staff());
revoke all on public.saved_views from anon, authenticated, public;
grant select, insert, update, delete on public.saved_views to authenticated;

-- ---------------------------------------------------------------------------
-- Global search (FR-DB: order number, phone, customer name, SKU, supplier or product). Runs with the caller's rights,
-- so it only ever finds what row-level security already lets them see.
-- ---------------------------------------------------------------------------
create or replace function public.staff_search(p_q text) returns jsonb
language plpgsql stable security invoker set search_path = '' as $$
declare
  v_q text := btrim(coalesce(p_q, ''));
  v_digits text := regexp_replace(v_q, '\D', '', 'g');
begin
  if char_length(v_q) < 2 then return '[]'::jsonb; end if;
  return coalesce((select jsonb_agg(x) from (
    (select jsonb_build_object('kind', 'order', 'label', o.number, 'sub', o.status::text, 'href', '/dashboard/orders/' || o.id) x
     from public.orders o where o.number ilike '%' || v_q || '%' order by o.created_at desc limit 5)
    union all
    (select jsonb_build_object('kind', 'customer', 'label', c.full_name, 'sub', c.phone, 'href', '/dashboard/customers/' || c.id)
     from public.customers c where c.merged_into is null and (c.full_name ilike '%' || v_q || '%' or (v_digits <> '' and char_length(v_digits) >= 4 and c.phone like '%' || right(v_digits, 9) || '%')) limit 5)
    union all
    (select jsonb_build_object('kind', 'product', 'label', p.name, 'sub', p.sku, 'href', '/dashboard/catalogue?q=' || p.sku)
     from public.products p where p.name ilike '%' || v_q || '%' or p.sku ilike '%' || v_q || '%' or exists (select 1 from public.variants v where v.product_id = p.id and v.sku ilike v_q || '%') limit 5)
    union all
    (select jsonb_build_object('kind', 'supplier', 'label', s.name, 'sub', coalesce(s.phone, ''), 'href', '/dashboard/catalogue/suppliers')
     from public.suppliers s where s.name ilike '%' || v_q || '%' limit 3)
  ) t), '[]'::jsonb);
end $$;

-- ---------------------------------------------------------------------------
-- Function access
-- ---------------------------------------------------------------------------
revoke execute on function public.note_sign_in(text, text), public.record_handover(uuid, date, numeric, text), public.rider_cash(date),
  public.record_balance(uuid, text, text), public.reassign_order(uuid, uuid), public.assign_rider(uuid, uuid, text, text),
  public.set_sourcing_outcome(uuid, text, text), public.deliver_order(uuid, text, text, text), public.create_payment_link(uuid),
  public.partner_jobs(), public.partner_update(uuid, text, text, text, text, text), public.customer_directory(jsonb), public.customer_360(uuid),
  public.update_customer(uuid, jsonb), public.merge_customers(uuid, uuid, text), public.import_customers(jsonb), public.erase_customer(uuid, uuid),
  public.staff_search(text)
from public, anon;
grant execute on function public.note_sign_in(text, text), public.record_handover(uuid, date, numeric, text), public.rider_cash(date),
  public.record_balance(uuid, text, text), public.reassign_order(uuid, uuid), public.assign_rider(uuid, uuid, text, text),
  public.set_sourcing_outcome(uuid, text, text), public.deliver_order(uuid, text, text, text), public.create_payment_link(uuid),
  public.partner_jobs(), public.partner_update(uuid, text, text, text, text, text), public.customer_directory(jsonb), public.customer_360(uuid),
  public.update_customer(uuid, jsonb), public.merge_customers(uuid, uuid, text), public.import_customers(jsonb), public.erase_customer(uuid, uuid),
  public.staff_search(text)
to authenticated;
revoke execute on all functions in schema private from public, anon;
grant execute on all functions in schema private to authenticated;

-- Proof-of-delivery photos: a private bucket, files inside the order's own folder.
do $$
begin
  if to_regclass('storage.buckets') is not null then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('proofs', 'proofs', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
    on conflict (id) do nothing;
    drop policy if exists proofs_upload on storage.objects;
    create policy proofs_upload on storage.objects for insert to authenticated with check (bucket_id = 'proofs' and private.orders_full());
    drop policy if exists proofs_read on storage.objects;
    create policy proofs_read on storage.objects for select to authenticated using (bucket_id = 'proofs' and private.has_perm('orders', 'view'));
  end if;
end $$;
