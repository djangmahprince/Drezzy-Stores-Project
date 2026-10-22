-- Sourcing flow (PRD section 13): after a customer pays, the Sourcing Officer orders each item from a supplier, then marks it
-- received at the branch. The customer's tracker follows: "Getting your item from our supplier", then "Item received".
--
--   * Only people who can edit availability (Sourcing, Admin, Owner) place, receive or fail supplier orders.
--   * Nothing is ordered from a supplier until the customer's payment is confirmed (FR-CO-002).
--   * What a supplier charged lives in its own table that only cost-visible roles can read.
--   * When every item of a customer order has arrived, the order moves to "Ready to pack" by itself.

create type public.supplier_order_status as enum ('ordered', 'received', 'failed');

create table public.supplier_orders (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete cascade,
  supplier_id uuid not null references public.suppliers (id),
  status public.supplier_order_status not null default 'ordered',
  ordered_at timestamptz not null default now(),
  expected_at date,
  received_at timestamptz,
  receipt_path text,
  note text,
  staff_id uuid references auth.users (id) on delete set null,
  staff_name text,
  created_at timestamptz not null default now()
);
create index supplier_orders_order_idx on public.supplier_orders (order_id);
create index supplier_orders_status_idx on public.supplier_orders (status);

create table public.supplier_order_items (
  supplier_order_id uuid not null references public.supplier_orders (id) on delete cascade,
  order_item_id uuid not null references public.order_items (id) on delete cascade,
  primary key (supplier_order_id, order_item_id)
);

-- the agreed cost, kept apart so only roles that may see costs can read it
create table public.supplier_order_costs (
  supplier_order_id uuid primary key references public.supplier_orders (id) on delete cascade,
  agreed_cost numeric(12, 2) not null check (agreed_cost >= 0)
);

alter table public.supplier_orders enable row level security;
alter table public.supplier_order_items enable row level security;
alter table public.supplier_order_costs enable row level security;

create policy supplier_orders_read on public.supplier_orders for select to authenticated using (private.has_perm('availability', 'view'));
create policy supplier_order_items_read on public.supplier_order_items for select to authenticated using (private.has_perm('availability', 'view'));
create policy supplier_order_costs_read on public.supplier_order_costs for select to authenticated using (private.can_see_costs());

revoke all on public.supplier_orders, public.supplier_order_items, public.supplier_order_costs from anon, public;
grant select on public.supplier_orders, public.supplier_order_items, public.supplier_order_costs to authenticated;

-- ---------------------------------------------------------------------------
-- Staff actions (all writes go through these)
-- ---------------------------------------------------------------------------
create or replace function public.place_supplier_order(
  p_order uuid, p_supplier uuid, p_items uuid[], p_cost numeric, p_expected date default null, p_note text default null
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  o public.orders%rowtype;
  v_id uuid;
  v_ok int;
begin
  if not private.has_perm('availability', 'edit') then raise exception 'You cannot place supplier orders' using errcode = '42501'; end if;
  select * into o from public.orders where id = p_order for update;
  if not found then raise exception 'Order not found'; end if;
  if o.payment_state not in ('paid', 'part_paid') then raise exception 'Nothing is ordered from a supplier until the customer''s payment is confirmed'; end if;
  if o.status not in ('to_confirm', 'to_source', 'ready_to_pack') then raise exception 'This order is not at the sourcing stage'; end if;
  if not exists (select 1 from public.suppliers where id = p_supplier and active) then raise exception 'Choose an active supplier'; end if;
  if p_items is null or array_length(p_items, 1) is null then raise exception 'Choose the items to order'; end if;
  if p_cost is null or p_cost < 0 then raise exception 'Enter the agreed cost'; end if;

  select count(*) into v_ok from public.order_items where order_id = p_order and id = any (p_items) and sourcing in ('pending', 'failed');
  if v_ok <> array_length(p_items, 1) then raise exception 'Some of those items are already ordered, or are not on this order'; end if;

  insert into public.supplier_orders (order_id, supplier_id, expected_at, note, staff_id, staff_name)
    values (p_order, p_supplier, p_expected, nullif(btrim(coalesce(p_note, '')), ''), auth.uid(), private.staff_name()) returning id into v_id;
  insert into public.supplier_order_items (supplier_order_id, order_item_id) select v_id, unnest(p_items);
  insert into public.supplier_order_costs (supplier_order_id, agreed_cost) values (v_id, p_cost);

  perform set_config('app.via_rpc', '1', true);
  update public.order_items set sourcing = 'ordered' where id = any (p_items);
  -- an order still waiting for confirmation is confirmed by sourcing it
  if o.status = 'to_confirm' then
    update public.orders set status = 'to_source' where id = o.id;
    perform private.log_event(o.id, 'status', 'to_source', 'Confirmed by Drezzy', null);
  end if;
  perform private.log_event(o.id, 'supplier', null, 'Getting your item from our supplier', 'Supplier order placed');
  perform set_config('app.via_rpc', '', true);
  return v_id;
end $$;

-- Marks a supplier order received at the branch. When nothing is left to source, the order is ready to pack.
create or replace function public.receive_supplier_order(p_supplier_order uuid, p_receipt text default null) returns void
language plpgsql security definer set search_path = '' as $$
declare
  so public.supplier_orders%rowtype;
  o public.orders%rowtype;
begin
  if not private.has_perm('availability', 'edit') then raise exception 'You cannot receive supplier orders' using errcode = '42501'; end if;
  select * into so from public.supplier_orders where id = p_supplier_order for update;
  if not found then raise exception 'Supplier order not found'; end if;
  if so.status <> 'ordered' then raise exception 'This supplier order is already %', so.status; end if;

  update public.supplier_orders set status = 'received', received_at = now(), receipt_path = nullif(btrim(coalesce(p_receipt, '')), '') where id = so.id;
  perform set_config('app.via_rpc', '1', true);
  update public.order_items set sourcing = 'received' where id in (select order_item_id from public.supplier_order_items where supplier_order_id = so.id);

  select * into o from public.orders where id = so.order_id for update;
  if o.status = 'to_source' and not exists (select 1 from public.order_items where order_id = o.id and sourcing <> 'received') then
    update public.orders set status = 'ready_to_pack' where id = o.id;
    perform private.log_event(o.id, 'status', 'ready_to_pack', 'Item received at our branch', 'All supplier orders received');
  else
    perform private.log_event(o.id, 'supplier', null, null, 'Supplier order received');
  end if;
  perform set_config('app.via_rpc', '', true);
end $$;

-- No supplier could provide the item. The items go back to "failed" so another supplier can be tried, or a refund arranged.
create or replace function public.fail_supplier_order(p_supplier_order uuid, p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  so public.supplier_orders%rowtype;
begin
  if not private.has_perm('availability', 'edit') then raise exception 'You cannot change supplier orders' using errcode = '42501'; end if;
  if btrim(coalesce(p_reason, '')) = '' then raise exception 'Give a reason'; end if;
  select * into so from public.supplier_orders where id = p_supplier_order for update;
  if not found then raise exception 'Supplier order not found'; end if;
  if so.status <> 'ordered' then raise exception 'This supplier order is already %', so.status; end if;

  update public.supplier_orders set status = 'failed', note = coalesce(note || E'\n', '') || 'Failed: ' || btrim(p_reason) where id = so.id;
  perform set_config('app.via_rpc', '1', true);
  update public.order_items set sourcing = 'failed' where id in (select order_item_id from public.supplier_order_items where supplier_order_id = so.id);
  perform private.log_event(so.order_id, 'supplier', null, null, 'Supplier could not provide the item: ' || btrim(p_reason));
  perform set_config('app.via_rpc', '', true);
end $$;

revoke execute on all functions in schema public from public, anon;
grant execute on function public.place_order(jsonb), public.track_order(text, text), public.submit_manual_payment(text, text, text), public.retry_payment(text, text, text) to anon, authenticated;
grant execute on function public.advance_order(uuid, public.order_status, text), public.move_order_back(uuid, public.order_status, text),
  public.record_balance(uuid, text, text), public.record_checkout_payment(uuid, text, text), public.review_manual_payment(uuid, boolean),
  public.place_supplier_order(uuid, uuid, uuid[], numeric, date, text), public.receive_supplier_order(uuid, text), public.fail_supplier_order(uuid, text) to authenticated;
grant execute on function public.confirm_payment(text, numeric, jsonb) to service_role;
grant execute on all functions in schema private to authenticated;

create trigger supplier_orders_audit after insert or update or delete on public.supplier_orders for each row execute function private.audit_row();
create trigger supplier_order_costs_audit after insert or update or delete on public.supplier_order_costs for each row execute function private.audit_row();
