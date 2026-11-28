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
 * Matches the whole raw string, so surrounding whitespace, control characters, backslashes, percent
 * signs, `@` and any other character outside the host and port alphabet fail the match. URL is not
 * used: React Native replaces the global URL with a regex class whose getters disagree with the
 * WHATWG parser (it leaves `https://:@staging.preppa.live` unchanged, for one), so the result must
 * not depend on which URL the runtime has. One optional trailing slash is allowed.
 * scripts/check-vercel-env.mjs holds a copy of this pattern and of the function below.
 */
const SITE_PATTERN = /^(https?):\/\/([A-Za-z0-9.-]+)(?::([0-9]{1,5}))?\/?$/i;

/**
 * Returns the normalised lowercase `scheme://host[:port]` of `raw` when it is a bare origin on an
 * allowlisted host, otherwise null. Rules: `https` (or `http` for localhost and 127.0.0.1 only); no
 * userinfo, path, query or hash; the port is 1 to 65535, the scheme's default port is dropped, and
 * any other port is allowed on localhost and 127.0.0.1 only.
 */
export function parseSiteOrigin(raw: string | undefined): string | null {
  if (typeof raw !== 'string') return null;
  const match = SITE_PATTERN.exec(raw);
  if (!match) return null;
  const scheme = match[1].toLowerCase();
  const host = match[2].toLowerCase();
  if (!(SITE_HOSTS as readonly string[]).includes(host)) return null;
  const local = LOCAL_HOSTS.includes(host);
  if (scheme !== 'https' && !(scheme === 'http' && local)) return null;
  let port = '';
  if (match[3] !== undefined) {
    const n = Number(match[3]);
    if (n < 1 || n > 65535) return null;
    if (n !== (scheme === 'https' ? 443 : 80)) port = `:${n}`;
  }
  if (port !== '' && !local) return null;
  return `${scheme}://${host}${port}`;
}

/** The configured origin when it passes parseSiteOrigin, otherwise the production origin. */
export function resolveSite(raw: string | undefined): string {
  return parseSiteOrigin(raw) ?? FALLBACK_SITE;
}
