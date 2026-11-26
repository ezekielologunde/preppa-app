// Wiring for part C1a (SIGNIN-DESIGN.md): the first gated call sites use requireAuth (or, for the
// Connect return, requestSignIn) on web and leave native as it was. Text based, whitespace tolerant.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const ROOT = join(__dirname, '..');
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8').replace(/\r\n/g, '\n');

const HOOK_IMPORT = /import\s*\{\s*useRequireAuth\s*\}\s*from\s*'(\.\.\/)+src\/lib\/useRequireAuth'\s*;/;
const SITES: Array<{ file: string; reasons: string[] }> = [
  { file: 'app/checkout.tsx', reasons: ['checkout'] },
  { file: 'app/experience/[id].tsx', reasons: ['book', 'openThread'] },
  { file: 'app/store/[cook].tsx', reasons: ['follow', 'openThread'] },
];

const callAt = (src: string, reason: string) => src.search(new RegExp(`requireAuth\\(\\s*'${reason}'\\s*,`));

for (const { file, reasons } of SITES) {
  test(`${file} imports useRequireAuth and calls requireAuth for ${reasons.join(', ')}`, () => {
    const src = read(file);
    assert.match(src, HOOK_IMPORT);
    assert.match(src, /const\s+requireAuth\s*=\s*useRequireAuth\(\s*\)\s*;/);
    for (const reason of reasons) assert.ok(callAt(src, reason) >= 0, `requireAuth('${reason}', ...) not found`);
  });
}

test('checkout gates Pay through requireAuth with a checkout intent, and Pay calls the gate', () => {
  const src = read('app/checkout.tsx');
  assert.match(src, /requireAuth\(\s*'checkout'\s*,\s*\{\s*kind:\s*'checkout'\s*,\s*ids:\s*\[\]\s*,\s*path:\s*'\/checkout'\s*,\s*t:\s*Date\.now\(\)\s*\}\s*,\s*place\s*\)/);
  assert.match(src, /onPress=\{\s*onPay\s*\}/);
  assert.doesNotMatch(src, /onPress=\{\s*place\s*\}/);
});

test('checkout: AUTH_REQUIRED opens the sheet on web; resetOnboarding stays on the native branch only', () => {
  const src = read('app/checkout.tsx');
  const at = src.indexOf("if (msg === 'AUTH_REQUIRED') {");
  assert.ok(at > 0, 'AUTH_REQUIRED branch not found');
  const branch = src.slice(at, src.indexOf('} else if (', at));
  const web = branch.indexOf("if (Platform.OS === 'web') {");
  const native = branch.indexOf('} else {', web);
  assert.ok(web > 0 && native > web, 'web and native branches not found');
  const webPart = branch.slice(web, native);
  const nativePart = branch.slice(native);
  assert.match(webPart, /requestSignIn\(\s*'checkout'/);
  assert.doesNotMatch(webPart, /resetOnboarding/);
  assert.match(nativePart, /toast\('Please sign in again to place your order\.', 'info'\);\s*resetOnboarding\(\);/);
  assert.equal(src.split('resetOnboarding()').length - 1, 1, 'resetOnboarding is called once, on native');
});

test('my-hub asks for a sign-in with reason connect on web and keeps the toast on native', () => {
  const src = read('app/(tabs)/my-hub.tsx');
  assert.match(src, /import\s*\{\s*requestSignIn\s*\}\s*from\s*'\.\.\/\.\.\/src\/lib\/authRequest'\s*;/);
  const at = src.indexOf("if (connectAction === 'needSignIn') {");
  const end = src.indexOf("if (connectAction !== 'handle') return;");
  assert.ok(at > 0 && end > at);
  const branch = src.slice(at, end);
  assert.match(branch, /if \(Platform\.OS === 'web'\)\s*void requestSignIn\(\s*'connect'\s*\);\s*else toast\('Sign in to finish setting up payouts\.', 'info'\);/);
  assert.doesNotMatch(branch, /setParams/);
});

test('store: requireAuth runs before the optimistic follow flip, and a resumed follow never unfollows', () => {
  const src = read('app/store/[cook].tsx');
  const gate = callAt(src, 'follow');
  const flip = src.indexOf('setFollowing(next); // optimistic');
  assert.ok(gate > 0 && flip > gate, 'requireAuth must come before the optimistic flip');
  const resumed = src.indexOf('if (resumed) {', gate);
  assert.ok(resumed > gate && resumed < flip, 'resumed check must come before the toggle');
  assert.match(src.slice(resumed, flip), /fetchIsFollowing\(profile\.id\)/);
  assert.ok(callAt(src, 'openThread') < src.indexOf("openThread(profile.id, 'store')"));
});

test('experience: requireAuth comes before the booking and the thread calls', () => {
  const src = read('app/experience/[id].tsx');
  assert.ok(callAt(src, 'book') >= 0);
  assert.match(src, /canBook \? onBook :/);
  assert.match(src, /onPress=\{\s*onMessageHost\s*\}/);
  assert.match(src, /requireAuth\(\s*'book'\s*,[^;]*,\s*book\s*\)/);
  assert.match(src, /requireAuth\(\s*'openThread'\s*,[^;]*,\s*messageHost\s*\)/);
});

test('the hook returns early with run() on native and has no console calls', () => {
  for (const file of ['src/lib/useRequireAuth.ts', 'src/lib/requireAuthLogic.ts']) {
    const src = read(file);
    assert.ok(!src.includes('console.'), `${file}: console. found`);
    assert.ok(!src.includes('\u2014'), `${file}: literal em dash found`);
  }
  const hook = read('src/lib/useRequireAuth.ts');
  const early = hook.search(/if \(Platform\.OS !== 'web'\) \{\s*await run\(\{ resumed: false \}\);\s*return true;\s*\}/);
  assert.ok(early > 0, 'native early return not found');
  assert.ok(early < hook.indexOf('preflightDecision('), 'native returns before any web decision');
  assert.ok(early < hook.indexOf('requestSignIn('), 'native never asks for a sign-in');
  assert.match(hook, /decideAfterSignIn\(effectiveKind\(reason, intent\), ok\)/);
  assert.match(hook, /if \(after === 'run'\) await run\(\{ resumed: true \}\);/);
});

test('the pure helper has no React or React Native imports', () => {
  const src = read('src/lib/requireAuthLogic.ts');
  assert.doesNotMatch(src, /from 'react(-native)?'/);
});
