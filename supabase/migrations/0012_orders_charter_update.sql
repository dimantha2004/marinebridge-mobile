-- 0012_orders_charter_update.sql
-- Allow charter parties to update orders they are associated with (e.g. to update total_amount when selecting quotes)

DROP POLICY IF EXISTS orders_charter_update ON public.orders;
CREATE POLICY orders_charter_update ON public.orders
  FOR UPDATE USING (
    charter_party_id = auth.uid() OR public.current_user_role() = 'admin'
  )
  WITH CHECK (
    charter_party_id = auth.uid() OR public.current_user_role() = 'admin'
  );
