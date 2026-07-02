-- ============================================================================
-- Force-create seed users — direct inserts into both auth + profiles
-- Ignores the trigger entirely by writing to both tables ourselves.
-- ============================================================================

-- Wipe any leftover rows from prior runs (order matters for FK safety).
delete from public.profiles where email like '%@marianbridge.test';
delete from auth.users    where email like '%@marianbridge.test';

-- Re-create users with manual profile inserts (trigger may also fire,
-- so we use on conflict do nothing / update).
do $$
declare
  v_uid uuid;
  v_cat record;
  v_seq int := 0;
begin
  -- admin
  v_uid := gen_random_uuid();
  insert into auth.users (id, email, encrypted_password, email_confirmed_at, instance_id, role, aud, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
    values (v_uid, 'admin@marianbridge.test', crypt('20040701@Dd', gen_salt('bf')), now(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', '{}'::jsonb,
            jsonb_build_object('role','admin','username','admin','full_name','Admin User'), now(), now());
  insert into public.profiles (id, full_name, role, username, email, verified) values (v_uid, 'Admin User', 'admin', 'admin', 'admin@marianbridge.test', true)
    on conflict (id) do update set verified = true;

  -- captain
  v_uid := gen_random_uuid();
  insert into auth.users (id, email, encrypted_password, email_confirmed_at, instance_id, role, aud, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
    values (v_uid, 'captain@marianbridge.test', crypt('20040701@Dd', gen_salt('bf')), now(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', '{}'::jsonb,
            jsonb_build_object('role','captain','username','captain','full_name','Captain User',
              'passport_no','PASS-001','sid_no','SID-001','cp_no','CP-001','imo_no','IMO-001','contract_date','2025-01-01'), now(), now());
  insert into public.profiles (id, full_name, role, username, email, verified, passport_no, sid_no, cp_no, imo_no, contract_date)
    values (v_uid, 'Captain User', 'captain', 'captain', 'captain@marianbridge.test', true, 'PASS-001','SID-001','CP-001','IMO-001','2025-01-01'::date)
    on conflict (id) do nothing;

  -- charter party
  v_uid := gen_random_uuid();
  insert into auth.users (id, email, encrypted_password, email_confirmed_at, instance_id, role, aud, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
    values (v_uid, 'charter-party@marianbridge.test', crypt('20040701@Dd', gen_salt('bf')), now(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', '{}'::jsonb,
            jsonb_build_object('role','charter_party','username','charter_party','full_name','Charter Party User',
              'company_name','Charter Corp','company_reg_no','CR-001','imo_agent_code','IAC-001','tin_no','TIN-001'), now(), now());
  insert into public.profiles (id, full_name, role, username, email, company_name, verified, company_reg_no, imo_agent_code, tin_no)
    values (v_uid, 'Charter Party User', 'charter_party', 'charter_party', 'charter-party@marianbridge.test', 'Charter Corp', true, 'CR-001','IAC-001','TIN-001')
    on conflict (id) do nothing;

  -- ship agent
  v_uid := gen_random_uuid();
  insert into auth.users (id, email, encrypted_password, email_confirmed_at, instance_id, role, aud, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
    values (v_uid, 'ship-agent@marianbridge.test', crypt('20040701@Dd', gen_salt('bf')), now(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', '{}'::jsonb,
            jsonb_build_object('role','ship_agent','username','ship_agent','full_name','Ship Agent User',
              'company_name','Ship Agent Ltd','company_reg_no','CR-002','imo_agent_code','IAC-002','tin_no','TIN-002'), now(), now());
  insert into public.profiles (id, full_name, role, username, email, company_name, verified, company_reg_no, imo_agent_code, tin_no)
    values (v_uid, 'Ship Agent User', 'ship_agent', 'ship_agent', 'ship-agent@marianbridge.test', 'Ship Agent Ltd', true, 'CR-002','IAC-002','TIN-002')
    on conflict (id) do nothing;



  -- suppliers (one per category)
  for v_cat in select id, name from public.service_categories order by name loop
    v_seq := v_seq + 1;
    v_uid := gen_random_uuid();
    insert into auth.users (id, email, encrypted_password, email_confirmed_at, instance_id, role, aud, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
      values (v_uid, 'supplier' || v_seq || '@marianbridge.test', crypt('20040701@Dd', gen_salt('bf')), now(),
              '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', '{}'::jsonb,
              jsonb_build_object('role','supplier','username','supplier_'||lower(replace(v_cat.name,' & ','_')),
                'full_name', v_cat.name || ' Supplier','company_name',v_cat.name||' Co',
                'business_no','BN-'||lpad(v_seq::text,3,'0'),'duns_no','DUNS-'||lpad(v_seq::text,3,'0'),
                'service_category_id', v_cat.id), now(), now());
    insert into public.profiles (id, full_name, role, username, email, company_name, verified, business_no, duns_no, service_category_id)
      values (v_uid, v_cat.name || ' Supplier', 'supplier', 'supplier_'||lower(replace(v_cat.name,' & ','_')),
              'supplier'||v_seq||'@marianbridge.test', v_cat.name||' Co', true,
              'BN-'||lpad(v_seq::text,3,'0'), 'DUNS-'||lpad(v_seq::text,3,'0'), v_cat.id)
      on conflict (id) do nothing;
  end loop;
end $$;

-- Refresh API cache
NOTIFY pgrst, 'reload schema';

-- Verify
select p.username, p.role, p.email, p.verified,
       sc.name as service_category
from public.profiles p
left join public.service_categories sc on sc.id = p.service_category_id
where p.email like '%@marianbridge.test'
order by p.role, sc.name;
