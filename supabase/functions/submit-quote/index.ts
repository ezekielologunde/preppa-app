// deno-lint-ignore-file no-explicit-any
// submit-quote: a targeted prepper quotes a service request (amount + deposit). JWT-scoped;
// the caller must own a kitchen that the request was routed to.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { z } from 'https://esm.sh/zod@3.23.8';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'content-type': 'application/json' } });
}
function admin() {
  return createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '', { auth: { persistSession: false } });
}

const input = z.object({
  requestId: z.string().uuid(),
  amountCents: z.number().int().min(100).max(100000000),
  depositCents: z.number().int().min(0).max(100000000),
  note: z.string().max(1000).optional(),
});

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json(405, { error: 'method not allowed' });
  try {
    const db = admin();
    const jwt = (req.headers.get('Authorization') ?? '').replace('Bearer ', '');
    const { data: userData, error: userErr } = await db.auth.getUser(jwt);
    if (userErr || !userData.user) return json(401, { error: 'unauthorized' });
    const uid = userData.user.id;

    const parsed = input.safeParse(await req.json());
    if (!parsed.success) return json(400, { error: 'invalid input', issues: parsed.error.issues });
    const { requestId, amountCents, depositCents, note } = parsed.data;
    if (depositCents > amountCents) return json(400, { error: 'Deposit cannot exceed the total.' });

    // The caller must own a kitchen that this request was routed to.
    const { data: target } = await db.from('service_request_targets')
      .select('kitchen_id, kitchens!inner(owner_id)')
      .eq('request_id', requestId).eq('kitchens.owner_id', uid).limit(1).maybeSingle();
    if (!target) return json(403, { error: 'This request was not sent to your kitchen.' });
    const kitchenId = (target as any).kitchen_id;

    const { data: reqRow } = await db.from('service_requests').select('id, customer_id, status').eq('id', requestId).maybeSingle();
    if (!reqRow) return json(404, { error: 'Request not found.' });
    if (!['open', 'quoted'].includes((reqRow as any).status)) return json(409, { error: 'This request is no longer taking quotes.' });

    const { data: q, error: qErr } = await db.from('quotes').upsert({
      request_id: requestId, kitchen_id: kitchenId, amount_cents: amountCents, deposit_cents: depositCents,
      note: note ?? null, status: 'pending',
    }, { onConflict: 'request_id,kitchen_id' }).select('id').single();
    if (qErr) throw qErr;

    await db.from('service_requests').update({ status: 'quoted' }).eq('id', requestId).eq('status', 'open');
    try { await db.rpc('notify', { p_user: (reqRow as any).customer_id, p_kind: 'quote', p_title: 'New quote on your request', p_body: 'A prepper sent you a quote. Review and book.' }); } catch (_e) { /* best-effort */ }

    return json(200, { quoteId: q.id });
  } catch (_e) {
    return json(500, { error: 'Could not submit your quote. Please try again.' });
  }
});
