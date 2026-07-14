// deno-lint-ignore-file no-explicit-any
// DEPRECATED (audit High finding): this was a legacy, unused, parallel Stripe-native
// recurring-subscription path that remained fully deployed and reachable by any
// authenticated user while the real app-controlled per-cycle billing engine
// (subscribe-plan/subscribe-box + advance_cycles/charge-due-cycles) shipped and became
// the only client-called path. It's inert now rather than removed outright, since Supabase
// Edge Functions have no "delete" step available in this environment -- this stub keeps the
// route reachable but harmless.
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  return new Response(
    JSON.stringify({ error: 'This endpoint has been retired. Use subscribe-plan instead.' }),
    { status: 410, headers: { ...corsHeaders, 'content-type': 'application/json' } },
  );
});
