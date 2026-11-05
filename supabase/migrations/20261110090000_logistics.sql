-- Logistics (meeting of 4 November 2026). Drezzy has no GPS, so people replace it: the customer sees who has their order, the
-- rider's number while it is on the road, a company logistics line, and a short update staff or the rider can post.

alter table public.orders
  add column if not exists delivery_update text check (char_length(delivery_update) <= 200),
  add column if not exists delivery_update_at timestamptz;

-- the logistics line, per branch, with its hours; empty means the shop falls back to the branch number
update public.site_settings set data = data || '{"logistics": {"accra": "", "kumasi": "", "hours": ""}}'::jsonb where not (data ? 'logistics');

-- an order leaves with someone responsible for it, so the customer always has a name
update public.app_settings set value = value || '{"require_carrier": true}'::jsonb where key = 'delivery';

create or replace function private.need_carrier() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.status = 'dispatched' and old.status is distinct from 'dispatched' and new.delivery_method <> 'pickup'
     and nullif(btrim(coalesce(new.rider_name, '')), '') is null and nullif(btrim(coalesce(new.courier, '')), '') is null
     and coalesce((private.setting('delivery') ->> 'require_carrier')::boolean, false) then
    raise exception 'Assign a rider or courier before dispatching';
  end if;
  return new;
end $$;
drop trigger if exists orders_need_carrier on public.orders;
create trigger orders_need_carrier before update of status on public.orders for each row execute function private.need_carrier();

create or replace function public.track_order(p_number text, p_phone text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_phone text := private.norm_phone(p_phone);
  o public.orders%rowtype;
  v_road boolean;
begin
  if v_phone is null or p_number is null then return null; end if;
  select ord.* into o from public.orders ord join public.customers c on c.id = ord.customer_id
    where ord.number = upper(btrim(p_number)) and c.phone = v_phone;
  if not found then return null; end if;
  v_road := o.status in ('dispatched', 'out_for_delivery', 'failed_delivery');

  return jsonb_build_object(
    'number', o.number, 'placed_at', o.created_at, 'status', o.status, 'payment_state', o.payment_state, 'plan', o.payment_plan,
    'subtotal', o.subtotal, 'delivery_fee', o.delivery_fee, 'discount', o.discount,
    'total', o.total, 'amount_paid', o.amount_paid, 'balance_due', o.balance_due, 'est_delivery_date', o.est_delivery_date,
    'delivery_method', o.delivery_method, 'region', o.region, 'city', o.city, 'area', o.area,
    'receiver_name', coalesce(o.receiver_name, (select full_name from public.customers where id = o.customer_id)),
    'courier', o.courier, 'tracking_number', o.tracking_number, 'branch', o.branch,
    -- a rider's number is for the delivery in progress only, so nobody can call them about a finished order at night
    'rider_name', case when v_road then o.rider_name end, 'rider_phone', case when v_road then o.rider_phone end,
    'delivery_update', case when v_road then o.delivery_update end, 'delivery_update_at', case when v_road then o.delivery_update_at end,
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

-- Staff post a short update the customer reads on the tracker, in place of a map.
create or replace function public.set_delivery_update(p_order uuid, p_text text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  o public.orders%rowtype;
  v_text text := nullif(btrim(coalesce(p_text, '')), '');
begin
  if not private.orders_full() then raise exception 'You cannot update deliveries' using errcode = '42501'; end if;
  select * into o from public.orders where id = p_order for update;
  if not found then raise exception 'Order not found'; end if;
  if o.status not in ('dispatched', 'out_for_delivery', 'failed_delivery') then raise exception 'This order is not on the road'; end if;
  if char_length(coalesce(v_text, '')) > 200 then raise exception 'Keep the update under 200 characters'; end if;
  perform set_config('app.via_rpc', '1', true);
  update public.orders set delivery_update = v_text, delivery_update_at = case when v_text is null then null else now() end where id = o.id;
  perform set_config('app.via_rpc', '', true);
  if v_text is not null then perform private.log_event(o.id, 'note', null, v_text, null); end if;
end $$;

-- The same, for the rider or courier on their own job.
create or replace function public.partner_note(p_order uuid, p_text text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_rider uuid := private.my_rider();
  o public.orders%rowtype;
  v_text text := nullif(btrim(coalesce(p_text, '')), '');
begin
  if v_rider is null then raise exception 'This login is not a delivery partner' using errcode = '42501'; end if;
  select * into o from public.orders where id = p_order and rider_id = v_rider for update;
  if not found then raise exception 'That job is not yours'; end if;
  if o.status not in ('dispatched', 'out_for_delivery', 'failed_delivery') then raise exception 'This job is not on the road'; end if;
  if v_text is null or char_length(v_text) > 200 then raise exception 'Write a short update'; end if;
  perform set_config('app.via_rpc', '1', true);
  update public.orders set delivery_update = v_text, delivery_update_at = now() where id = o.id;
  perform set_config('app.via_rpc', '', true);
  perform private.log_event(o.id, 'note', null, v_text, null);
end $$;

revoke execute on function public.set_delivery_update(uuid, text), public.partner_note(uuid, text) from public, anon;
grant execute on function public.set_delivery_update(uuid, text), public.partner_note(uuid, text) to authenticated;
revoke execute on all functions in schema private from public, anon;
grant execute on all functions in schema private to authenticated;
