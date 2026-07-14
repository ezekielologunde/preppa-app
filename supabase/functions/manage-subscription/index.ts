// deno-lint-ignore-file no-explicit-any
// DEPRECATED (audit High finding): paired with create-subscription -- see that file's
// header comment. This was the legacy Stripe-native pause/resume/cancel path, unused by
// the client (which calls pause_subscription/resume_subscription/cancel_subscription
// instead). Stubbed inert rather than removed (no delete-function step available here).
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  return new Response(
    JSON.stringify({ error: 'This endpoint has been retired. Use pause_subscription/resume_subscription/cancel_subscription instead.' }),
    { status: 410, headers: { ...corsHeaders, 'content-type': 'application/json' } },
  );
});
