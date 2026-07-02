CREATE TABLE IF NOT EXISTS public.supplier_quotations (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    order_line_item_id UUID REFERENCES public.order_line_items(id) ON DELETE CASCADE,
    supplier_profile_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    amount NUMERIC(12,2) NOT NULL,
    description TEXT,
    is_selected BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- RLS
ALTER TABLE public.supplier_quotations ENABLE ROW LEVEL SECURITY;

CREATE POLICY sq_select ON public.supplier_quotations
  FOR SELECT USING (
    EXISTS (
        SELECT 1 FROM public.order_line_items oli
        WHERE oli.id = order_line_item_id
        AND public.user_can_access_order(oli.order_id)
    )
  );

CREATE POLICY sq_insert ON public.supplier_quotations
  FOR INSERT WITH CHECK (
    supplier_profile_id = auth.uid()
    AND public.supplier_owns_line_item(order_line_item_id)
  );

CREATE POLICY sq_update ON public.supplier_quotations
  FOR UPDATE USING (
    (public.current_user_role() = 'charter_party' AND EXISTS (
        SELECT 1 FROM public.orders o
        JOIN public.order_line_items oli ON o.id = oli.order_id
        WHERE oli.id = order_line_item_id AND o.charter_party_id = auth.uid()
    ))
    OR
    (supplier_profile_id = auth.uid() AND NOT is_selected)
  );

-- Modify line_status CHECK constraint
ALTER TABLE public.order_line_items DROP CONSTRAINT IF EXISTS order_line_items_line_status_check;
ALTER TABLE public.order_line_items ADD CONSTRAINT order_line_items_line_status_check
CHECK (line_status in ('pending_supplier','supplier_quoted','pending_charter_selection','supplier_accepted','supplier_declined','preparing','ready','in_transit','delivered','cancelled'));

-- Include in realtime publication if using Supabase realtime
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND tablename='supplier_quotations') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.supplier_quotations;
  END IF;
END $$;

-- Update guard trigger and RLS for order_line_items to allow charter party to update prices and status
CREATE OR REPLACE FUNCTION public.guard_line_item_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $func$
declare
  v_jwt_role    text := coalesce(
                   current_setting('request.jwt.claim.role', true),
                   (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role'),
                   '');
  v_role        text;
  v_is_captain  boolean;
  v_is_charter  boolean;
begin
  if v_jwt_role in ('service_role', '') then
    return new;
  end if;

  v_role := public.current_user_role();
  v_is_captain := exists (
    select 1 from public.orders o
    where o.id = new.order_id and o.captain_id = auth.uid()
  );
  v_is_charter := exists (
    select 1 from public.orders o
    where o.id = new.order_id and o.charter_party_id = auth.uid()
  );

  if v_role = 'admin' or v_is_captain or (v_role = 'charter_party' and v_is_charter) then
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
$func$;

DROP POLICY IF EXISTS oli_update ON public.order_line_items;
CREATE POLICY oli_update ON public.order_line_items
  FOR UPDATE USING (
    public.supplier_owns_line_item(id)
    OR EXISTS (SELECT 1 FROM public.orders o WHERE o.id = order_id AND o.captain_id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.orders o WHERE o.id = order_id AND o.charter_party_id = auth.uid())
    OR public.current_user_role() = 'admin'
  );
