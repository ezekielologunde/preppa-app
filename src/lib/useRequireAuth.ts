// requireAuth: run an action now, or after a sign-in on web (docs/web-launch/SIGNIN-DESIGN.md, part C).
//
// Native: runs the action and returns true. Native flows keep their own AUTH_REQUIRED handling.
// Web: waits until the account state is known (never opens the sheet before that), runs the action
// when signed in, otherwise opens the sheet. After a sign-in only idempotent kinds run by themselves;
// money kinds return true without running so the screen's button is simply tapped again.
import { useCallback, useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import { useStore } from '../store/store';
import { requestSignIn, type AuthReason, type Intent } from './authRequest';
import { decideAfterSignIn, effectiveKind, preflightDecision } from './requireAuthLogic';

/** `resumed` is true when the action runs after a sign-in from the sheet (state read signed out may be stale). */
export type RequireAuthRun = (ctx: { resumed: boolean }) => void | Promise<void>;
export type RequireAuth = (reason: AuthReason, intent: Intent | undefined, run: RequireAuthRun) => Promise<boolean>;

export function useRequireAuth(): RequireAuth {
  const { ready, accountReady, signedIn } = useStore();
  const gate = useRef({ ready, accountReady, signedIn });
  gate.current = { ready, accountReady, signedIn };
  const waiters = useRef<Array<() => void>>([]);
  const alive = useRef(true);
  // One wait or sheet per screen at a time: a second tap meanwhile runs nothing.
  const pending = useRef(false);

  const flush = useCallback(() => {
    const list = waiters.current;
    waiters.current = [];
    for (const resolve of list) resolve();
  }, []);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      flush();
    };
  }, [flush]);

  useEffect(() => {
    if (ready && accountReady) flush();
  }, [ready, accountReady, flush]);

  return useCallback<RequireAuth>(async (reason, intent, run) => {
    if (Platform.OS !== 'web') {
      await run({ resumed: false });
      return true;
    }
    let step = preflightDecision(gate.current);
    if (step === 'run') {
      await run({ resumed: false });
      return true;
    }
    if (pending.current) return false;
    pending.current = true;
    try {
      while (step === 'wait') {
        await new Promise<void>((resolve) => {
          waiters.current.push(resolve);
        });
        if (!alive.current) return false;
        step = preflightDecision(gate.current);
      }
      if (step === 'run') {
        await run({ resumed: false });
        return true;
      }
      const ok = await requestSignIn(reason, intent);
      const after = decideAfterSignIn(effectiveKind(reason, intent), ok);
      if (after === 'cancel' || !alive.current) return false;
      if (after === 'run') await run({ resumed: true });
      return true;
    } finally {
      pending.current = false;
    }
  }, []);
}
