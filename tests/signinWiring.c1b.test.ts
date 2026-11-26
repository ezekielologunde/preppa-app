// Wiring for part C1b (SIGNIN-DESIGN.md): the remaining signed-in-only actions go through
// requireAuth (or, for the address save, requestSignIn) on web; native runs them at once as before.
// Text based, whitespace tolerant.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const ROOT = join(__dirname, '..');
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8').replace(/\r\n/g, '\n');

const HOOK_IMPORT = /import\s*\{\s*useRequireAuth\s*\}\s*from\s*'(\.\.\/)+(src\/)?lib\/useRequireAuth'\s*;/;
const HOOK_CALL = /const\s+requireAuth\s*=\s*useRequireAuth\(\s*\)\s*;/g;
const callAt = (src: string, reason: string, from = 0) => {
  const at = src.slice(from).search(new RegExp(`requireAuth\\(\\s*'${reason}'\\s*,`));
  return at < 0 ? -1 : at + from;
};

const SITES: Array<{ file: string; reasons: string[]; hooks: number }> = [
  { file: 'src/components/FeedReel.tsx', reasons: ['like', 'save', 'follow'], hooks: 1 },
  { file: 'src/components/plans/index.tsx', reasons: ['openThread'], hooks: 2 },
  { file: 'app/order/[id].tsx', reasons: ['openThread'], hooks: 1 },
  { file: 'app/chat/[cook].tsx', reasons: ['openThread'], hooks: 1 },
];

for (const { file, reasons, hooks } of SITES) {
  test(`${file} imports useRequireAuth and calls requireAuth for ${reasons.join(', ')}`, () => {
    const src = read(file);
    assert.match(src, HOOK_IMPORT);
    assert.equal((src.match(HOOK_CALL) ?? []).length, hooks, 'useRequireAuth() calls');
    for (const reason of reasons) assert.ok(callAt(src, reason) >= 0, `requireAuth('${reason}', ...) not found`);
  });
}

test('FeedReel: in-flight guards come before the sheet and again inside the action', () => {
  const src = read('src/components/FeedReel.tsx');
  for (const [fn, ref, reason] of [['onLike', 'likeInFlight', 'like'], ['onSave', 'saveInFlight', 'save'], ['onFollow', 'followInFlight', 'follow']]) {
    assert.match(src, new RegExp(`const ${fn} = \\(\\) => \\{\\s*if \\(\\s*${ref}\\.current\\s*\\)\\s*return;\\s*void requireAuth\\(\\s*'${reason}'`), `${fn} guard before requireAuth`);
    const gate = callAt(src, reason);
    const inner = src.indexOf(`if (${ref}.current) return;`, gate);
    assert.ok(inner > gate, `${fn}: in-flight check inside the action`);
  }
});

test('FeedReel: like and save are gated before the optimistic flip and a resumed one changes nothing', () => {
  const src = read('src/components/FeedReel.tsx');
  assert.match(src, /import\s*\{\s*buildIntent\s*,\s*nextFollowState\s*,\s*nextToggleState\s*\}\s*from\s*'\.\.\/lib\/requireAuthLogic'\s*;/);
  for (const [reason, value, flip] of [['like', 'liked', 'setLiked(next); setLikes('], ['save', 'saved', 'setSaved(next); // optimistic']]) {
    const gate = callAt(src, reason);
    const decide = src.indexOf(`const step = nextToggleState(resumed, ${value}, null);`, gate);
    const stop = src.indexOf("if (step.action !== 'toggle') return;", decide);
    const at = src.indexOf(flip, gate);
    assert.ok(gate > 0 && decide > gate, `${reason}: nextToggleState after requireAuth`);
    assert.ok(stop > decide && at > stop, `${reason}: no flip unless the step is toggle`);
    assert.match(src.slice(decide, at), /const next = step\.next;/);
  }
  assert.doesNotMatch(src, /const next = !(liked|saved|following)\b/);
});

test('FeedReel: a resumed follow re-reads the server (null on failure) before the optimistic flip', () => {
  const src = read('src/components/FeedReel.tsx');
  const gate = callAt(src, 'follow');
  assert.match(src, /requireAuth\(\s*'follow'\s*,\s*buildIntent\(\s*'follow'\s*,\s*\[\s*f\.kitchenId\s*\]\s*,\s*`\/post\/\$\{f\.id\}`\s*,\s*Date\.now\(\)\s*\)\s*,/);
  const resumed = src.indexOf('if (resumed) {', gate);
  const flip = src.indexOf('setFollowing(next); // optimistic', gate);
  assert.ok(resumed > gate && flip > resumed, 'resumed check before the flip');
  assert.match(src.slice(resumed, flip), /await fetchIsFollowing\(f\.kitchenId\)\.catch\(\(\) => null\)/);
  assert.match(src.slice(resumed, flip), /const step = nextFollowState\(\s*resumed\s*,\s*following\s*,\s*serverIsFollowing\s*\)\s*;/);
  assert.match(src.slice(resumed, flip), /step\.action === 'abort'/);
  assert.match(src.slice(resumed, flip), /step\.action === 'keep'/);
  assert.ok(src.indexOf('toggleFollow(f.kitchenId)') > flip);
});

test('plans: both thread opens go through requireAuth after the screen guards', () => {
  const src = read('src/components/plans/index.tsx');
  const first = callAt(src, 'openThread');
  const second = callAt(src, 'openThread', first + 1);
  assert.ok(first > 0 && second > first, 'two requireAuth openThread calls');
  assert.ok(src.indexOf("openThread(kitchenId, 'subscription', sub.id)") > first);
  assert.ok(src.indexOf("openThread(k.kitchenId, 'box', sub.id)") > second);
  assert.match(src, /if \(sub\.isBox\) \{ setBoxPicker\(sub\); return; \}[^\n]*\n\s*if \(!sub\.kitchenId\) return;[\s\S]{0,80}?await requireAuth\(\s*'openThread'/);
  assert.match(src, /const pick = async \(k: BoxKitchen\) => \{\s*if \(\s*messageInFlight\.current\s*\)\s*return;\s*await requireAuth\(\s*'openThread'[^\n]*\n\s*if \(\s*messageInFlight\.current\s*\)\s*return;/);
  // BoxCookPicker calls the hook before its early return (rules of hooks).
  const picker = src.indexOf('export function BoxCookPicker(');
  const hook = src.indexOf('const requireAuth = useRequireAuth();', picker);
  assert.ok(picker > 0 && hook > picker && hook < src.indexOf('if (!sub) return null;', picker));
});

test('order: Message goes through requireAuth with a guard first; the hook runs before any early return', () => {
  const src = read('app/order/[id].tsx');
  assert.match(src, /const openChat = \(\) => \{\s*if \(\s*chatInFlight\.current\s*\)\s*return;\s*void requireAuth\(\s*'openThread'[^\n]*\n\s*if \(\s*chatInFlight\.current\s*\)\s*return;/);
  assert.ok(callAt(src, 'openThread') < src.indexOf("openThread(kitchenId, 'order', o.dbId)"));
  assert.ok(src.indexOf('const requireAuth = useRequireAuth();') < src.indexOf('if (!o && ordersLoading)'));
  assert.match(src, /onPress=\{\s*openChat\s*\}/);
});

test('chat: one requireAuth per attempt on mount; a dismissal shows the existing fallback', () => {
  const src = read('app/chat/[cook].tsx');
  assert.match(src, /if \(\s*!kitchenId\s*\|\|\s*connecting\.current\s*\)\s*return;\s*connecting\.current = true;/);
  const gate = callAt(src, 'openThread');
  assert.ok(gate > 0 && gate < src.indexOf("openThread(kitchenId, 'store')"));
  assert.match(src, /const ok = await requireAuth\(\s*'openThread'/);
  assert.match(src, /if \(\s*!ok\s*&&\s*!ran\s*\)\s*setError\('Sign in to message this kitchen\.'\);/);
  assert.match(src, /finally \{\s*connecting\.current = false;\s*\}/);
  assert.match(src, /useEffect\(\(\) => \{ void connect\(\); \}, \[connect\]\);/);
  assert.doesNotMatch(src, /requestSignIn\(/, 'the sheet is opened by requireAuth only, never in a loop');
});

test('addresses: AUTH_REQUIRED opens the sheet on web only and keeps the toast', () => {
  const src = read('app/addresses.tsx');
  assert.match(src, /import\s*\{\s*requestSignIn\s*\}\s*from\s*'\.\.\/src\/lib\/authRequest'\s*;/);
  assert.match(src, /if \(e\?\.message === 'AUTH_REQUIRED' && Platform\.OS === 'web'\) void requestSignIn\(\s*'generic'\s*\);\s*\n\s*toast\(e\?\.message === 'AUTH_REQUIRED' \? 'Sign in to save an address\.' : /);
  assert.equal(src.split('requestSignIn(').length - 1, 1);
});

test('native still runs the action at once, before any web decision', () => {
  const logic = read('src/lib/requireAuthLogic.ts');
  const body = logic.slice(logic.indexOf('export async function runRequireAuth('));
  const early = body.search(/if \(!deps\.isWeb\) \{\s*await run\(\{ resumed: false \}\);\s*return true;\s*\}/);
  assert.ok(early > 0 && early < body.indexOf('preflightDecision(') && early < body.indexOf('requestSignIn('));
  assert.match(read('src/lib/useRequireAuth.ts'), /isWeb:\s*Platform\.OS\s*===\s*'web'\s*,/);
});

test('no console calls or literal em dashes added in the C1b sites', () => {
  for (const { file } of SITES) {
    const src = read(file);
    assert.ok(!/console\.(log|warn|error|info)\(/.test(src), `${file}: console call`);
  }
  assert.ok(!read('src/lib/requireAuthLogic.ts').includes('—'));
});
