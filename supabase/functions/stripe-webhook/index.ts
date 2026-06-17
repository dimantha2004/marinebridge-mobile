// supabase/functions/stripe-webhook/index.ts
// Stripe webhook receiver. NOTE: set verify_jwt=false for this function
// (config: [functions.stripe-webhook] verify_jwt = false) — Stripe cannot send a
// Supabase JWT. This endpoint does NOT use CORS and reads the RAW request body
// (await req.text()) so the signature can be verified.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import Stripe from 'https://esm.sh/stripe@14?target=deno';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, {
  apiVersion: '2024-06-20',
  httpClient: Stripe.createFetchHttpClient(),
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
 * Activate a paid order: determine whether any line requires Port Authority
 * approval. If so -> 'pending_port_approval', else -> 'active'. Notify the ship
 * agent, captain, any relevant port authority (when PA required), and each
 * assigned supplier (resolved via supplier_service_mappings on each line).
 */
async function activateOrder(orderId: string) {
  const { data: order, error: orderErr } = await supabase
    .from('orders')
    .select('*')
    .eq('id', orderId)
    .single();
  if (orderErr || !order) return;

  // Load lines with their mapping -> service category (PA flag) and supplier.
  const { data: lines } = await supabase
    .from('order_line_items')
    .select(
      'id, supplier_mapping_id, supplier_service_mappings(supplier_profile_id, port_id, service_categories(requires_port_authority_approval))',
    )
    .eq('order_id', orderId);

  let requiresPA = false;
  const supplierIds = new Set<string>();

  for (const line of (lines ?? []) as any[]) {
    const mapping = line.supplier_service_mappings;
    if (!mapping) continue;
    if (mapping.supplier_profile_id) supplierIds.add(mapping.supplier_profile_id);
    if (mapping.service_categories?.requires_port_authority_approval) requiresPA = true;
  }

  const newStatus = requiresPA ? 'pending_port_approval' : 'active';

  await supabase
    .from('orders')
    .update({ overall_status: newStatus, updated_at: new Date().toISOString() })
    .eq('id', orderId);

  // Build recipient set.
  const recipientIds = new Set<string>();
  if (order.ship_agent_id) recipientIds.add(order.ship_agent_id);
  if (order.captain_id) recipientIds.add(order.captain_id);
  for (const sid of supplierIds) recipientIds.add(sid);

  // Port authorities for this port (only when PA approval is required).
  if (requiresPA && order.port_id) {
    const { data: pas } = await supabase
      .from('profiles')
      .select('id')
      .eq('role', 'port_authority');
    for (const pa of pas ?? []) recipientIds.add(pa.id);
  }

  const title = requiresPA ? 'Order Awaiting Port Approval' : 'Order Activated';
  const body = requiresPA
    ? `Order ${order.order_number ?? ''} is paid and awaiting port authority approval.`.trim()
    : `Order ${order.order_number ?? ''} is paid and now active.`.trim();

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
}

Deno.serve(async (req) => {
  const sig = req.headers.get('stripe-signature');
  const rawBody = await req.text(); // RAW body required for signature verification

  if (!sig) return new Response('Missing stripe-signature header', { status: 400 });

  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(
      rawBody,
      sig,
      Deno.env.get('STRIPE_WEBHOOK_SIGNING_SECRET')!,
    );
  } catch (e) {
    return new Response(`Webhook signature verification failed: ${(e as Error).message}`, {
      status: 400,
    });
  }

  try {
    if (event.type === 'payment_intent.succeeded') {
      const pi = event.data.object as Stripe.PaymentIntent;
      const orderId = pi.metadata?.order_id;
      if (orderId) {
        await supabase
          .from('orders')
          .update({ payment_status: 'paid', updated_at: new Date().toISOString() })
          .eq('id', orderId);

        await activateOrder(orderId);
      }
    }
  } catch (e) {
    // Log but still return 200 so Stripe does not retry indefinitely on our bugs.
    console.error('stripe-webhook handler error', (e as Error).message);
  }

  return new Response(JSON.stringify({ received: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
});
