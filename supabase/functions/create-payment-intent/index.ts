// supabase/functions/create-payment-intent/index.ts
// Creates a Stripe PaymentIntent for an order. Total is RECOMPUTED server-side.
// Body: { order_id }
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import Stripe from 'https://esm.sh/stripe@14?target=deno';
import { corsHeaders, handleOptions } from '../_shared/cors.ts';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, {
  apiVersion: '2024-06-20',
  httpClient: Stripe.createFetchHttpClient(),
});

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return handleOptions();
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  try {
    const { order_id } = await req.json();
    if (!order_id) return json({ error: 'order_id is required' }, 400);

    // Load order.
    const { data: order, error: orderErr } = await supabase
      .from('orders')
      .select('*')
      .eq('id', order_id)
      .single();

    if (orderErr || !order) return json({ error: 'Order not found' }, 404);

    // Load line items and recompute total server-side (never trust client).
    // Fall back to quantity * unit_price for line items where total_price is NULL
    // (e.g. orders created before the total_price field was populated).
    const { data: lines, error: linesErr } = await supabase
      .from('order_line_items')
      .select('total_price, unit_price, quantity')
      .eq('order_id', order_id);

    if (linesErr) return json({ error: linesErr.message }, 500);

    // Compute total from line items, falling back through three levels of
    // data availability so existing orders with NULL pricing columns still work:
    //   1. total_price (preferred, authoritative)
    //   2. quantity * unit_price (backfill for old line items)
    //   3. order.total_amount (last resort — set at order-creation time)
    let total = (lines ?? []).reduce((sum, l) => {
      const lineTotal = l.total_price != null
        ? Number(l.total_price)
        : (Number(l.unit_price) || 0) * (Number(l.quantity) || 0);
      return sum + lineTotal;
    }, 0);

    if (total <= 0) {
      total = Number(order.total_amount) || 0;
    }

    if (total <= 0) {
      return json({ error: 'Order total must be greater than zero' }, 400);
    }

    const amount = Math.round(total * 100); // cents (USD)

    // Persist the authoritative total back to the order.
    await supabase
      .from('orders')
      .update({ total_amount: total, updated_at: new Date().toISOString() })
      .eq('id', order_id);

    // Resolve the captain profile to attach an email/name for the Stripe customer.
    // Auth admin lookup is best-effort — must not fail the payment intent.
    let email: string | undefined;
    let name: string | undefined;
    if (order.captain_id) {
      const { data: captain } = await supabase
        .from('profiles')
        .select('full_name')
        .eq('id', order.captain_id)
        .single();
      name = captain?.full_name ?? undefined;
      try {
        const { data: authUser } = await supabase.auth.admin.getUserById(order.captain_id);
        email = authUser?.user?.email ?? undefined;
      } catch {
        console.error('Failed to resolve captain email for Stripe customer');
      }
    }

    // Create (or reuse) a Stripe customer.
    let customerId: string | undefined;
    if (email) {
      const existing = await stripe.customers.list({ email, limit: 1 });
      customerId = existing.data[0]?.id;
    }
    if (!customerId) {
      const params: Record<string, unknown> = {
        metadata: { captain_id: order.captain_id ?? '' },
      };
      if (email) params.email = email;
      if (name) params.name = name;
      const customer = await stripe.customers.create(params);
      customerId = customer.id;
    }

    // Ephemeral key for the PaymentSheet.
    const ephemeralKey = await stripe.ephemeralKeys.create(
      { customer: customerId },
      { apiVersion: '2024-06-20' },
    );

    const paymentIntent = await stripe.paymentIntents.create({
      amount,
      currency: 'usd',
      customer: customerId,
      automatic_payment_methods: { enabled: true },
      metadata: { order_id },
    });

    return json({
      paymentIntent: paymentIntent.client_secret,
      ephemeralKey: ephemeralKey.secret,
      customer: customerId,
      publishableKeyHint: undefined,
      amount,
    });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});
