/** Compare origins, not spelling: trailing slashes and hostname case do not
 * turn the production backend into an isolated test service. */
export function validateServiceEnvironment(input: {
  production: boolean; url: string; anonKey: string; stripeKey: string;
  liveUrl: string; liveAnonKey: string;
}): void {
  if (!input.url || !input.anonKey || !input.stripeKey) throw new Error('Preppa environment is not configured. Set isolated EXPO_PUBLIC_SUPABASE_URL, EXPO_PUBLIC_SUPABASE_ANON_KEY, and EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY values.');
  let url: URL;
  try { url = new URL(input.url); } catch { throw new Error('Invalid Supabase URL.'); }
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || url.search || url.hash || (url.pathname !== '/' && url.pathname !== '')) {
    throw new Error('Invalid Supabase URL.');
  }
  if (url.protocol === 'http:' && (input.production || !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))) {
    throw new Error('Invalid Supabase URL. Use HTTPS outside local development.');
  }
  if (!input.production && (url.origin === new URL(input.liveUrl).origin || input.anonKey === input.liveAnonKey || input.stripeKey.startsWith('pk_live_'))) {
    throw new Error('Development and preview builds cannot use Preppa production services. Configure the isolated test environment.');
  }
}
