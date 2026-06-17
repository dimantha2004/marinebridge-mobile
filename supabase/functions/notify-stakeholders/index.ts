// notify-stakeholders: insert a notification row per recipient and push.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders, handleOptions } from '../_shared/cors.ts';
import { sendExpoPush } from '../_shared/expoPush.ts';

interface NotifyBody {
  order_id?: string | null;
  type?: string | null;
  title?: string;
  body?: string;
  recipient_ids?: string[];
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

  let payload: NotifyBody;
  try {
    payload = await req.json();
  } catch {
    return json({ ok: false, error: 'Invalid JSON body' }, 400);
  }

  const { order_id, type, title, body, recipient_ids } = payload;

  if (!title || !body) {
    return json({ ok: false, error: 'title and body are required' }, 400);
  }
  if (!Array.isArray(recipient_ids) || recipient_ids.length === 0) {
    return json({ ok: false, error: 'recipient_ids must be a non-empty array' }, 400);
  }

  // De-duplicate recipients.
  const recipients = [...new Set(recipient_ids.filter(Boolean))];

  // Insert one notification row per recipient.
  const rows = recipients.map((recipient_id) => ({
    recipient_id,
    title,
    body,
    type: (type ?? 'order_update') as never,
    order_id: order_id ?? null,
  }));

  const { error: insertError } = await supabase.from('notifications').insert(rows);
  if (insertError) {
    return json({ ok: false, error: insertError.message }, 500);
  }

  // Look up push tokens for the recipients.
  const { data: profiles, error: profileError } = await supabase
    .from('profiles')
    .select('id, push_token')
    .in('id', recipients);

  if (profileError) {
    return json({ ok: false, error: profileError.message }, 500);
  }

  const tokens = (profiles ?? []).map((p) => p.push_token);

  await sendExpoPush(tokens, title, body, {
    order_id: order_id ?? null,
    type: type ?? 'order_update',
  });

  return json({ ok: true, count: recipients.length });
});
