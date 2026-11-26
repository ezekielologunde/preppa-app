// DESIGN docs/web-launch/SIGNIN-DESIGN.md (Loop 2 task 2.1, part C2): guest empty states on web.
// guestGateMode is the whole decision; the rest pins the wiring. Text based, whitespace tolerant.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { guestGateMode } from '../src/lib/guestGateLogic';

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

const SCREENS: Array<{ file: string; name: string; inner: string; title: string; screenTitle?: string }> = [
  { file: 'app/(tabs)/profile.tsx', name: 'Profile', inner: 'ProfileScreen', title: 'Sign in to see your profile' },
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
  for (const file of ['app/(tabs)/home.tsx', 'app/(tabs)/feeds.tsx', 'app/(tabs)/experiences.tsx', 'app/discover.tsx']) {
    assert.doesNotMatch(read(file), /GuestGate/, file);
  }
});

test('GuestGate decides only through guestGateMode with accountReady and renders children otherwise', () => {
  const src = read('src/components/GuestGate.tsx');
  assert.match(src, /import\s*\{\s*guestGateMode\s*\}\s*from\s*'\.\.\/lib\/guestGateLogic'\s*;/);
  assert.match(src, /const\s*\{\s*accountReady\s*,\s*signedIn\s*\}\s*=\s*useStore\(\)\s*;/);
  assert.match(src, /guestGateMode\(\s*\{\s*isWeb:\s*Platform\.OS === 'web'\s*,\s*accountReady\s*,\s*signedIn\s*\}\s*\)/);
  const childrenReturn = src.search(/if \(mode !== 'guest'\) return <>\{children\}<\/>;/);
  assert.ok(childrenReturn > 0, 'children return missing');
  // Nothing of the guest state is built before the children return.
  assert.ok(childrenReturn < src.indexOf('<GuestState'), 'guest state must come after the children return');
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
