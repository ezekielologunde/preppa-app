// DESIGN docs/web-launch/SIGNIN-DESIGN.md (Loop 2 task 2.1, part C2): guest empty states on web.
// guestGateMode is the whole decision; the rest pins the wiring. Text based, whitespace tolerant.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { guestGateAfterCheck, guestGateMode, guestSessionCheck } from '../src/lib/guestGateLogic';

const ROOT = join(__dirname, '..');
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8').replace(/\r\n/g, '\n');
const EM_DASH = '—';

test('guestGateMode: every combination; guest only on web, account known, signed out', () => {
  for (const isWeb of [true, false]) {
    for (const accountReady of [true, false]) {
      for (const signedIn of [true, false]) {
        const want = isWeb && accountReady && !signedIn ? 'guest' : 'children';
        assert.equal(guestGateMode({ isWeb, accountReady, signedIn }), want, JSON.stringify({ isWeb, accountReady, signedIn }));
      }
    }
  }
});

test('guestGateMode: native always renders the screen', () => {
  for (const accountReady of [true, false]) {
    for (const signedIn of [true, false]) {
      assert.equal(guestGateMode({ isWeb: false, accountReady, signedIn }), 'children');
    }
  }
});

test('guestGateMode: no guest state while the account is still loading', () => {
  assert.equal(guestGateMode({ isWeb: true, accountReady: false, signedIn: false }), 'children');
});

test('guestSessionCheck: session, none, and failed on a reject, a throw or a timeout', async () => {
  assert.equal(await guestSessionCheck(async () => true, 50), 'session');
  assert.equal(await guestSessionCheck(async () => false, 50), 'none');
  assert.equal(await guestSessionCheck(() => Promise.reject(new Error('x')), 50), 'failed');
  assert.equal(await guestSessionCheck(() => { throw new Error('sync'); }, 50), 'failed');
  // An answer after the time limit does not count, true or false.
  const late = (v: boolean) => () => new Promise<boolean>((r) => setTimeout(() => r(v), 60));
  assert.equal(await guestSessionCheck(late(true), 10), 'failed');
  assert.equal(await guestSessionCheck(late(false), 10), 'failed');
});

test('guestSessionCheck goes through liveSessionCheck with SESSION_CHECK_MS by default', () => {
  const src = read('src/lib/guestGateLogic.ts');
  assert.match(src, /import \{ liveSessionCheck, SESSION_CHECK_MS \} from '\.\/requireAuthLogic';/);
  assert.match(src, /ms: number = SESSION_CHECK_MS,/);
  assert.match(src, /await liveSessionCheck\(/);
});

test('guestGateAfterCheck: guest only when the store says guest and the check found no session', () => {
  for (const mode of ['children', 'guest'] as const) {
    for (const check of ['pending', 'session', 'none', 'failed'] as const) {
      const want = mode === 'guest' && check === 'none' ? 'guest' : 'children';
      assert.equal(guestGateAfterCheck(mode, check), want, `${mode} ${check}`);
    }
  }
});

test('after the account reconcile times out signed out: a live session keeps the screen, no session shows the guest state', async () => {
  const stored = guestGateMode({ isWeb: true, accountReady: true, signedIn: false });
  assert.equal(stored, 'guest');
  assert.equal(guestGateAfterCheck(stored, 'pending'), 'children', 'children while the check runs');
  assert.equal(guestGateAfterCheck(stored, await guestSessionCheck(async () => true)), 'children');
  assert.equal(guestGateAfterCheck(stored, await guestSessionCheck(async () => false)), 'guest');
  assert.equal(guestGateAfterCheck(stored, await guestSessionCheck(() => Promise.reject(new Error('x')))), 'children', 'a failed check fails to the children');
});

const SCREENS: Array<{ file: string; name: string; inner: string; title: string; screenTitle?: string }> = [
  { file: 'app/(tabs)/orders.tsx', name: 'Orders', inner: 'OrdersScreen', title: 'Sign in to see your orders' },
  { file: 'app/messages/index.tsx', name: 'MessagesList', inner: 'MessagesListScreen', title: 'Sign in to see your messages', screenTitle: 'Messages' },
  { file: 'app/notifications.tsx', name: 'Notifications', inner: 'NotificationsScreen', title: 'Sign in to see your alerts', screenTitle: 'Notifications' },
  { file: 'app/saved.tsx', name: 'Saved', inner: 'SavedScreen', title: 'Sign in to see saved posts', screenTitle: 'Saved' },
];

for (const { file, name, inner, title, screenTitle } of SCREENS) {
  test(`${file} wraps the whole screen in GuestGate`, () => {
    const src = read(file);
    assert.match(src, /import\s*\{\s*GuestGate\s*\}\s*from\s*'(\.\.\/)+src\/components\/GuestGate'\s*;/);
    // The default export is only the gate around the original screen, so the screen's loads never run for a guest.
    const wrapper = new RegExp(
      `export default function ${name}\\(\\)\\s*\\{\\s*return\\s*\\(\\s*<GuestGate\\s[^>]*>\\s*<${inner}\\s*/>\\s*</GuestGate>\\s*\\);\\s*\\}`,
    );
    assert.match(src, wrapper);
    assert.match(src, new RegExp(`\\nfunction ${inner}\\(\\)\\s*\\{`));
    const gate = src.match(/<GuestGate\s[^>]*>/)![0];
    assert.match(gate, new RegExp(`title="${title}"`));
    assert.match(gate, /body="[^"]+"/);
    if (screenTitle) assert.match(gate, new RegExp(`screenTitle="${screenTitle}"`));
    assert.ok(!gate.includes(EM_DASH), 'no em dash in the guest copy');
  });
}

test('public screens are not gated', () => {
  for (const file of ['app/(tabs)/home.tsx', 'app/(tabs)/feeds.tsx', 'app/(tabs)/experiences.tsx', 'app/discover.tsx', 'app/store/[cook].tsx']) {
    assert.doesNotMatch(read(file), /GuestGate/, file);
  }
});

test('GuestGate decides only through guestGateMode with accountReady and renders children otherwise', () => {
  const src = read('src/components/GuestGate.tsx');
  assert.match(src, /import\s*\{[^}]*\bguestGateMode\b[^}]*\}\s*from\s*'\.\.\/lib\/guestGateLogic'\s*;/);
  assert.match(src, /const\s*\{\s*accountReady\s*,\s*signedIn\s*\}\s*=\s*useStore\(\)\s*;/);
  assert.match(src, /guestGateMode\(\s*\{\s*isWeb:\s*Platform\.OS === 'web'\s*,\s*accountReady\s*,\s*signedIn\s*\}\s*\)/);
  const childrenReturn = src.search(/if \(mode !== 'guest'\) return <>\{children\}<\/>;/);
  assert.ok(childrenReturn > 0, 'children return missing');
  // Nothing of the guest state is built before the children return.
  assert.ok(childrenReturn < src.indexOf('<GuestState'), 'guest state must come after the children return');
});

test('GuestGate runs one live session check before the guest state and resets it when not guest', () => {
  const src = read('src/components/GuestGate.tsx');
  assert.match(src, /const stored = guestGateMode\(/);
  assert.match(src, /const check = useGuestSessionCheck\(stored\);\s*const mode = guestGateAfterCheck\(stored, check\);\s*if \(mode !== 'guest'\) return <>\{children\}<\/>;/);
  const at = src.indexOf('function useGuestSessionCheck(');
  assert.ok(at > 0);
  const hook = src.slice(at, src.indexOf('function GuestState('));
  assert.match(hook, /useState<GuestSessionCheck>\('pending'\)/);
  assert.match(hook, /if \(stored !== 'guest'\) \{\s*setCheck\('pending'\);\s*return undefined;\s*\}/);
  assert.match(hook, /guestSessionCheck\(\(\) => supabase\.auth\.getSession\(\)\.then\(\(\{ data \}\) => !!data\.session\)\)/);
  assert.match(hook, /if \(current\) setCheck\(r\);/);
  assert.match(hook, /return \(\) => \{\s*current = false;\s*\};\s*\}, \[stored\]\);/);
});

test('GuestGate keeps the top bar and its back button for pushed screens (screenTitle)', () => {
  const src = read('src/components/GuestGate.tsx');
  assert.match(src, /if \(!screenTitle\) return state;\s*return \(\s*<Screen>\s*<TopBar title=\{screenTitle\} \/>\s*\{state\}\s*<\/Screen>\s*\);/);
});

const PROFILE = 'app/(tabs)/profile.tsx';
const blocks = (src: string, open: string) => {
  const re = new RegExp(`\\{${open} \\? \\(([\\s\\S]*?)\\n {8}\\) : null\\}`, 'g');
  return [...src.matchAll(re)].map((m) => m[1]);
};

test('profile is not wrapped in GuestGate; the default export is the screen and the guest flag needs no extra hook', () => {
  const src = read(PROFILE);
  assert.doesNotMatch(src, /GuestGate/);
  assert.match(src, /export default function Profile\(\) \{\s*const c = useC\(\);/);
  assert.match(src, /import \{ guestGateMode \} from '\.\.\/\.\.\/src\/lib\/guestGateLogic';/);
  assert.match(src, /const \{ accountReady, signedIn \} = useStore\(\);\n.*\n.*\n\s*const guest = guestGateMode\(\{ isWeb: Platform\.OS === 'web', accountReady, signedIn \}\) === 'guest';/);
});

test('profile web guest: a sign-in card instead of the account header, the help and legal links kept', () => {
  const src = read(PROFILE);
  const shown = blocks(src, 'guest');
  assert.equal(shown.length, 2);
  const [card, rows] = shown;
  assert.match(card, /<Text accessibilityRole="header"[^>]*>Sign in to your account<\/Text>/);
  assert.match(card, /<Btn label="Sign in" onPress=\{\(\) => void requestSignIn\('generic'\)\} \/>/);
  assert.ok(card.indexOf('Sign in to your account') < card.indexOf('<Btn label="Sign in"'));
  assert.ok(!card.includes(EM_DASH));
  assert.match(rows, /<Group label="Activity">\s*\{guestActivity\.map\(/);
  assert.match(rows, /<Group label="Help & support">\s*\{guestSupport\.map\(/);
  assert.match(src, /const guestActivity = activity\.filter\(\(r\) => r\.t === 'Favorites'\);/);
  assert.match(src, /const guestSupport = support\.filter\(\(r\) => r\.t !== 'Your support requests'\);/);
  const start = src.indexOf('const support: Row[] = [');
  const sup = src.slice(start, src.indexOf('];', start));
  for (const re of [
    /t: 'Contact support', act: \(\) => openLink\(CONTACT_URL\)/,
    /t: 'Help center', act: \(\) => openLink\(HELP_URL\)/,
    /t: 'Privacy policy', act: \(\) => openLink\(PRIVACY_URL\)/,
    /t: 'Terms of service', act: \(\) => openLink\(TERMS_URL\)/,
  ]) assert.match(sup, re);
  assert.match(src, /t: 'Favorites', act: \(\) => router\.push\('\/favorites'\)/);
  for (const s of ["'/orders'", "'/addresses'", "'/payments'", "'/tickets'", "'/saved'", "'/edit-profile'", 'logout', 'confirmDelete']) {
    assert.ok(!card.includes(s) && !rows.includes(s), s);
  }
});

test('profile web guest: account-only parts are hidden; cook, PrepPlus, admin and dark mode render for everyone', () => {
  const src = read(PROFILE);
  const hidden = blocks(src, '!guest').join('\n');
  for (const s of ["router.push('/edit-profile')", '{activity.map(', '{wallet.map(', '{support.map(', 'onPress={logout}', 'onPress={confirmDelete}']) {
    assert.ok(hidden.includes(s), s);
  }
  for (const s of ["router.push('/apply')", "router.push('/my-hub')", "router.push('/prepplus')", 'Admin dashboard', 'accessibilityLabel="Dark mode"']) {
    assert.ok(src.includes(s), s);
    assert.ok(!hidden.includes(s), s);
  }
});

test('GuestGate guest state: heading, Sign in button on the given reason, generic by default', () => {
  const src = read('src/components/GuestGate.tsx');
  assert.match(src, /reason = 'generic'/);
  assert.match(src, /<Text accessibilityRole="header"[^>]*>\{title\}<\/Text>/);
  assert.match(src, /<Btn label="Sign in" onPress=\{\(\) => void requestSignIn\(reason\)\}\s*\/>/);
  // Focus order follows the document: heading, sentence, button.
  const h = src.indexOf('{title}</Text>');
  const b = src.indexOf('{body}</Text>');
  const btn = src.indexOf('<Btn label="Sign in"');
  assert.ok(h > 0 && h < b && b < btn);
});

test('GuestGate and its logic: no console, no em dash, no window.location', () => {
  for (const file of ['src/components/GuestGate.tsx', 'src/lib/guestGateLogic.ts']) {
    const src = read(file);
    assert.doesNotMatch(src, /console\./, file);
    assert.ok(!src.includes(EM_DASH), `${file}: em dash`);
    assert.doesNotMatch(src, /window\.location/, file);
  }
});

test('My Hub signed-out Connect return has a web Sign in button on reason connect and keeps ?connect=', () => {
  const src = read('app/(tabs)/my-hub.tsx');
  const at = src.indexOf("if (decision === 'signInToFinish') {");
  const end = src.indexOf("if (decision === 'redirect')");
  assert.ok(at > 0 && end > at);
  const branch = src.slice(at, end);
  assert.match(branch, /\{Platform\.OS === 'web' \? \(\s*<View[^>]*>\s*<Btn label="Sign in" onPress=\{\(\) => void requestSignIn\(\s*'connect'\s*\)\}\s*\/>\s*<\/View>\s*\) : null\}/);
  assert.doesNotMatch(branch, /setParams/);
  assert.ok(!branch.includes(EM_DASH));
});
