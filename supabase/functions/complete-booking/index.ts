// deno-lint-ignore-file no-explicit-any
// complete-booking: mark a confirmed booking as completed. Either party may call it. The balance
// is settled offline (cash), so there's no additional charge in v1. JWT-scoped.
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

const input = z.object({ bookingId: z.string().uuid() });

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
    const { bookingId } = parsed.data;

    const { data: bk } = await db.from('bookings').select('id, customer_id, kitchen_id, status, kitchens!inner(owner_id)').eq('id', bookingId).maybeSingle();
    if (!bk) return json(404, { error: 'Booking not found.' });
    const ownerId = (bk as any).kitchens.owner_id;
    if ((bk as any).customer_id !== uid && ownerId !== uid) return json(403, { error: 'Not your booking.' });
    if (!['confirmed', 'in_progress'].includes((bk as any).status)) return json(409, { error: 'This booking cannot be completed.' });

    await db.from('bookings').update({ status: 'completed', completed_at: new Date().toISOString() }).eq('id', bookingId);
    const other = uid === ownerId ? (bk as any).customer_id : ownerId;
    try { await db.rpc('notify', { p_user: other, p_kind: 'booking', p_title: 'Booking completed', p_body: 'Your service booking was marked complete. Enjoy!' }); } catch (_e) { /* best-effort */ }

    return json(200, { status: 'completed' });
  } catch (_e) {
    return json(500, { error: 'Could not update the booking.' });
  }
});
