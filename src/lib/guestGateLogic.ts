// Guest empty states (docs/web-launch/SIGNIN-DESIGN.md, Loop 2 task 2.1, part C2).
//
// Pure: no React, no React Native. GuestGate reads this; tests/guestGate.test.ts pins it.

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
