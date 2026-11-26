// Local mocks for every Supabase endpoint the web app calls. Nothing here talks to a real backend:
// the app is built against a fake origin (127.0.0.1:54321) that nothing listens on, and every
// request to any host other than the static server and that origin is aborted and recorded.
import type { Page, Route } from '@playwright/test';

export const SUPABASE_ORIGIN = 'http://127.0.0.1:54321';
export const KITCHEN_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
export const TEST_EMAIL = 'test-user@example.com';
export const TEST_PASSWORD = 'not-a-real-password-1';
export const GOOD_CODE = '123456';
const USER_ID = '00000000-0000-4000-8000-000000000001';

function b64url(obj: object): string {
  return Buffer.from(JSON.stringify(obj)).toString('base64url');
}
const NOW = () => Math.floor(Date.now() / 1000);
export const ACCESS_TOKEN = `${b64url({ alg: 'HS256', typ: 'JWT' })}.${b64url({ sub: USER_ID, email: TEST_EMAIL, aud: 'authenticated', role: 'authenticated', exp: NOW() + 3600 * 24 })}.fake-signature`;

const user = { id: USER_ID, aud: 'authenticated', role: 'authenticated', email: TEST_EMAIL, email_confirmed_at: '2026-01-01T00:00:00Z', app_metadata: { provider: 'email', providers: ['email'] }, user_metadata: {}, identities: [], created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' };
const session = () => ({ access_token: ACCESS_TOKEN, token_type: 'bearer', expires_in: 3600, expires_at: NOW() + 3600, refresh_token: 'fake-refresh-token', user });

const kitchen = {
  id: KITCHEN_ID, name: 'Test Kitchen', slug: 'test-kitchen', cuisine: 'Nigerian', approx_area: 'Testville', approx_lat: null, approx_lng: null,
  avatar_url: null, cover_url: null, specialties: [], is_pro: false, supports_delivery: true, supports_pickup: true, bio: 'A fixture kitchen.',
  verification_status: 'verified', created_at: '2026-01-01T00:00:00Z',
};

export interface MockState {
  /** Count of calls per mocked endpoint key, e.g. 'fn:create-order', 'rpc:toggle_follow', 'auth:verify'. */
  calls: Record<string, number>;
  /** Requests that tried to leave the allow-list (G5). Must stay empty. */
  blocked: string[];
  following: boolean;
  signedIn: boolean;
  /** Which GoTrue refusal a recovery code request for an unknown email gets. */
  unknownOtpError: 'signupsNotAllowed' | 'notFound';
}

export interface MockOptions {
  /** Port of the local static server. */
  port: number;
}

function cors(req: { headers(): Record<string, string> }): Record<string, string> {
  const h = req.headers();
  return {
    'Access-Control-Allow-Origin': h['origin'] || '*',
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Allow-Methods': 'GET,POST,PATCH,PUT,DELETE,HEAD,OPTIONS',
    'Access-Control-Allow-Headers': h['access-control-request-headers'] || 'authorization, apikey, content-type, x-client-info, prefer, accept-profile, content-profile, x-supabase-api-version',
    'Access-Control-Expose-Headers': 'content-range, x-supabase-api-version',
  };
}

export async function installMocks(page: Page, opts: MockOptions): Promise<MockState> {
  const state: MockState = { calls: {}, blocked: [], following: false, signedIn: false, unknownOtpError: 'signupsNotAllowed' };
  const local = new Set([`http://127.0.0.1:${opts.port}`, `http://localhost:${opts.port}`]);
  const bump = (k: string) => { state.calls[k] = (state.calls[k] || 0) + 1; };

  await page.route('**/*', async (route: Route) => {
    const req = route.request();
    const url = new URL(req.url());
    if (local.has(url.origin)) return route.continue();
    if (url.origin !== SUPABASE_ORIGIN) {
      state.blocked.push(req.url());
      return route.abort('blockedbyclient');
    }
    const headers = cors(req);
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
    const json = (status: number, body: unknown, extra: Record<string, string> = {}) =>
      route.fulfill({ status, headers: { ...headers, 'Content-Type': 'application/json', ...extra }, body: JSON.stringify(body) });
    const p = url.pathname;
    const body = (() => { try { return req.postDataJSON() ?? {}; } catch { return {}; } })();
    const bearer = (req.headers()['authorization'] || '').replace(/^Bearer\s+/i, '');
    const authed = bearer === ACCESS_TOKEN;

    // ---- Auth (GoTrue) ----
    if (p === '/auth/v1/token') {
      const grant = url.searchParams.get('grant_type');
      bump(`auth:token:${grant}`);
      if (grant === 'password') {
        if (body.password === TEST_PASSWORD) { state.signedIn = true; return json(200, session()); }
        return json(400, { code: 'invalid_credentials', error_code: 'invalid_credentials', msg: 'Invalid login credentials' });
      }
      if (grant === 'refresh_token') return json(200, session());
      return json(400, { msg: 'unsupported grant' });
    }
    if (p === '/auth/v1/otp') {
      bump('auth:otp');
      // Password recovery sends create_user:false; for an address with no account GoTrue refuses
      // with one of these two shapes (the app must answer both exactly as it answers a real one).
      if (body.create_user === false && body.email !== TEST_EMAIL) {
        if (state.unknownOtpError === 'notFound') return json(400, { code: 'user_not_found', error_code: 'user_not_found', msg: 'User not found' });
        return json(422, { code: 'otp_disabled', error_code: 'otp_disabled', msg: 'Signups not allowed for otp' });
      }
      return json(200, {});
    }
    if (p === '/auth/v1/verify') {
      bump('auth:verify');
      if (body.token === GOOD_CODE) { state.signedIn = true; return json(200, session()); }
      return json(403, { code: 'otp_expired', error_code: 'otp_expired', msg: 'Token has expired or is invalid' });
    }
    if (p === '/auth/v1/user') { bump('auth:user'); return authed ? json(200, user) : json(401, { code: 'no_authorization', msg: 'no user' }); }
    if (p === '/auth/v1/signup') {
      bump('auth:signup');
      return json(422, { code: 'user_already_exists', error_code: 'user_already_exists', msg: 'User already registered' });
    }
    if (p === '/auth/v1/logout') { bump('auth:logout'); state.signedIn = false; return route.fulfill({ status: 204, headers }); }

    // ---- Edge Functions ----
    if (p.startsWith('/functions/v1/')) {
      const name = p.slice('/functions/v1/'.length);
      bump(`fn:${name}`);
      if (!authed) return json(401, { error: 'Not signed in', code: 'AUTH_REQUIRED' });
      // alreadyPaid: the app goes straight to tracking and never loads Stripe.js (an outside host).
      if (name === 'create-order') return json(200, { orderId: 'order-fixture', clientSecret: null, taxCents: 0, alreadyPaid: true });
      if (name === 'book-experience') return json(200, { bookingId: 'booking-fixture', clientSecret: 'pi_fixture_secret_fixture', amountCents: 5000 });
      return json(200, {});
    }

    // ---- PostgREST ----
    if (p.startsWith('/rest/v1/rpc/')) {
      const fn = p.slice('/rest/v1/rpc/'.length);
      bump(`rpc:${fn}`);
      if (fn === 'toggle_follow') {
        if (!authed) return json(401, { code: 'PGRST301', message: 'JWT required' });
        state.following = !state.following;
        return json(200, state.following);
      }
      return json(200, null);
    }
    if (p.startsWith('/rest/v1/')) {
      const table = p.slice('/rest/v1/'.length);
      bump(`rest:${table}`);
      let rows: unknown[] = [];
      if (table === 'kitchen_public') {
        const id = url.searchParams.get('id');
        const slug = url.searchParams.get('slug');
        if ((!id || id === `eq.${KITCHEN_ID}`) && (!slug || slug === `eq.${kitchen.slug}`)) rows = [kitchen];
      } else if (table === 'follows') {
        rows = authed && state.following ? [{ kitchen_id: KITCHEN_ID }] : [];
      }
      const accept = req.headers()['accept'] || '';
      const range = { 'Content-Range': rows.length ? `0-${rows.length - 1}/${rows.length}` : '*/0' };
      if (accept.includes('vnd.pgrst.object')) {
        return rows.length === 1 ? json(200, rows[0], range) : json(406, { code: 'PGRST116', message: 'JSON object requested, multiple (or no) rows returned' });
      }
      if (req.method() === 'HEAD') return route.fulfill({ status: 200, headers: { ...headers, ...range } });
      return json(200, rows, range);
    }
    bump(`other:${p}`);
    return json(404, { message: 'not mocked' });
  });
  return state;
}
