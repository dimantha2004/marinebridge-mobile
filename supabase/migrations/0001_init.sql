-- ============================================================================
-- Marianbridge — Integrated Smart Maritime Service System
-- 0001_init.sql — schema, RLS helpers, policies, triggers, realtime, storage, seed
-- ============================================================================
-- Apply with the Supabase CLI:  supabase db push
-- (or paste into the SQL editor). Idempotent-ish: uses IF NOT EXISTS where safe.
-- ============================================================================

create extension if not exists "pgcrypto";

-- ----------------------------------------------------------------------------
-- 1. TABLES (FK-safe order)
-- ----------------------------------------------------------------------------

-- profiles: 1:1 with auth.users. Inserted by handle_new_user trigger only.
create table if not exists public.profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  full_name    text not null,
  role         text not null check (role in
                 ('captain','charter_party','ship_agent','port_authority','supplier','admin')),
  company_name text,
  phone        text,
  verified     boolean not null default false,
  avatar_url   text,
  push_token   text,
  created_at   timestamptz not null default now()
);

create table if not exists public.ports (
  id      uuid primary key default gen_random_uuid(),
  name    text not null,
  country text,
  locode  text unique,
  active  boolean not null default true
);

create table if not exists public.service_categories (
  id                                uuid primary key default gen_random_uuid(),
  name                              text not null,
  requires_port_authority_approval  boolean not null default false,
  icon_name                         text
);

create table if not exists public.supplier_service_mappings (
  id                  uuid primary key default gen_random_uuid(),
  port_id             uuid references public.ports(id) on delete cascade,
  service_category_id uuid references public.service_categories(id) on delete cascade,
  supplier_profile_id uuid references public.profiles(id) on delete set null,
  active              boolean not null default true,
  unique (port_id, service_category_id)   -- exactly 1 supplier per service per port
);

create table if not exists public.orders (
  id               uuid primary key default gen_random_uuid(),
  order_number     text unique,
  captain_id       uuid references public.profiles(id),
  vessel_name      text not null,
  imo_number       text,
  port_id          uuid references public.ports(id),
  eta              timestamptz,
  etd              timestamptz,
  overall_status   text not null default 'draft' check (overall_status in
                     ('draft','pending_charter_approval','charter_rejected',
                      'pending_payment','pending_port_approval',
                      'active','in_execution','completed','cancelled')),
  charter_party_id uuid references public.profiles(id),
  ship_agent_id    uuid references public.profiles(id),
  charter_comments text,
  total_amount     numeric(12,2),
  payment_method   text check (payment_method in ('online','cod')),
  payment_status   text default 'unpaid' check (payment_status in ('unpaid','paid','refunded')),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create table if not exists public.order_line_items (
  id                   uuid primary key default gen_random_uuid(),
  order_id             uuid not null references public.orders(id) on delete cascade,
  service_category_id  uuid references public.service_categories(id),
  supplier_mapping_id  uuid references public.supplier_service_mappings(id),
  quantity             numeric,
  unit                 text,
  specifications       text,
  special_instructions text,
  requested_datetime   timestamptz,
  unit_price           numeric(12,2),
  total_price          numeric(12,2),
  line_status          text not null default 'pending_supplier' check (line_status in
                         ('pending_supplier','supplier_accepted','supplier_declined',
                          'preparing','ready','in_transit','delivered','cancelled')),
  supplier_decline_reason text,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

create table if not exists public.order_status_updates (
  id                 uuid primary key default gen_random_uuid(),
  order_line_item_id uuid references public.order_line_items(id) on delete cascade,
  updated_by         uuid references public.profiles(id),
  old_status         text,
  new_status         text,
  note               text,
  created_at         timestamptz not null default now()
);

create table if not exists public.order_documents (
  id                 uuid primary key default gen_random_uuid(),
  order_id           uuid references public.orders(id) on delete cascade,
  order_line_item_id uuid references public.order_line_items(id) on delete cascade,
  uploaded_by        uuid references public.profiles(id),
  file_name          text,
  file_url           text,
  document_type      text check (document_type in
                       ('invoice','delivery_note','certificate','approval_doc','other')),
  created_at         timestamptz not null default now()
);

create table if not exists public.messages (
  id                 uuid primary key default gen_random_uuid(),
  order_id           uuid references public.orders(id) on delete cascade,
  order_line_item_id uuid references public.order_line_items(id) on delete cascade,
  sender_id          uuid references public.profiles(id),
  content            text not null,
  read_by            uuid[] default '{}',
  created_at         timestamptz not null default now()
);

create table if not exists public.notifications (
  id           uuid primary key default gen_random_uuid(),
  recipient_id uuid references public.profiles(id) on delete cascade,
  title        text,
  body         text,
  type         text check (type in ('approval_request','order_update','message','system')),
  order_id     uuid references public.orders(id) on delete cascade,
  read         boolean not null default false,
  created_at   timestamptz not null default now()
);

-- Indexes on every column referenced by RLS predicates (per-row evaluation).
create index if not exists idx_orders_captain        on public.orders(captain_id);
create index if not exists idx_orders_charter        on public.orders(charter_party_id);
create index if not exists idx_orders_agent          on public.orders(ship_agent_id);
create index if not exists idx_orders_port           on public.orders(port_id);
create index if not exists idx_oli_order             on public.order_line_items(order_id);
create index if not exists idx_oli_mapping           on public.order_line_items(supplier_mapping_id);
create index if not exists idx_mappings_supplier     on public.supplier_service_mappings(supplier_profile_id);
create index if not exists idx_mappings_port_service on public.supplier_service_mappings(port_id, service_category_id);
create index if not exists idx_notifications_recip   on public.notifications(recipient_id);
create index if not exists idx_messages_order        on public.messages(order_id);
create index if not exists idx_messages_line         on public.messages(order_line_item_id);
create index if not exists idx_docs_order            on public.order_documents(order_id);
create index if not exists idx_status_updates_line   on public.order_status_updates(order_line_item_id);

-- ----------------------------------------------------------------------------
-- 2. SECURITY DEFINER HELPER FUNCTIONS (recursion breakers) — BEFORE policies
--    These run as owner, bypassing inner-table RLS, exposing only booleans.
-- ----------------------------------------------------------------------------

create or replace function public.current_user_role()
returns text
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select role from public.profiles where id = auth.uid();
$$;

create or replace function public.current_user_verified()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce((select verified from public.profiles where id = auth.uid()), false);
$$;

-- True when a supplier owns the mapping behind a given line item.
create or replace function public.supplier_owns_line_item(p_line_item_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.order_line_items oli
    join public.supplier_service_mappings m on m.id = oli.supplier_mapping_id
    where oli.id = p_line_item_id
      and m.supplier_profile_id = auth.uid()
  );
$$;

-- True when the current port_authority user may see an order
-- (the order's port has at least one service requiring PA approval).
create or replace function public.port_authority_sees_order(p_order_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.order_line_items oli
    join public.service_categories sc on sc.id = oli.service_category_id
    where oli.order_id = p_order_id
      and sc.requires_port_authority_approval = true
  );
$$;

-- The master order-visibility gate used by orders/messages/documents policies.
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

  if v_role = 'port_authority' and public.port_authority_sees_order(p_order_id) then
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

-- ----------------------------------------------------------------------------
-- 3. ENABLE RLS + POLICIES
-- ----------------------------------------------------------------------------

alter table public.profiles                  enable row level security;
alter table public.ports                      enable row level security;
alter table public.service_categories         enable row level security;
alter table public.supplier_service_mappings  enable row level security;
alter table public.orders                     enable row level security;
alter table public.order_line_items           enable row level security;
alter table public.order_status_updates       enable row level security;
alter table public.order_documents            enable row level security;
alter table public.messages                   enable row level security;
alter table public.notifications              enable row level security;

-- profiles ------------------------------------------------------------------
-- Self row uses bare auth.uid() = id (never a helper that selects profiles).
drop policy if exists profiles_select_self on public.profiles;
create policy profiles_select_self on public.profiles
  for select using (auth.uid() = id or public.current_user_role() = 'admin');

drop policy if exists profiles_update_self on public.profiles;
create policy profiles_update_self on public.profiles
  for update using (auth.uid() = id or public.current_user_role() = 'admin')
  with check (auth.uid() = id or public.current_user_role() = 'admin');
-- No client INSERT policy: profiles are created exclusively by handle_new_user.

-- Allow authenticated users to look up other profiles for assignment pickers
-- (captain searching charter_party / ship_agent / supplier accounts).
drop policy if exists profiles_select_directory on public.profiles;
create policy profiles_select_directory on public.profiles
  for select using (auth.role() = 'authenticated');

-- ports / service_categories: readable by all authenticated; writable by admin.
drop policy if exists ports_select on public.ports;
create policy ports_select on public.ports
  for select using (auth.role() = 'authenticated');
drop policy if exists ports_admin_write on public.ports;
create policy ports_admin_write on public.ports
  for all using (public.current_user_role() = 'admin')
  with check (public.current_user_role() = 'admin');

drop policy if exists svc_select on public.service_categories;
create policy svc_select on public.service_categories
  for select using (auth.role() = 'authenticated');
drop policy if exists svc_admin_write on public.service_categories;
create policy svc_admin_write on public.service_categories
  for all using (public.current_user_role() = 'admin')
  with check (public.current_user_role() = 'admin');

-- supplier_service_mappings: readable by authenticated (needed for assignment +
-- supplier discovery); writable by admin only.
drop policy if exists mappings_select on public.supplier_service_mappings;
create policy mappings_select on public.supplier_service_mappings
  for select using (auth.role() = 'authenticated');
drop policy if exists mappings_admin_write on public.supplier_service_mappings;
create policy mappings_admin_write on public.supplier_service_mappings
  for all using (public.current_user_role() = 'admin')
  with check (public.current_user_role() = 'admin');

-- orders --------------------------------------------------------------------
-- SELECT references the row's OWN columns directly for the captain/charter/agent
-- fast-path. This is both faster and—critically—correct for INSERT ... RETURNING
-- (return=representation): a helper that re-queries `orders` cannot see the
-- just-inserted row mid-statement, which would wrongly deny the captain their
-- own new row. Supplier/PA paths still use subqueries (they never apply to a
-- fresh draft insert).
drop policy if exists orders_select on public.orders;
create policy orders_select on public.orders
  for select using (
    captain_id = auth.uid()
    or charter_party_id = auth.uid()
    or ship_agent_id = auth.uid()
    or public.current_user_role() = 'admin'
    or (public.current_user_role() = 'port_authority'
        and public.port_authority_sees_order(id))
    or (public.current_user_role() = 'supplier' and exists (
          select 1
          from public.order_line_items oli
          join public.supplier_service_mappings m on m.id = oli.supplier_mapping_id
          where oli.order_id = orders.id
            and m.supplier_profile_id = auth.uid()))
  );

drop policy if exists orders_captain_insert on public.orders;
create policy orders_captain_insert on public.orders
  for insert with check (
    captain_id = auth.uid() and public.current_user_role() = 'captain'
  );

drop policy if exists orders_captain_update on public.orders;
create policy orders_captain_update on public.orders
  for update using (captain_id = auth.uid() or public.current_user_role() = 'admin')
  with check (captain_id = auth.uid() or public.current_user_role() = 'admin');

drop policy if exists orders_captain_delete on public.orders;
create policy orders_captain_delete on public.orders
  for delete using (
    (captain_id = auth.uid() and overall_status in ('draft','charter_rejected'))
    or public.current_user_role() = 'admin'
  );

-- order_line_items ----------------------------------------------------------
drop policy if exists oli_select on public.order_line_items;
create policy oli_select on public.order_line_items
  for select using (public.user_can_access_order(order_id));

drop policy if exists oli_captain_insert on public.order_line_items;
create policy oli_captain_insert on public.order_line_items
  for insert with check (
    exists (select 1 from public.orders o
            where o.id = order_id and o.captain_id = auth.uid())
  );

-- Captain may update items on their own order; supplier may update their own
-- line (column scope enforced by the guard trigger below).
drop policy if exists oli_update on public.order_line_items;
create policy oli_update on public.order_line_items
  for update using (
    public.supplier_owns_line_item(id)
    or exists (select 1 from public.orders o
               where o.id = order_id and o.captain_id = auth.uid())
    or public.current_user_role() = 'admin'
  )
  with check (
    public.supplier_owns_line_item(id)
    or exists (select 1 from public.orders o
               where o.id = order_id and o.captain_id = auth.uid())
    or public.current_user_role() = 'admin'
  );

drop policy if exists oli_captain_delete on public.order_line_items;
create policy oli_captain_delete on public.order_line_items
  for delete using (
    exists (select 1 from public.orders o
            where o.id = order_id and o.captain_id = auth.uid()
              and o.overall_status in ('draft','charter_rejected'))
    or public.current_user_role() = 'admin'
  );

-- order_status_updates: insert/select by any party who can access the order;
-- immutable (no update/delete).
drop policy if exists status_updates_select on public.order_status_updates;
create policy status_updates_select on public.order_status_updates
  for select using (
    exists (select 1 from public.order_line_items oli
            where oli.id = order_line_item_id
              and public.user_can_access_order(oli.order_id))
  );
drop policy if exists status_updates_insert on public.order_status_updates;
create policy status_updates_insert on public.order_status_updates
  for insert with check (
    updated_by = auth.uid()
    and exists (select 1 from public.order_line_items oli
                where oli.id = order_line_item_id
                  and public.user_can_access_order(oli.order_id))
  );

-- order_documents -----------------------------------------------------------
drop policy if exists docs_select on public.order_documents;
create policy docs_select on public.order_documents
  for select using (public.user_can_access_order(order_id));
drop policy if exists docs_insert on public.order_documents;
create policy docs_insert on public.order_documents
  for insert with check (
    uploaded_by = auth.uid() and public.user_can_access_order(order_id)
  );

-- messages ------------------------------------------------------------------
-- Read: any order party. Supplier narrowed to messages tied to their line item.
drop policy if exists messages_select on public.messages;
create policy messages_select on public.messages
  for select using (
    public.user_can_access_order(order_id)
    and (
      public.current_user_role() <> 'supplier'
      or order_line_item_id is null
      or public.supplier_owns_line_item(order_line_item_id)
    )
  );
drop policy if exists messages_insert on public.messages;
create policy messages_insert on public.messages
  for insert with check (
    sender_id = auth.uid()
    and public.user_can_access_order(order_id)
    and (
      public.current_user_role() <> 'supplier'
      or (order_line_item_id is not null
          and public.supplier_owns_line_item(order_line_item_id))
    )
  );
-- Allow updating read_by (mark-as-read) for any order party.
drop policy if exists messages_update_read on public.messages;
create policy messages_update_read on public.messages
  for update using (public.user_can_access_order(order_id))
  with check (public.user_can_access_order(order_id));

-- notifications: own only ---------------------------------------------------
drop policy if exists notifications_select on public.notifications;
create policy notifications_select on public.notifications
  for select using (recipient_id = auth.uid());
drop policy if exists notifications_update on public.notifications;
create policy notifications_update on public.notifications
  for update using (recipient_id = auth.uid())
  with check (recipient_id = auth.uid());
-- Inserts come from service-role edge functions (bypass RLS); no client insert.

-- ----------------------------------------------------------------------------
-- 4. TRIGGERS & SUPPORTING FUNCTIONS
-- ----------------------------------------------------------------------------

-- 4a. Auto-create profile on new auth user.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_role text := coalesce(new.raw_user_meta_data->>'role', 'captain');
begin
  if v_role not in ('captain','charter_party','ship_agent','port_authority','supplier','admin') then
    raise exception 'Invalid role: %', v_role;
  end if;

  insert into public.profiles (id, full_name, role, company_name, phone, verified)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', 'New User'),
    v_role,
    new.raw_user_meta_data->>'company_name',
    new.raw_user_meta_data->>'phone',
    false
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 4b. Order number: per-year counter table + sequence-style allocation.
create table if not exists public.order_number_counters (
  year     int primary key,
  last_seq int not null default 0
);
-- Only the SECURITY DEFINER trigger writes this; deny client roles entirely.
-- (No RLS — instead revoke table privileges, since the definer trigger owner
-- does not bypass an empty-policy RLS in the Supabase `postgres` role context.)
revoke all on public.order_number_counters from anon, authenticated;

create or replace function public.assign_order_number()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_year int := extract(year from coalesce(new.created_at, now()))::int;
  v_seq  int;
begin
  if new.order_number is not null then
    return new;
  end if;

  insert into public.order_number_counters (year, last_seq)
  values (v_year, 1)
  on conflict (year)
  do update set last_seq = public.order_number_counters.last_seq + 1
  returning last_seq into v_seq;

  new.order_number := 'HS-' || v_year::text || '-' || lpad(v_seq::text, 5, '0');
  return new;
end;
$$;

drop trigger if exists trg_orders_number on public.orders;
create trigger trg_orders_number
  before insert on public.orders
  for each row execute function public.assign_order_number();

-- 4c. updated_at touch triggers.
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_orders_touch on public.orders;
create trigger trg_orders_touch
  before update on public.orders
  for each row execute function public.touch_updated_at();

drop trigger if exists trg_oli_touch on public.order_line_items;
create trigger trg_oli_touch
  before update on public.order_line_items
  for each row execute function public.touch_updated_at();

-- 4d. Supplier line-item guard: a supplier may change only line_status and
--     supplier_decline_reason. Captains/admin are unrestricted.
create or replace function public.guard_line_item_update()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_jwt_role    text := coalesce(
                   current_setting('request.jwt.claim.role', true),
                   (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role'),
                   '');
  v_role        text;
  v_is_captain  boolean;
begin
  -- Privileged contexts bypass the guard: service-role edge functions (which
  -- legitimately set supplier_mapping_id / prices) and direct DB connections
  -- (migrations, admin scripts — no JWT present). NOTE: we must read the JWT
  -- role claim, NOT current_user — this function is SECURITY DEFINER, so
  -- current_user is always the owner and cannot identify the caller.
  if v_jwt_role in ('service_role', '') then
    return new;
  end if;

  v_role := public.current_user_role();
  v_is_captain := exists (
    select 1 from public.orders o
    where o.id = new.order_id and o.captain_id = auth.uid()
  );

  if v_role = 'admin' or v_is_captain then
    return new;  -- unrestricted
  end if;

  -- Supplier path: reject changes to any column except status/decline reason.
  if new.order_id              is distinct from old.order_id
     or new.service_category_id is distinct from old.service_category_id
     or new.supplier_mapping_id is distinct from old.supplier_mapping_id
     or new.quantity            is distinct from old.quantity
     or new.unit                is distinct from old.unit
     or new.specifications      is distinct from old.specifications
     or new.special_instructions is distinct from old.special_instructions
     or new.requested_datetime  is distinct from old.requested_datetime
     or new.unit_price          is distinct from old.unit_price
     or new.total_price         is distinct from old.total_price then
    raise exception 'Suppliers may only update line_status and decline reason';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_oli_guard on public.order_line_items;
create trigger trg_oli_guard
  before update on public.order_line_items
  for each row execute function public.guard_line_item_update();

-- 4e. Audit trail: record every line_status change.
create or replace function public.log_line_status_change()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.line_status is distinct from old.line_status then
    insert into public.order_status_updates
      (order_line_item_id, updated_by, old_status, new_status, note)
    values
      (new.id, auth.uid(), old.line_status, new.line_status, new.supplier_decline_reason);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_oli_audit on public.order_line_items;
create trigger trg_oli_audit
  after update on public.order_line_items
  for each row execute function public.log_line_status_change();

-- ----------------------------------------------------------------------------
-- 5. REALTIME publication + REPLICA IDENTITY FULL
-- ----------------------------------------------------------------------------
alter table public.orders            replica identity full;
alter table public.order_line_items  replica identity full;
alter table public.messages          replica identity full;
alter table public.notifications     replica identity full;

do $$
begin
  -- Add tables to the realtime publication if not already present.
  if not exists (select 1 from pg_publication_tables
                 where pubname='supabase_realtime' and tablename='orders') then
    alter publication supabase_realtime add table public.orders;
  end if;
  if not exists (select 1 from pg_publication_tables
                 where pubname='supabase_realtime' and tablename='order_line_items') then
    alter publication supabase_realtime add table public.order_line_items;
  end if;
  if not exists (select 1 from pg_publication_tables
                 where pubname='supabase_realtime' and tablename='messages') then
    alter publication supabase_realtime add table public.messages;
  end if;
  if not exists (select 1 from pg_publication_tables
                 where pubname='supabase_realtime' and tablename='notifications') then
    alter publication supabase_realtime add table public.notifications;
  end if;
end $$;

-- ----------------------------------------------------------------------------
-- 6. STORAGE bucket + policies (private, signed URLs)
-- ----------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('order-documents', 'order-documents', false)
on conflict (id) do nothing;

-- Path convention: orders/{order_id}/{line_item_id}/{filename}
-- (split_part(name,'/',2) = order_id). Access gated by order visibility.
drop policy if exists order_docs_read on storage.objects;
create policy order_docs_read on storage.objects
  for select using (
    bucket_id = 'order-documents'
    and public.user_can_access_order((split_part(name, '/', 2))::uuid)
  );

drop policy if exists order_docs_write on storage.objects;
create policy order_docs_write on storage.objects
  for insert with check (
    bucket_id = 'order-documents'
    and public.user_can_access_order((split_part(name, '/', 2))::uuid)
  );

-- ----------------------------------------------------------------------------
-- 7. SEED DATA
-- ----------------------------------------------------------------------------
insert into public.service_categories (name, requires_port_authority_approval, icon_name) values
  ('Bunkering',          true,  'flame'),
  ('De-bunkering',       true,  'flame-outline'),
  ('Food & Provisions',  false, 'restaurant'),
  ('Medical Services',   false, 'medical'),
  ('Crew Exchange',      false, 'people'),
  ('Fresh Water Supply', true,  'water'),
  ('Waste Disposal',     true,  'trash'),
  ('Sludge Removal',     true,  'construct')
on conflict do nothing;

insert into public.ports (name, country, locode, active) values
  ('Colombo',   'Sri Lanka', 'LKCMB', true),
  ('Singapore', 'Singapore', 'SGSIN', true)
on conflict (locode) do nothing;

-- Admin bootstrap: after creating an admin auth user, promote + verify them:
--   update public.profiles set role='admin', verified=true where id='<auth-uid>';
