-- 0010_supplier_visibility_fix.sql
-- Fixes supplier visibility for unassigned orders by matching on port_id and service_category_id
-- instead of relying strictly on supplier_mapping_id being set.

-- Update supplier_owns_line_item
CREATE OR REPLACE FUNCTION public.supplier_owns_line_item(p_line_item_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RETURN false;
  END IF;

  RETURN EXISTS (
    SELECT 1
    FROM public.order_line_items oli
    JOIN public.orders o ON o.id = oli.order_id
    LEFT JOIN public.supplier_service_mappings m1 ON m1.id = oli.supplier_mapping_id
    LEFT JOIN public.supplier_service_mappings m2 ON m2.service_category_id = oli.service_category_id AND m2.port_id = o.port_id
    WHERE oli.id = p_line_item_id
      AND (m1.supplier_profile_id = v_uid OR m2.supplier_profile_id = v_uid)
  );
END;
$$;

-- Update user_can_access_order
CREATE OR REPLACE FUNCTION public.user_can_access_order(p_order_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid  uuid := auth.uid();
  v_role text := public.current_user_role();
  v_ord  public.orders%rowtype;
BEGIN
  IF v_uid IS NULL THEN
    RETURN false;
  END IF;

  SELECT * INTO v_ord FROM public.orders WHERE id = p_order_id;
  IF NOT FOUND THEN
    RETURN false;
  END IF;

  IF v_ord.captain_id = v_uid
     OR v_ord.charter_party_id = v_uid
     OR v_ord.ship_agent_id = v_uid THEN
    RETURN true;
  END IF;

  IF v_role = 'admin' THEN
    RETURN true;
  END IF;

  IF v_role = 'supplier' AND v_ord.overall_status NOT IN ('draft', 'charter_rejected', 'pending_charter_approval') AND EXISTS (
    SELECT 1
    FROM public.order_line_items oli
    LEFT JOIN public.supplier_service_mappings m1 ON m1.id = oli.supplier_mapping_id
    LEFT JOIN public.supplier_service_mappings m2 ON m2.service_category_id = oli.service_category_id AND m2.port_id = v_ord.port_id
    WHERE oli.order_id = p_order_id
      AND (m1.supplier_profile_id = v_uid OR m2.supplier_profile_id = v_uid)
  ) THEN
    RETURN true;
  END IF;

  RETURN false;
END;
$$;

-- Update orders_select policy (must use user_can_access_order to prevent infinite recursion)
DROP POLICY IF EXISTS orders_select ON public.orders;
CREATE POLICY orders_select ON public.orders
  FOR SELECT USING (
    captain_id = auth.uid()
    OR charter_party_id = auth.uid()
    OR ship_agent_id = auth.uid()
    OR public.current_user_role() = 'admin'
    OR public.user_can_access_order(id)
  );

-- Add missing RLS policy for active_sessions user self-upsert
DROP POLICY IF EXISTS active_sessions_self ON public.active_sessions;
CREATE POLICY active_sessions_self ON public.active_sessions
  FOR ALL USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

