// deno-lint-ignore-file no-explicit-any
// fulfill-plan-request: a cook answers a customer's meal_plan brief by linking a plan they
// published. Marks the request fulfilled + notifies the customer to subscribe. JWT-scoped.
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
const input = z.object({ requestId: z.string().uuid(), planId: z.string().uuid() });

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
    if (!parsed.success) return json(400, { error: 'invalid input' });
    const { requestId, planId } = parsed.data;

    // caller must own the plan's kitchen, and the plan must be live
    const { data: plan } = await db.from('plans').select('id, name, status, kitchen_id, kitchens!inner(owner_id)').eq('id', planId).maybeSingle();
    if (!plan || plan.status !== 'active') return json(404, { error: 'Plan not found or not published.' });
    if ((plan as any).kitchens?.owner_id !== uid) return json(403, { error: 'Not your plan.' });

    const { data: reqRow } = await db.from('service_requests').select('id, customer_id, category, status').eq('id', requestId).maybeSingle();
    if (!reqRow) return json(404, { error: 'Request not found.' });
    if (reqRow.category !== 'meal_plan') return json(400, { error: 'Not a meal-plan request.' });
    if (['cancelled', 'expired'].includes(reqRow.status)) return json(409, { error: 'This request is closed.' });

    await db.from('service_requests').update({ fulfilled_plan_id: planId, status: 'accepted' }).eq('id', requestId);
    try {
      await db.rpc('notify', {
        p_user: reqRow.customer_id, p_kind: 'plan_ready', p_title: 'Your meal plan is ready',
        p_body: `A cook created “${plan.name}” for you — open your request to review and subscribe.`,
      });
    } catch (_e) { /* best-effort */ }

    return json(200, { ok: true });
  } catch (_e) {
    return json(500, { error: 'Could not link the plan. Please try again.' });
  }
});
