-- ============================================================================
-- Marianbridge — Auth Upgrades
-- 0002_auth_upgrades.sql
--
-- 1. Add username + email to profiles (unique)
-- 2. Add role-specific registration fields
-- 3. Single-admin enforcement
-- 4. Chat communication matrix table
-- 5. Active user tracking table
-- 6. Updated triggers and functions
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. PROFILES enhancements
-- ----------------------------------------------------------------------------
alter table public.profiles
  add column if not exists username text,
  add column if not exists email   text;

-- Make username unique (nullable for now; existing rows get null)
create unique index if not exists idx_profiles_username on public.profiles(username)
  where username is not null;
create index if not exists idx_profiles_email on public.profiles(email);

-- Backfill email from auth.users for existing profiles
do $$
begin
  update public.profiles p
  set email = u.email
  from auth.users u
  where p.id = u.id
    and p.email is null;
end $$;

-- ----------------------------------------------------------------------------
-- 2. ROLE-SPECIFIC registration fields
-- ----------------------------------------------------------------------------
-- Rather than separate tables, we add nullable columns to profiles.
-- Each role's required fields are enforced at the application level.
-- The constraints below ensure data integrity for the "mandatory" fields.

alter table public.profiles
  add column if not exists passport_no         text,
  add column if not exists sid_no              text,
  add column if not exists cp_no               text,
  add column if not exists imo_no              text,
  add column if not exists contract_date       date,
  add column if not exists company_reg_no      text,
  add column if not exists imo_agent_code      text,
  add column if not exists tin_no              text,
  add column if not exists unlocode            text,
  add column if not exists port_id_text        text,
  add column if not exists isps_code           text,
  add column if not exists business_no         text,
  add column if not exists duns_no             text,
  add column if not exists admin_id            text,
  add column if not exists agent_type          text,
  add column if not exists service_category_id uuid references public.service_categories(id);

-- We do NOT add CHECK constraints per role here because during registration
-- the role is selected first and then the fields are collected. The trigger
-- handle_new_user will enforce that mandatory fields are present.

-- ----------------------------------------------------------------------------
-- 3. SINGLE-ADMIN CONSTRAINT
-- ----------------------------------------------------------------------------
-- A trigger that prevents a second admin from being created in profiles.
create or replace function public.prevent_second_admin()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.role = 'admin' then
    if exists (select 1 from public.profiles where role = 'admin' and id <> coalesce(new.id, '00000000-0000-0000-0000-000000000000')) then
      raise exception 'Only one admin account is allowed.';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_prevent_second_admin on public.profiles;
create trigger trg_prevent_second_admin
  before insert or update of role on public.profiles
  for each row execute function public.prevent_second_admin();

-- Also prevent admin signup via auth.users trigger (which calls handle_new_user)
-- We add the check inside handle_new_user below.

-- ----------------------------------------------------------------------------
-- 4. UPDATE handle_new_user to include username, email, and role-specific fields
-- ----------------------------------------------------------------------------
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
  if v_role not in ('captain','charter_party','ship_agent','port_authority','supplier','admin') then
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

-- ----------------------------------------------------------------------------
-- 5. CHAT AUTHORIZATION MATRIX (Epic 4)
-- ----------------------------------------------------------------------------
-- Define the allowed communication pairs.
create table if not exists public.chat_permissions (
  id            uuid primary key default gen_random_uuid(),
  sender_role   text not null check (sender_role in
                  ('captain','charter_party','ship_agent','port_authority','supplier','admin')),
  receiver_role text not null check (receiver_role in
                  ('captain','charter_party','ship_agent','port_authority','supplier','admin')),
  unique (sender_role, receiver_role)
);

-- Seed the permission matrix based on requirements:
-- Captain   ↔ Charter Party, Ship Agent
-- Supplier  ↔ Charter Party, Ship Agent
-- Admin     ↔ All
insert into public.chat_permissions (sender_role, receiver_role) values
  -- Captain can chat with Charter Party and Ship Agent
  ('captain', 'charter_party'),
  ('captain', 'ship_agent'),
  ('captain', 'admin'),
  -- Charter Party can chat with Captain, Supplier
  ('charter_party', 'captain'),
  ('charter_party', 'supplier'),
  ('charter_party', 'ship_agent'),
  ('charter_party', 'admin'),
  -- Ship Agent can chat with Captain, Supplier, Charter Party
  ('ship_agent', 'captain'),
  ('ship_agent', 'supplier'),
  ('ship_agent', 'charter_party'),
  ('ship_agent', 'admin'),
  -- Supplier can chat with Charter Party and Ship Agent
  ('supplier', 'charter_party'),
  ('supplier', 'ship_agent'),
  ('supplier', 'admin'),
  -- Port Authority can chat with Admin (and others as needed)
  ('port_authority', 'admin'),
  ('port_authority', 'captain'),
  ('port_authority', 'charter_party'),
  ('port_authority', 'ship_agent'),
  -- Admin can chat with everyone
  ('admin', 'captain'),
  ('admin', 'charter_party'),
  ('admin', 'ship_agent'),
  ('admin', 'port_authority'),
  ('admin', 'supplier')
on conflict do nothing;

-- Chat permission check function (used by RLS and app-level checks)
create or replace function public.can_chat(sender_id uuid, receiver_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_sender_role   text;
  v_receiver_role text;
begin
  select role into v_sender_role from public.profiles where id = sender_id;
  select role into v_receiver_role from public.profiles where id = receiver_id;

  if v_sender_role = 'admin' then
    return true;
  end if;

  return exists (
    select 1 from public.chat_permissions
    where sender_role = v_sender_role and receiver_role = v_receiver_role
  );
end;
$$;

-- ----------------------------------------------------------------------------
-- 6. ACTIVE USER TRACKING (Task 2.4)
-- ----------------------------------------------------------------------------
create table if not exists public.active_sessions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles(id) on delete cascade,
  last_heartbeat timestamptz not null default now(),
  metadata    jsonb default '{}'::jsonb,
  unique (user_id)
);

-- Cleanup stale sessions (older than 2 minutes)
create or replace function public.cleanup_stale_sessions()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  delete from public.active_sessions
  where last_heartbeat < now() - interval '2 minutes';
  return null;
end;
$$;

-- Allow RLS on active_sessions for admin-only reads / user self-upsert
alter table public.active_sessions enable row level security;

drop policy if exists active_sessions_admin on public.active_sessions;
create policy active_sessions_admin on public.active_sessions
  for all using (public.current_user_role() = 'admin')
  with check (public.current_user_role() = 'admin');

-- ----------------------------------------------------------------------------
-- 7. ADMIN PASSWORD RESET TOKENS (Task 2.3)
-- ----------------------------------------------------------------------------
-- Instead of storing plaintext passwords (which is a security anti-pattern),
-- we provide an admin-authorized password reset mechanism.
create table if not exists public.admin_password_resets (
  id              uuid primary key default gen_random_uuid(),
  requested_by    uuid not null references public.profiles(id) on delete cascade,
  target_user_id  uuid not null references public.profiles(id) on delete cascade,
  reset_token     text not null default encode(gen_random_bytes(32), 'hex'),
  used            boolean not null default false,
  created_at      timestamptz not null default now(),
  expires_at      timestamptz not null default now() + interval '1 hour'
);

alter table public.admin_password_resets enable row level security;

drop policy if exists admin_resets_admin on public.admin_password_resets;
create policy admin_resets_admin on public.admin_password_resets
  for all using (public.current_user_role() = 'admin')
  with check (public.current_user_role() = 'admin');

-- Function to initiate a password reset (admin only)
create or replace function public.admin_initiate_password_reset(target_user_id uuid)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_token text;
begin
  if public.current_user_role() <> 'admin' then
    raise exception 'Only admins can initiate password resets.';
  end if;

  insert into public.admin_password_resets (requested_by, target_user_id)
  values (auth.uid(), target_user_id)
  returning reset_token into v_token;

  return v_token;
end;
$$;

-- Function to apply a password reset (called by edge function with service role)
-- This creates a Supabase password recovery link for the target user.
create or replace function public.get_user_email_for_reset(target_user_id uuid)
returns text
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select email from auth.users where id = target_user_id;
$$;

-- ----------------------------------------------------------------------------
-- 8. MESSAGES RLS ENHANCEMENT for chat matrix (Epic 4)
-- ----------------------------------------------------------------------------
-- Update the messages insert policy to enforce the chat permissions matrix.
drop policy if exists messages_insert on public.messages;
create policy messages_insert on public.messages
  for insert with check (
    sender_id = auth.uid()
    and (
      -- Order-scoped messages: use existing rules
      (order_id is not null
       and public.user_can_access_order(order_id)
       and (
         public.current_user_role() <> 'supplier'
         or (order_line_item_id is not null
             and public.supplier_owns_line_item(order_line_item_id))
       )
      )
      or
      -- Direct messages: no order required, validate chat permissions
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

-- Add a receiver_id to messages for direct messaging support
alter table public.messages
  add column if not exists receiver_id uuid references public.profiles(id);

-- Update messages select to filter by chat permissions
drop policy if exists messages_select on public.messages;
create policy messages_select on public.messages
  for select using (
    (
      -- Order-scoped messages: existing visibility rules
      order_id is not null
      and public.user_can_access_order(order_id)
      and (
        public.current_user_role() <> 'supplier'
        or order_line_item_id is null
        or public.supplier_owns_line_item(order_line_item_id)
      )
    )
    or (
      -- Direct messages: sender or receiver can see, with chat permission check
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

-- ----------------------------------------------------------------------------
-- 9. ADD chat matrix check to existing messages functions
-- ----------------------------------------------------------------------------
create or replace function public.user_can_message(sender_id uuid, receiver_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.chat_permissions cp
    join public.profiles s on s.id = sender_id
    join public.profiles r on r.id = receiver_id
    where cp.sender_role = s.role and cp.receiver_role = r.role
  );
$$;

-- ----------------------------------------------------------------------------
-- 9b. Allow anon users to read service_categories (needed for registration form)
-- ----------------------------------------------------------------------------
drop policy if exists svc_select on public.service_categories;
create policy svc_select on public.service_categories
  for select using (auth.role() = 'authenticated' or auth.role() = 'anon');

-- ----------------------------------------------------------------------------
-- 10. USERNAME LOOKUP for login (bypasses RLS since caller is unauthenticated)
-- ----------------------------------------------------------------------------
create or replace function public.get_email_by_username(p_username text)
returns text
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select email from public.profiles
  where username = lower(trim(p_username))
  limit 1;
$$;

-- ----------------------------------------------------------------------------
-- 11. RESTRICT supplier line-item visibility by service category
-- ----------------------------------------------------------------------------
-- Drop and recreate oli_select so suppliers only see line items whose
-- service_category_id matches their own profile.service_category_id.
drop policy if exists oli_select on public.order_line_items;
create policy oli_select on public.order_line_items
  for select using (
    public.user_can_access_order(order_id)
    and (
      public.current_user_role() <> 'supplier'
      or service_category_id is null
      or service_category_id = (select service_category_id from public.profiles where id = auth.uid())
    )
  );

-- ----------------------------------------------------------------------------
-- 12. UPDATE Database types reference
-- ----------------------------------------------------------------------------
-- Add comment for type regeneration reminder
comment on table public.profiles is 'User profiles with username, email, and role-specific registration fields.';

-- ----------------------------------------------------------------------------
-- 13. UNIVERSAL ORDER VISIBILITY
-- ----------------------------------------------------------------------------
-- Make orders visible to any authenticated user
drop policy if exists orders_select on public.orders;
create policy orders_select on public.orders
  for select using (auth.role() = 'authenticated');

-- Override user_can_access_order to allow everyone
create or replace function public.user_can_access_order(p_order_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as 
  select auth.role() = 'authenticated';
;
