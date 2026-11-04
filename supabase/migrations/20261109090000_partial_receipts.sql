-- "Partly received" (PRD FR-CAT-006). A supplier order with several items can arrive in parts. Each item is marked as it
-- arrives; the order stays open, so its cost reaches Money once, when the last item is in.
create or replace function public.receive_supplier_items(p_supplier_order uuid, p_items uuid[]) returns text
language plpgsql security definer set search_path = '' as $$
declare
  so public.supplier_orders%rowtype;
  v_left int;
begin
  if not private.has_perm('availability', 'edit') then raise exception 'You cannot receive supplier orders' using errcode = '42501'; end if;
  select * into so from public.supplier_orders where id = p_supplier_order for update;
  if not found then raise exception 'Supplier order not found'; end if;
  if so.status <> 'ordered' then raise exception 'This supplier order is already %', so.status; end if;
  if coalesce(array_length(p_items, 1), 0) = 0 then raise exception 'Choose what arrived'; end if;
  if exists (select 1 from unnest(p_items) i where i not in (select order_item_id from public.supplier_order_items where supplier_order_id = so.id)) then
    raise exception 'That item is not on this supplier order';
  end if;

  perform set_config('app.via_rpc', '1', true);
  update public.order_items set sourcing = 'received' where id = any(p_items);
  perform set_config('app.via_rpc', '', true);

  select count(*) into v_left from public.order_items oi join public.supplier_order_items s on s.order_item_id = oi.id
  where s.supplier_order_id = so.id and oi.sourcing <> 'received';
  if v_left = 0 then
    perform public.receive_supplier_order(so.id, so.receipt_path);
    return 'received';
  end if;
  perform private.log_event(so.order_id, 'supplier', null, null, 'Supplier order partly received');
  return 'partly_received';
end $$;

revoke execute on function public.receive_supplier_items(uuid, uuid[]) from public, anon;
grant execute on function public.receive_supplier_items(uuid, uuid[]) to authenticated;
