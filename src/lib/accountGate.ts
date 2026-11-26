/**
 * Pure decisions for the client-side route guards and the Stripe Connect return handler.
 *
 * `ready` means local storage has hydrated. `accountReady` means the first server account
 * reconcile has finished (signed-out result included). prepperStatus and isAdmin start as
 * 'none' and false and are only trustworthy once `accountReady` is true, so a guard that
 * decided on `ready` alone bounced an approved cook to Home on a hard load (web launch 2.1).
 *
 * Cosmetic gating only: every hub and admin read or write is enforced server-side.
 */

export type GuardDecision = 'wait' | 'allow' | 'redirect';

export interface AccountGateState {
  ready: boolean;
  accountReady: boolean;
}

/** Guard for prepper-only routes (`/hub/*`). */
export function prepperRouteDecision(s: AccountGateState & { prepperStatus: string }): GuardDecision {
  if (!s.ready || !s.accountReady) return 'wait';
  return s.prepperStatus === 'approved' ? 'allow' : 'redirect';
}

/** Guard for the admin area (`/admin/*`), web only. */
export function adminRouteDecision(s: AccountGateState & { isAdmin: boolean; isWeb: boolean }): GuardDecision {
  if (!s.ready || !s.accountReady) return 'wait';
  return s.isWeb && s.isAdmin ? 'allow' : 'redirect';
}

export interface MyHubState extends AccountGateState {
  signedIn: boolean;
  prepperStatus: string;
  /** The `connect` query param Stripe Connect onboarding returns with (`return` or `refresh`). */
  connect?: string;
}

/**
 * Guard for My Hub. Same as the prepper guard, except a signed-out visitor landing back
 * from Stripe Connect stays on the page ('signInToFinish'), so `connect` survives in the
 * URL and can be handled once they sign in.
 */
export function myHubDecision(s: MyHubState): GuardDecision | 'signInToFinish' {
  if (!s.ready || !s.accountReady) return 'wait';
  if (!s.signedIn && s.connect) return 'signInToFinish';
  return prepperRouteDecision(s);
}

/**
 * What My Hub does with the Connect return param:
 * - 'none': no param.
 * - 'wait': account state not known yet; do nothing and keep the param.
 * - 'needSignIn': signed out; keep the param and ask the user to sign in.
 * - 'handle': signed-in approved cook; consume the param, then handle it.
 * - 'ignore': signed in but not an approved cook; the guard redirects away.
 */
export type ConnectReturnAction = 'none' | 'wait' | 'needSignIn' | 'handle' | 'ignore';

export function connectReturnAction(s: MyHubState): ConnectReturnAction {
  if (!s.connect) return 'none';
  if (!s.ready || !s.accountReady) return 'wait';
  if (!s.signedIn) return 'needSignIn';
  return s.prepperStatus === 'approved' ? 'handle' : 'ignore';
}
