// Retired one-off utility. Kept as a disabled stub (verify_jwt=true, no Stripe access).
Deno.serve(() => new Response(JSON.stringify({ error: 'gone' }), { status: 410, headers: { 'content-type': 'application/json' } }));
