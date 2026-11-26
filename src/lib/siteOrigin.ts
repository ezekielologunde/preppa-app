/**
 * The web origin shared links point at (DESIGN 2.12). Kept free of React Native imports so the
 * rules can be tested under Node. `scripts/check-vercel-env.mjs` holds a copy of SITE_HOSTS and of
 * these rules, and `tests/shareSite.test.ts` fails if the two drift apart.
 */

/** Production origin, used when the configured value is unset or rejected. */
export const FALLBACK_SITE = 'https://app.preppa.live';

/** Hosts a share link may point at. */
export const SITE_HOSTS = ['app.preppa.live', 'staging.preppa.live', 'localhost', '127.0.0.1'] as const;

const LOCAL_HOSTS: readonly string[] = ['localhost', '127.0.0.1'];

/**
 * Returns the origin of `raw` when it is a bare origin on an allowlisted host, otherwise null.
 * Rules: no leading or trailing whitespace; `https:` (or `http:` for localhost and 127.0.0.1 only);
 * no username or password; no path, query or hash; no port except on localhost and 127.0.0.1.
 */
export function parseSiteOrigin(raw: string | undefined): string | null {
  if (typeof raw !== 'string' || raw === '' || raw !== raw.trim()) return null;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  const local = LOCAL_HOSTS.includes(url.hostname);
  if (!(SITE_HOSTS as readonly string[]).includes(url.hostname)) return null;
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && local)) return null;
  if (url.username !== '' || url.password !== '') return null;
  if (url.pathname !== '/' || url.search !== '' || url.hash !== '') return null;
  if (url.port !== '' && !local) return null;
  return url.origin;
}

/** The configured origin when it passes parseSiteOrigin, otherwise the production origin. */
export function resolveSite(raw: string | undefined): string {
  return parseSiteOrigin(raw) ?? FALLBACK_SITE;
}
