// Web sign-in settings and helpers (docs/web-launch/SIGNIN-DESIGN.md, Loop 2 task 2.1, part B).
//
// Pure: no React, no React Native. The web sheet passes these to the shared Auth and Code forms;
// native onboarding keeps the forms' own defaults.

import { AUTH_COPY, mapAuthErrorMessage } from './authRequest';

/** Web client password minimum (Decision 4). The server and native stay at 8 for now. */
export const WEB_PASSWORD_MIN = 10;

/** Client resend cooldown, matching the server's 60 second cooldown. */
export const WEB_RESEND_COOLDOWN_SEC = 60;

/** Consent UI (Decision 2): the checkbox only when the flag is on, the notice sentence otherwise. */
export function consentModeFromFlag(flag: string | undefined): 'checkbox' | 'notice' {
  return flag === '1' || flag === 'true' ? 'checkbox' : 'notice';
}

export const WEB_AUTH_COPY = {
  wrongCredentials: 'Wrong email or password',
  maybeExisting: 'If this email is new, we have sent next steps.',
  codeMismatch: "That code didn't match or has expired. Request a new one.",
  timeout: 'That took too long. Check your connection and try again.',
} as const;

function ownText(obj: unknown, key: string): string | null {
  if (obj === null || (typeof obj !== 'object' && typeof obj !== 'function')) return null;
  try {
    if (!Object.prototype.hasOwnProperty.call(obj, key)) return null;
    const v = (obj as Record<string, unknown>)[key];
    if (typeof v === 'string') return v;
    if (typeof v === 'number' && Number.isFinite(v)) return String(v);
    return null;
  } catch {
    return null;
  }
}

const WRONG_CREDENTIALS = /invalid[ _]login[ _]credentials|invalid[ _]credentials|wrong email or password|invalid email or password/i;
// "User already registered" also says whether an account exists, so it gets the same reply as a new email.
const ALREADY_REGISTERED = /already[ _]registered|already has an account|user[ _]already[ _]exists|email[ _]exists/i;
// In the code step an expired code and a wrong one look the same to Supabase.
const CODE_REJECTED = /otp_expired|token has expired or is invalid/i;
// The client timeout (AUTH_TIMEOUT_MESSAGE in src/lib/supabase.ts), matched by its stable prefix.
const CLIENT_TIMEOUT = /^Couldn.t reach sign-in/;

function errorParts(err: unknown): string[] {
  const fields = typeof err === 'string' ? [err] : [ownText(err, 'code'), ownText(err, 'status'), ownText(err, 'message')];
  return fields.filter((v): v is string => v !== null);
}

/**
 * Copy for an auth error on the web sheet. Reads only the error's own code, status and message, and
 * never echoes the raw message: anything not recognised becomes the generic copy. ctx 'code' is the
 * 6-digit code step, where an expired or invalid token means the code did not match.
 */
export function webAuthError(err: unknown, ctx: 'auth' | 'code' = 'auth'): string {
  const parts = errorParts(err);
  if (parts.some((p) => CLIENT_TIMEOUT.test(p))) return WEB_AUTH_COPY.timeout;
  if (ctx === 'code' && parts.some((p) => CODE_REJECTED.test(p))) return WEB_AUTH_COPY.codeMismatch;
  for (const p of parts) {
    const mapped = mapAuthErrorMessage(p);
    if (mapped !== AUTH_COPY.generic) return mapped;
  }
  if (parts.some((p) => WRONG_CREDENTIALS.test(p))) return WEB_AUTH_COPY.wrongCredentials;
  if (parts.some((p) => ALREADY_REGISTERED.test(p))) return WEB_AUTH_COPY.maybeExisting;
  return AUTH_COPY.generic;
}

/**
 * Neutral notice for the web sheet (Auth's mapNotice): an existing account gets the reply a new
 * email gets, shown as information rather than an error. Null for anything else.
 */
export function webAuthNotice(err: unknown): string | null {
  return errorParts(err).some((p) => ALREADY_REGISTERED.test(p)) ? WEB_AUTH_COPY.maybeExisting : null;
}

/**
 * Account key that binds a stored intent to the signing-in account without storing the email:
 * SHA-256 of the NFKC-normalised, trimmed, lowercased email, hex, first 32 characters. Throws on a
 * non-string or blank email and when Web Crypto is unavailable, so a caller cannot bind an intent
 * to an empty key.
 */
export async function accountKeyForEmail(email: string): Promise<string> {
  if (typeof email !== 'string') throw new TypeError('accountKeyForEmail needs an email string');
  const normalised = email.normalize('NFKC').trim().toLowerCase();
  if (normalised === '') throw new Error('accountKeyForEmail needs a non-empty email');
  const subtle = (globalThis as { crypto?: { subtle?: SubtleCryptoLike } }).crypto?.subtle;
  if (!subtle || typeof subtle.digest !== 'function') throw new Error('Web Crypto is unavailable');
  const bytes = new TextEncoder().encode(normalised);
  const digest = new Uint8Array(await subtle.digest('SHA-256', bytes));
  let hex = '';
  for (const b of digest) hex += b.toString(16).padStart(2, '0');
  return hex.slice(0, 32);
}

interface SubtleCryptoLike {
  digest(algorithm: string, data: Uint8Array): Promise<ArrayBuffer>;
}
