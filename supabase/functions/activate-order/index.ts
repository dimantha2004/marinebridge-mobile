// supabase/functions/activate-order/index.ts
// Activates an order. COD path (called directly after COD checkout) and a manual
// fallback. Same activation logic as the stripe-webhook's inline activation.
// Body: { order_id }
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders, handleOptions } from '../_shared/cors.ts';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

/** Best-effort Expo push. Never throws. */
async function sendPush(pushToken: string | null, title: string, body: string, data: Record<string, unknown>) {
  if (!pushToken) return;
  try {
    await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ to: pushToken, sound: 'default', title, body, data }),
    });
  } catch (_e) {
    // swallow
  }
}

/**
 * Activate an order: determine whether any line requires Port Authority approval.
 * If so -> 'pending_port_approval', else -> 'active'. Notify the ship agent,
 * captain, any relevant port authority (when PA required), and each assigned
 * supplier (resolved via supplier_service_mappings on each line).
 */
async function activateOrder(orderId: string) {
  const { data: order, error: orderErr } = await supabase
    .from('orders')
    .select('*')
    .eq('id', orderId)
    .single();
  if (orderErr || !order) throw new Error('Order not found');

  const { data: lines } = await supabase
    .from('order_line_items')
    .select(
      'id, service_categories(requires_port_authority_approval)',
    )
    .eq('order_id', orderId);

  let requiresPA = false;

  for (const line of (lines ?? []) as any[]) {
    if (line.service_categories?.requires_port_authority_approval) requiresPA = true;
  }

  const newStatus = requiresPA ? 'pending_port_approval' : 'active';

  const { error: updateErr } = await supabase
    .from('orders')
    .update({ overall_status: newStatus, updated_at: new Date().toISOString() })
    .eq('id', orderId);
  if (updateErr) throw new Error(updateErr.message);

  const recipientIds = new Set<string>();
  if (order.ship_agent_id) recipientIds.add(order.ship_agent_id);
  if (order.captain_id) recipientIds.add(order.captain_id);

  if (requiresPA && order.port_id) {
    const { data: pas } = await supabase
      .from('profiles')
      .select('id')
      .eq('role', 'port_authority');
    for (const pa of pas ?? []) recipientIds.add(pa.id);
  }

  const title = requiresPA ? 'Order Awaiting Port Approval' : 'Order Activated';
  const body = requiresPA
    ? `Order ${order.order_number ?? ''} is awaiting port authority approval.`.trim()
    : `Order ${order.order_number ?? ''} is now active.`.trim();

  const ids = [...recipientIds];
  if (ids.length) {
    await supabase.from('notifications').insert(
      ids.map((rid) => ({
        recipient_id: rid,
        title,
        body,
        type: 'order_update' as const,
        order_id: orderId,
        read: false,
      })),
    );

    const { data: profiles } = await supabase
      .from('profiles')
      .select('push_token')
      .in('id', ids);
    for (const p of profiles ?? []) {
      await sendPush(p.push_token ?? null, title, body, { order_id: orderId });
    }
  }

  return { requiresPA, newStatus };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return handleOptions();
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  try {
    const { order_id } = await req.json();
    if (!order_id) return json({ error: 'order_id is required' }, 400);

    await activateOrder(order_id);
    return json({ ok: true });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});
