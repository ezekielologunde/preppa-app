// requireAuth: run an action now, or after a sign-in on web (docs/web-launch/SIGNIN-DESIGN.md, part C).
//
// A thin wrapper: the decisions and the wait/sign-in/run loop are runRequireAuth in
// requireAuthLogic.ts (tests/requireAuthRun.test.ts). Native runs the action at once and keeps its
// own AUTH_REQUIRED handling.
import { useCallback, useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import { useStore } from '../store/store';
import { requestSignIn, type AuthReason, type Intent } from './authRequest';
import { liveSessionCheck, runRequireAuth, type RequireAuthDeps, type RequireAuthRun } from './requireAuthLogic';
import { supabase } from './supabase';

export type { RequireAuthRun };
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

  return useCallback<RequireAuth>((reason, intent, run) => {
    const deps: RequireAuthDeps = {
      isWeb: Platform.OS === 'web',
      getState: () => gate.current,
      waitForReady: () => new Promise<void>((resolve) => {
        waiters.current.push(resolve);
      }),
      hasSession: () => liveSessionCheck(() => supabase.auth.getSession().then(({ data }) => !!data.session)),
      requestSignIn,
      alive: () => alive.current,
      pending,
    };
    return runRequireAuth(deps, reason, intent, run);
  }, []);
}
