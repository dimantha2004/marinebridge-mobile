// assign-suppliers: match each order line item to an active supplier mapping.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders, handleOptions } from '../_shared/cors.ts';

interface AssignBody {
  order_id?: string;
}

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  const preflight = handleOptions(req);
  if (preflight) return preflight;

  if (req.method !== 'POST') {
    return json({ ok: false, error: 'Method not allowed' }, 405);
  }

  let payload: AssignBody;
  try {
    payload = await req.json();
  } catch {
    return json({ ok: false, error: 'Invalid JSON body' }, 400);
  }

  const { order_id } = payload;
  if (!order_id) {
    return json({ ok: false, error: 'order_id is required' }, 400);
  }

  // Load the order to get its port.
  const { data: order, error: orderError } = await supabase
    .from('orders')
    .select('id, port_id')
    .eq('id', order_id)
    .single();

  if (orderError || !order) {
    return json({ ok: false, error: 'Order not found' }, 404);
  }
  if (!order.port_id) {
    return json({ ok: false, error: 'Order has no port assigned' }, 400);
  }

  // Load the order line items.
  const { data: lines, error: linesError } = await supabase
    .from('order_line_items')
    .select('id, service_category_id, supplier_mapping_id')
    .eq('order_id', order_id);

  if (linesError) {
    return json({ ok: false, error: linesError.message }, 500);
  }
  if (!lines || lines.length === 0) {
    return json({ ok: false, error: 'Order has no line items' }, 400);
  }

  // Resolve a mapping for each line first; only persist if all are mappable.
  const unmapped: string[] = [];
  const assignments: { lineId: string; mappingId: string }[] = [];

  for (const line of lines) {
    if (!line.service_category_id) {
      unmapped.push(line.id);
      continue;
    }

    const { data: mapping, error: mappingError } = await supabase
      .from('supplier_service_mappings')
      .select('id')
      .eq('port_id', order.port_id)
      .eq('service_category_id', line.service_category_id)
      .eq('active', true)
      .limit(1)
      .maybeSingle();

    if (mappingError) {
      return json({ ok: false, error: mappingError.message }, 500);
    }

    if (!mapping) {
      unmapped.push(line.service_category_id);
      continue;
    }

    assignments.push({ lineId: line.id, mappingId: mapping.id });
  }

  if (unmapped.length > 0) {
    // Do NOT partially assign.
    return json({ ok: false, unmapped }, 400);
  }

  // Persist all assignments.
  for (const { lineId, mappingId } of assignments) {
    const { error: updateError } = await supabase
      .from('order_line_items')
      .update({ supplier_mapping_id: mappingId })
      .eq('id', lineId);

    if (updateError) {
      return json({ ok: false, error: updateError.message }, 500);
    }
  }

  return json({ ok: true });
});
