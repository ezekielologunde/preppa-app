// Guest empty states (docs/web-launch/SIGNIN-DESIGN.md, Loop 2 task 2.1, part C2).
//
// Pure: no React, no React Native. GuestGate reads this; tests/guestGate.test.ts pins it.

import { liveSessionCheck, SESSION_CHECK_MS } from './requireAuthLogic';

export type GuestGateMode = 'children' | 'guest';

export interface GuestGateState {
  isWeb: boolean;
  /** The first server account reconcile has finished (signed-out result included). */
  accountReady: boolean;
  signedIn: boolean;
}

/**
 * 'guest' only on web, once the account state is known and nobody is signed in. Native always
 * renders the screen as before (the onboarding gate keeps guests out there), and so does web while
 * the account state is still loading, so a signed-in user never sees the guest state flash.
 */
export function guestGateMode(s: GuestGateState): GuestGateMode {
  if (s.isWeb !== true) return 'children';
  if (s.accountReady !== true) return 'children';
  return s.signedIn === true ? 'children' : 'guest';
}

/** The one live session check GuestGate runs once the store says signed out. */
export type GuestSessionCheck = 'pending' | 'session' | 'none' | 'failed';

/**
 * One session lookup through liveSessionCheck (SESSION_CHECK_MS by default): 'session' when it
 * resolves true in time, 'none' when it resolves false in time, 'failed' when it throws, rejects
 * or times out. Never rejects.
 */
export async function guestSessionCheck(
  lookup: () => Promise<boolean>,
  ms: number = SESSION_CHECK_MS,
): Promise<Exclude<GuestSessionCheck, 'pending'>> {
  let answer: boolean | undefined;
  const live = await liveSessionCheck(() => lookup().then((v) => { answer = v === true; return v; }), ms);
  if (live) return 'session';
  return answer === false ? 'none' : 'failed';
}

/**
 * The store's mode after the live session check. The first account reconcile can give up after a
 * timeout while a session exists, so the guest state needs the check to find no session. While
 * the check runs, when it finds a session and when it fails (throws or times out), the screen
 * renders as before: a failed check fails to the children, the safe default for a signed-in user
 * (a real guest then sees the screen's own signed-out loads, as on native).
 */
export function guestGateAfterCheck(mode: GuestGateMode, check: GuestSessionCheck): GuestGateMode {
  if (mode !== 'guest') return 'children';
  return check === 'none' ? 'guest' : 'children';
}
