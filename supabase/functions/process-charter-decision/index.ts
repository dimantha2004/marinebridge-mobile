// supabase/functions/process-charter-decision/index.ts
// Charter party approves or rejects an order.
// Body: { order_id, decision: 'approved' | 'rejected', comments?: string }
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

/** Best-effort Expo push notification. Never throws. */
async function sendPush(pushToken: string | null, title: string, body: string, data: Record<string, unknown>) {
  if (!pushToken) return;
  try {
    await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ to: pushToken, sound: 'default', title, body, data }),
    });
  } catch (_e) {
    // swallow push errors — they must not fail the request
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return handleOptions();
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  try {
    const body = await req.json();
    const order_id = body.order_id;
    const comments = body.comments;
    // Accept both 'approved'/'rejected' and 'approve'/'reject' (UI shorthand).
    const raw = String(body.decision ?? '').toLowerCase();
    const decision = raw.startsWith('approv') ? 'approved' : raw.startsWith('reject') ? 'rejected' : null;

    if (!order_id || !decision) {
      return json({ error: 'order_id and decision (approved|rejected) are required' }, 400);
    }

    const { data: order, error: orderErr } = await supabase
      .from('orders')
      .select('*')
      .eq('id', order_id)
      .single();

    if (orderErr || !order) {
      return json({ error: 'Order not found' }, 404);
    }

    if (decision === 'approved') {
      const { error: updErr } = await supabase
        .from('orders')
        .update({
          overall_status: 'pending_payment',
          charter_comments: comments ?? null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', order_id);

      if (updErr) return json({ error: updErr.message }, 500);
      return json({ ok: true });
    }

    // decision === 'rejected'
    const { error: updErr } = await supabase
      .from('orders')
      .update({
        overall_status: 'charter_rejected',
        charter_comments: comments ?? null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', order_id);

    if (updErr) return json({ error: updErr.message }, 500);

    // Notify the captain of the rejection.
    if (order.captain_id) {
      const title = 'Order Rejected by Charterer';
      const body = comments
        ? `Order ${order.order_number ?? ''} was rejected: ${comments}`.trim()
        : `Order ${order.order_number ?? ''} was rejected by the charterer.`.trim();

      await supabase.from('notifications').insert({
        recipient_id: order.captain_id,
        title,
        body,
        type: 'order_update',
        order_id,
        read: false,
      });

      const { data: captain } = await supabase
        .from('profiles')
        .select('push_token')
        .eq('id', order.captain_id)
        .single();

      await sendPush(captain?.push_token ?? null, title, body, { order_id });
    }

    return json({ ok: true });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});
