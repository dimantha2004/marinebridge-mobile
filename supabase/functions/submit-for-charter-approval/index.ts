// submit-for-charter-approval: validate the order then move it to charter review.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders, handleOptions } from '../_shared/cors.ts';
import { sendExpoPush } from '../_shared/expoPush.ts';

interface SubmitBody {
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

  let payload: SubmitBody;
  try {
    payload = await req.json();
  } catch {
    return json({ ok: false, error: 'Invalid JSON body' }, 400);
  }

  const { order_id } = payload;
  if (!order_id) {
    return json({ ok: false, error: 'order_id is required' }, 400);
  }

  // Load the order.
  const { data: order, error: orderError } = await supabase
    .from('orders')
    .select('id, vessel_name, order_number, charter_party_id')
    .eq('id', order_id)
    .single();

  if (orderError || !order) {
    return json({ ok: false, error: 'Order not found' }, 404);
  }

  if (!order.charter_party_id) {
    return json({ ok: false, error: 'Order has no charter party assigned' }, 400);
  }

  // Load line items and verify each is assigned to a supplier mapping.
  const { data: lines, error: linesError } = await supabase
    .from('order_line_items')
    .select('id, supplier_mapping_id')
    .eq('order_id', order_id);

  if (linesError) {
    return json({ ok: false, error: linesError.message }, 500);
  }
  if (!lines || lines.length === 0) {
    return json({ ok: false, error: 'Order has no line items' }, 400);
  }



  // Move the order into charter approval.
  const { error: statusError } = await supabase
    .from('orders')
    .update({ overall_status: 'pending_charter_approval' })
    .eq('id', order_id);

  if (statusError) {
    return json({ ok: false, error: statusError.message }, 500);
  }

  // Notify the charter party (best-effort — must not fail the submission).
  const title = 'Approval requested';
  const body = `Order ${order.order_number ?? order.id} for ${order.vessel_name} is awaiting your approval.`;

  const { error: notifError } = await supabase.from('notifications').insert({
    recipient_id: order.charter_party_id,
    title,
    body,
    type: 'approval_request',
    order_id,
  });

  if (notifError) {
    console.error('Failed to insert notification:', notifError.message);
  }

  // Look up the charter party's push token and send (best-effort).
  const { data: charterProfile } = await supabase
    .from('profiles')
    .select('push_token')
    .eq('id', order.charter_party_id)
    .maybeSingle();

  await sendExpoPush(
    [charterProfile?.push_token ?? null],
    title,
    body,
    { order_id, type: 'approval_request' },
  );

  return json({ ok: true });
});
