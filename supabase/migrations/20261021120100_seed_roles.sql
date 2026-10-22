-- Sprint 1: the eight built-in roles and the permission matrix from PRD section 4.
-- F = full, E = create and edit, V = view, O = own records only, - = no access.
-- Owners can add custom roles later (FR-ROLE-001); these built-in ones cannot be deleted or renamed.

insert into public.roles (key, name, description, is_system) values
  ('owner', 'Owner', 'Full control, sets strategy, targets and pay', true),
  ('admin', 'Admin or Manager', 'Runs daily operations, manages staff and targets', true),
  ('sales_agent', 'Sales Agent', 'Handles WhatsApp, calls and walk-ins, creates orders', true),
  ('sourcing_officer', 'Sourcing Officer', 'Keeps the catalogue and availability accurate and places supplier orders', true),
  ('dispatch_coordinator', 'Dispatch Coordinator', 'Moves orders to customers', true),
  ('content_editor', 'Content Editor', 'Publishes Drip School articles, banners and pages', true),
  ('customer_support', 'Customer Support', 'Resolves issues and cancellations', true),
  ('finance', 'Finance', 'Keeps money records', true)
on conflict (key) do nothing;

do $$
declare
  -- columns: module, then one code per role in this order
  roles_in_order text[] := array['owner', 'admin', 'sales_agent', 'sourcing_officer', 'dispatch_coordinator', 'content_editor', 'customer_support', 'finance'];
  matrix text[][] := array[
    -- module            owner admin sales sourcing dispatch content support finance
    ['products',         'F', 'F', 'V', 'E', 'V', 'V', 'V', 'V'],
    ['availability',     'F', 'F', 'V', 'F', 'V', '-', 'V', 'V'],
    ['orders',           'F', 'F', 'O', 'V', 'E', '-', 'E', 'V'],
    ['refunds',          'F', 'F', '-', '-', '-', '-', 'E', 'E'],
    ['customers',        'F', 'F', 'O', '-', 'V', '-', 'E', 'V'],
    ['staff',            'F', 'E', '-', '-', '-', '-', '-', '-'],
    ['salary',           'F', '-', '-', '-', '-', '-', '-', 'E'],
    ['expenses',         'F', 'V', '-', 'E', 'E', '-', '-', 'F'],
    ['targets_set',      'F', 'F', '-', '-', '-', '-', '-', '-'],
    ['targets_view',     'F', 'F', 'O', 'O', 'O', 'O', 'O', 'O'],
    ['analytics',        'F', 'F', 'O', 'V', 'V', 'V', 'V', 'V'],
    ['content',          'F', 'F', '-', '-', '-', 'F', '-', '-'],
    ['exports',          'F', 'E', 'O', 'E', '-', '-', '-', 'E'],
    ['settings',         'F', 'E', '-', '-', '-', '-', '-', '-'],
    ['audit',            'F', 'V', '-', '-', '-', '-', '-', 'V']
  ];
  -- limits the matrix describes in words (role, module, text)
  limits text[][] := array[
    ['dispatch_coordinator', 'orders', 'Status, delivery and balance fields only'],
    ['sourcing_officer', 'expenses', 'Supplier costs only'],
    ['dispatch_coordinator', 'expenses', 'Delivery costs only'],
    ['customer_support', 'refunds', 'Request only'],
    ['finance', 'refunds', 'Approve if allowed'],
    ['dispatch_coordinator', 'customers', 'Delivery fields only'],
    ['sourcing_officer', 'analytics', 'Catalogue'],
    ['dispatch_coordinator', 'analytics', 'Delivery'],
    ['content_editor', 'analytics', 'Content'],
    ['customer_support', 'analytics', 'Service'],
    ['finance', 'analytics', 'Money'],
    ['sourcing_officer', 'exports', 'Catalogue only']
  ];
  i int;
  j int;
  code text;
  m text;
  rid uuid;
  v boolean; c boolean; e boolean; d boolean; x boolean; sc public.perm_scope;
  -- modules where "own records only" means read-only, or export-only
  view_only_own text[] := array['targets_view', 'analytics'];
begin
  for i in 1..array_length(matrix, 1) loop
    m := matrix[i][1];
    for j in 1..array_length(roles_in_order, 1) loop
      code := matrix[i][j + 1];
      continue when code = '-';
      select id into rid from public.roles where key = roles_in_order[j];
      sc := case when code = 'O' then 'own' else 'all' end;
      v := false; c := false; e := false; d := false; x := false;

      if m = 'exports' then
        x := true;                                  -- the whole row is the right to export
      elsif code = 'F' then
        v := true; c := true; e := true; d := true; x := true;
      elsif code = 'E' then
        v := true; c := true; e := true;
      elsif code = 'V' then
        v := true;
      elsif code = 'O' then
        v := true;
        if not (m = any (view_only_own)) then c := true; e := true; end if;
      end if;

      insert into public.role_permissions (role_id, module, can_view, can_create, can_edit, can_delete, can_export, scope, restriction)
      values (rid, m::public.app_module, v, c, e, d, x, sc, null)
      on conflict (role_id, module) do nothing;
    end loop;
  end loop;

  -- apply the written limits
  for i in 1..array_length(limits, 1) loop
    update public.role_permissions rp
    set restriction = limits[i][3]
    from public.roles r
    where rp.role_id = r.id and r.key = limits[i][1] and rp.module = limits[i][2]::public.app_module;
  end loop;
end $$;
