-- ============================================================================
-- Marianbridge — Remove Port Authority
-- 0003_remove_port_authority.sql
-- ============================================================================

-- 1. Clean up any existing port_authority users
delete from auth.users where email = 'port-authority@marianbridge.test';

-- 2. Drop the port authority visibility helper function
drop function if exists public.port_authority_sees_order(uuid) cascade;

-- 3. Recreate user_can_access_order without port_authority checks
create or replace function public.user_can_access_order(p_order_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid  uuid := auth.uid();
  v_role text := public.current_user_role();
  v_ord  public.orders%rowtype;
begin
  if v_uid is null then
    return false;
  end if;

  select * into v_ord from public.orders where id = p_order_id;
  if not found then
    return false;
  end if;

  if v_role = 'admin' then
    return true;
  end if;

  if v_ord.captain_id = v_uid
     or v_ord.charter_party_id = v_uid
     or v_ord.ship_agent_id = v_uid then
    return true;
  end if;

  if v_role = 'supplier' and exists (
    select 1
    from public.order_line_items oli
    join public.supplier_service_mappings m on m.id = oli.supplier_mapping_id
    where oli.order_id = p_order_id
      and m.supplier_profile_id = v_uid
  ) then
    return true;
  end if;

  return false;
end;
$$;

-- 4. Recreate orders_select policy without port_authority checks
drop policy if exists orders_select on public.orders;
create policy orders_select on public.orders
  for select using (
    captain_id = auth.uid()
    or charter_party_id = auth.uid()
    or ship_agent_id = auth.uid()
    or public.current_user_role() = 'admin'
    or (public.current_user_role() = 'supplier' and exists (
          select 1
          from public.order_line_items oli
          join public.supplier_service_mappings m on m.id = oli.supplier_mapping_id
          where oli.order_id = orders.id
            and m.supplier_profile_id = auth.uid()))
  );

-- 5. Update public.profiles role constraint
do $$
declare
  r record;
begin
  for r in
    select constraint_name
    from information_schema.constraint_column_usage
    where table_name = 'profiles' and column_name = 'role'
  loop
    execute 'alter table public.profiles drop constraint if exists ' || quote_ident(r.constraint_name);
  end loop;
end $$;

alter table public.profiles add constraint profiles_role_check check (role in ('captain','charter_party','ship_agent','supplier','admin'));

-- 6. Update public.chat_permissions and delete port_authority records
delete from public.chat_permissions where sender_role = 'port_authority' or receiver_role = 'port_authority';

do $$
declare
  r record;
begin
  for r in
    select constraint_name
    from information_schema.constraint_column_usage
    where table_name = 'chat_permissions' and column_name in ('sender_role', 'receiver_role')
  loop
    execute 'alter table public.chat_permissions drop constraint if exists ' || quote_ident(r.constraint_name);
  end loop;
end $$;

alter table public.chat_permissions add constraint chat_permissions_sender_role_check check (sender_role in ('captain','charter_party','ship_agent','supplier','admin'));
alter table public.chat_permissions add constraint chat_permissions_receiver_role_check check (receiver_role in ('captain','charter_party','ship_agent','supplier','admin'));

-- 7. Recreate handle_new_user without port_authority whitelist
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_role     text := coalesce(new.raw_user_meta_data->>'role', 'captain');
  v_username text := new.raw_user_meta_data->>'username';
begin
  if v_role not in ('captain','charter_party','ship_agent','supplier','admin') then
    raise exception 'Invalid role: %', v_role;
  end if;

  -- Single-admin enforcement at the auth trigger level
  if v_role = 'admin' then
    if exists (select 1 from public.profiles where role = 'admin') then
      raise exception 'Only one admin account is allowed.';
    end if;
  end if;

  insert into public.profiles (
    id, full_name, role, username, email, company_name, phone, verified,
    passport_no, sid_no, cp_no, imo_no, contract_date,
    agent_type, company_reg_no, imo_agent_code, tin_no,
    unlocode, port_id_text, isps_code,
    business_no, duns_no, admin_id, service_category_id
  )
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', 'New User'),
    v_role,
    v_username,
    new.email,
    new.raw_user_meta_data->>'company_name',
    new.raw_user_meta_data->>'phone',
    false,
    new.raw_user_meta_data->>'passport_no',
    new.raw_user_meta_data->>'sid_no',
    new.raw_user_meta_data->>'cp_no',
    new.raw_user_meta_data->>'imo_no',
    (new.raw_user_meta_data->>'contract_date')::date,
    new.raw_user_meta_data->>'agent_type',
    new.raw_user_meta_data->>'company_reg_no',
    new.raw_user_meta_data->>'imo_agent_code',
    new.raw_user_meta_data->>'tin_no',
    new.raw_user_meta_data->>'unlocode',
    new.raw_user_meta_data->>'port_id_text',
    new.raw_user_meta_data->>'isps_code',
    new.raw_user_meta_data->>'business_no',
    new.raw_user_meta_data->>'duns_no',
    new.raw_user_meta_data->>'admin_id',
    (new.raw_user_meta_data->>'service_category_id')::uuid
  );
  return new;
end;
$$;

-- 8. Recreate messages_insert policy without port_authority
drop policy if exists messages_insert on public.messages;
create policy messages_insert on public.messages
  for insert with check (
    sender_id = auth.uid()
    and (
      -- Order-scoped messages
      (order_id is not null
       and public.user_can_access_order(order_id)
       and (
         public.current_user_role() <> 'supplier'
         or (order_line_item_id is not null
             and public.supplier_owns_line_item(order_line_item_id))
       )
      )
      or
      -- Direct messages
      (order_id is null
       and receiver_id is not null
       and exists (
         select 1 from public.chat_permissions cp
         join public.profiles rp on rp.id = receiver_id
         where cp.sender_role = public.current_user_role()
           and cp.receiver_role = rp.role
       )
      )
    )
  );

-- 9. Recreate messages_select policy without port_authority
drop policy if exists messages_select on public.messages;
create policy messages_select on public.messages
  for select using (
    (
      -- Order-scoped messages
      order_id is not null
      and public.user_can_access_order(order_id)
      and (
        public.current_user_role() <> 'supplier'
        or order_line_item_id is null
        or public.supplier_owns_line_item(order_line_item_id)
      )
    )
    or (
      -- Direct messages
      order_id is null
      and (
        sender_id = auth.uid()
        or receiver_id = auth.uid()
      )
      and (
        public.current_user_role() = 'admin'
        or public.can_chat(least(sender_id, receiver_id), greatest(sender_id, receiver_id))
      )
    )
  );

-- 10. Drop requires_port_authority_approval column from service_categories
alter table public.service_categories drop column if exists requires_port_authority_approval cascade;
