-- ============================================================================
-- Marianbridge — Restrict Supplier Chat Permissions
-- 0004_supplier_chat_permissions.sql
-- ============================================================================

-- Remove supplier chat permissions with all roles except ship_agent
delete from public.chat_permissions where sender_role = 'supplier' and receiver_role != 'ship_agent';
delete from public.chat_permissions where receiver_role = 'supplier' and sender_role != 'ship_agent';

-- Ensure supplier <-> ship_agent chat is allowed
insert into public.chat_permissions (sender_role, receiver_role) values ('supplier', 'ship_agent') on conflict do nothing;
insert into public.chat_permissions (sender_role, receiver_role) values ('ship_agent', 'supplier') on conflict do nothing;
