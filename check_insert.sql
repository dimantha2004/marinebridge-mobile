do $$
begin
  insert into auth.users (id, email, encrypted_password, email_confirmed_at, confirmed_at, instance_id, role, aud, raw_app_meta_data, raw_user_meta_data, is_sso_user, is_anonymous, created_at, updated_at) values (gen_random_uuid(), 'errorcheck@test.com', crypt('Test123', gen_salt('bf', 10)), now(), now(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', '{}'::jsonb, jsonb_build_object('role','captain'), false, false, now(), now());
  raise notice 'SUCCESS';
exception when others then
  raise notice 'ERROR: %', sqlerrm;
end;
$$;
