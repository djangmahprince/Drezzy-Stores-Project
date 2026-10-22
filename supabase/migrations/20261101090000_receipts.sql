-- Supplier receipts (PRD section 13): a photo or PDF of what the supplier gave us, attached to the supplier order.
--   * Files live in a PRIVATE storage bucket. Only people who keep availability (Sourcing, Admin, Owner) can upload, and only
--     people who may see supplier costs can open one. The shop never serves them.
--   * A receipt path must sit inside its own supplier order's folder, so one order cannot point at another order's file.

do $$
begin
  if to_regclass('storage.buckets') is not null then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('receipts', 'receipts', false, 5242880, array['image/jpeg', 'image/png', 'image/webp', 'application/pdf'])
    on conflict (id) do nothing;

    drop policy if exists receipts_upload on storage.objects;
    create policy receipts_upload on storage.objects for insert to authenticated
      with check (bucket_id = 'receipts' and private.has_perm('availability', 'edit'));
    drop policy if exists receipts_read on storage.objects;
    create policy receipts_read on storage.objects for select to authenticated
      using (bucket_id = 'receipts' and private.can_see_costs());
  end if;
end $$;

-- Marking received now checks the receipt path belongs to this supplier order.
create or replace function public.receive_supplier_order(p_supplier_order uuid, p_receipt text default null) returns void
language plpgsql security definer set search_path = '' as $$
declare
  so public.supplier_orders%rowtype;
  o public.orders%rowtype;
  v_receipt text := nullif(btrim(coalesce(p_receipt, '')), '');
begin
  if not private.has_perm('availability', 'edit') then raise exception 'You cannot receive supplier orders' using errcode = '42501'; end if;
  select * into so from public.supplier_orders where id = p_supplier_order for update;
  if not found then raise exception 'Supplier order not found'; end if;
  if so.status <> 'ordered' then raise exception 'This supplier order is already %', so.status; end if;
  if v_receipt is not null and (v_receipt not like so.id::text || '/%' or v_receipt like '%..%') then raise exception 'That receipt does not belong to this supplier order'; end if;

  update public.supplier_orders set status = 'received', received_at = now(), receipt_path = v_receipt where id = so.id;
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

-- Attach or replace the receipt later, for example when the photo is taken after the goods arrive.
create or replace function public.attach_receipt(p_supplier_order uuid, p_path text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  so public.supplier_orders%rowtype;
begin
  if not private.has_perm('availability', 'edit') then raise exception 'You cannot attach receipts' using errcode = '42501'; end if;
  select * into so from public.supplier_orders where id = p_supplier_order for update;
  if not found then raise exception 'Supplier order not found'; end if;
  if p_path is null or p_path not like so.id::text || '/%' or p_path like '%..%' then raise exception 'That receipt does not belong to this supplier order'; end if;
  update public.supplier_orders set receipt_path = p_path where id = so.id;
  perform private.log_event(so.order_id, 'supplier', null, null, 'Receipt attached');
end $$;

revoke execute on function public.attach_receipt(uuid, text) from public, anon;
grant execute on function public.attach_receipt(uuid, text) to authenticated;
revoke execute on function public.receive_supplier_order(uuid, text) from public, anon;
grant execute on function public.receive_supplier_order(uuid, text) to authenticated;
