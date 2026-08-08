// deno-lint-ignore-file no-explicit-any
// send-push: internal worker fired by notify() (via net.http_post) whenever a user with a
// registered device gets an in-app notification. Looks up their Expo push token(s) and
// forwards to Expo's push API. Auth mirrors charge-due-cycles / stripe-worker: a shared
// worker secret, not a user JWT -- this is a server-to-server call from inside a Postgres
// trigger, never from a client. verify_jwt is OFF for the same reason those two are off:
// this function does its own auth via verify_worker_secret, and the gateway's JWT check
// would reject the worker secret before the function body ever ran.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

function admin() {
  return createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    { auth: { persistSession: false } },
  );
}
function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json(405, { error: 'method not allowed' });

  const authHeader = req.headers.get('Authorization') ?? '';
  if (!authHeader.startsWith('Bearer ')) return json(401, { error: 'unauthorized' });
  const token = authHeader.substring(7);

  const db = admin();
  const { data: ok } = await db.rpc('verify_worker_secret', { p_token: token });
  if (ok !== true) return json(401, { error: 'unauthorized' });

  const body = await req.json().catch(() => ({}));
  const userId = body?.userId as string | undefined;
  const title = body?.title as string | undefined;
  const msgBody = body?.body as string | undefined;
  const kind = body?.kind as string | undefined;
  if (!userId || !title) return json(400, { error: 'userId and title required' });

  const { data: tokens, error: tErr } = await db
    .from('push_tokens')
    .select('id, token')
    .eq('user_id', userId);
  if (tErr) return json(500, { error: tErr.message });
  if (!tokens || tokens.length === 0) return json(200, { sent: 0 });

  const messages = tokens.map((t: any) => ({
    to: t.token,
    title,
    body: msgBody ?? undefined,
    sound: 'default',
    priority: 'high',
    data: { kind: kind ?? null },
  }));

  const resp = await fetch(EXPO_PUSH_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify(messages),
  });
  const result = await resp.json().catch(() => null);

  // Expo's response is a parallel array of per-message receipts. A DeviceNotRegistered error
  // means the token is permanently dead (app uninstalled, etc.) -- prune it so this table
  // doesn't accumulate garbage and so we stop paying the (tiny) cost of pushing into the void.
  const staleIds: number[] = [];
  if (Array.isArray(result?.data)) {
    result.data.forEach((r: any, i: number) => {
      if (r?.status === 'error' && r?.details?.error === 'DeviceNotRegistered') {
        staleIds.push(tokens[i].id);
      }
    });
  }
  if (staleIds.length > 0) {
    await db.from('push_tokens').delete().in('id', staleIds);
  }

  return json(200, { sent: messages.length, pruned: staleIds.length });
});
