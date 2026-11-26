// Wiring for the web sign-in sheet (SIGNIN-DESIGN.md, work breakdown B): the host is mounted on
// web only, the sheet passes the web-only form options, and native onboarding is left alone.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const ROOT = join(__dirname, '..');
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');
const SHEET_FILES = ['src/components/auth/AuthSheet.tsx', 'src/components/auth/AuthSheetHost.tsx', 'src/lib/authSheetLogic.ts'];

/** The text of `function name(...) { ... }` up to its matching closing brace. */
function functionBody(src: string, name: string): string {
  const start = src.indexOf(`function ${name}(`);
  assert.ok(start >= 0, `function ${name} not found`);
  const open = src.indexOf('{', src.indexOf(')', start));
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}' && --depth === 0) return src.slice(open, i + 1);
  }
  throw new Error(`function ${name} is not closed`);
}

test('_layout mounts AuthSheetHost right after ToastHost', () => {
  const src = read('app/_layout.tsx');
  assert.match(src, /import \{ AuthSheetHost \} from '\.\.\/src\/components\/auth\/AuthSheetHost';/);
  assert.match(src, /<ToastHost \/>\s*<AuthSheetHost \/>/);
  assert.equal(src.split('<AuthSheetHost />').length - 1, 1, 'mounted exactly once');
});

test('_layout scrubs the auth fragment once, at module level, behind the web guard', () => {
  const src = read('app/_layout.tsx');
  assert.match(src, /import \{ scrubAuthFragment \} from '\.\.\/src\/lib\/authRequest';/);
  const guarded = "if (Platform.OS === 'web' && typeof window !== 'undefined') scrubAuthFragment(window);";
  const at = src.indexOf(guarded);
  assert.ok(at >= 0, 'guarded scrub call not found');
  assert.ok(at < src.indexOf('export default function RootLayout'), 'scrub runs at module level');
  assert.equal(src.split('scrubAuthFragment(').length - 1, 1, 'one call');
});

test('_layout keeps the native onboarding gate as it was', () => {
  const src = read('app/_layout.tsx');
  assert.ok(src.includes("{ready && !onboarded && Platform.OS !== 'web' ? <OnboardingFlow /> : null}"), 'onboarding gate line changed');
  assert.ok(src.includes('{/* Web visitors browse as guests; the preference flow stays native-only (auth is asked at gated actions). */}'));
});

test('AuthSheetHost renders null off web and subscribes only inside the web host', () => {
  const src = read('src/components/auth/AuthSheetHost.tsx');
  const outer = functionBody(src, 'AuthSheetHost');
  assert.match(outer, /^\{\s*if \(Platform\.OS !== 'web'\) return null;\s*return <WebAuthSheetHost \/>;\s*\}$/);
  assert.doesNotMatch(outer, /\buse[A-Z]/, 'no hooks before the platform guard');
  const inner = functionBody(src, 'WebAuthSheetHost');
  assert.match(inner, /useSyncExternalStore\(subscribe, getSignInState, getSignInState\)/);
});

test('AuthSheetHost guards stale work and clears the intent on every exit', () => {
  const src = read('src/components/auth/AuthSheetHost.tsx');
  const inner = functionBody(src, 'WebAuthSheetHost');
  // Unmount settles false once and clears the stored intent.
  assert.match(inner, /return \(\) => \{[\s\S]*?clearIntent\(\);\s*dismissSignIn\(\);\s*\};\s*\}, \[\]\);/);
  // The success timer settles only the request the sign-in belongs to.
  assert.match(inner, /if \(!isSameOpenRequest\(opened, getSignInState\(\)\)\) return;\s*if \(alive\.current\) setSuccess\(false\);\s*resolveSignIn\(true\);/);
  assert.equal(inner.split('resolveSignIn(true)').length - 1, 1, 'one place resolves true');
  // A late key lookup stores the intent only through mayBindIntent.
  assert.match(inner, /if \(!mayBindIntent\(\{[^}]*\}\)\) return;\s*if \(saveIntent\(intent, key\)\)/);
  assert.equal(inner.split('saveIntent(').length - 1, 1, 'one place saves the intent');
  // Dismiss clears and settles false.
  assert.match(inner, /clearIntent\(\);\s*dismissSignIn\(\);\s*\}, \[\]\);/);
});

for (const file of SHEET_FILES) {
  test(`${file} has no console calls, no literal em dash and no window.location`, () => {
    const src = read(file);
    assert.ok(!src.includes('console.'), 'console. found');
    assert.ok(!src.includes('—'), 'literal em dash found');
    assert.ok(!src.includes('window.location'), 'window.location found');
  });
}

test('AuthSheet passes the web-only form options', () => {
  const src = read('src/components/auth/AuthSheet.tsx');
  assert.match(src, /import \{[^}]*\bWEB_PASSWORD_MIN\b[^}]*\} from '\.\.\/\.\.\/lib\/webAuth';/);
  assert.match(src, /passwordMin=\{WEB_PASSWORD_MIN\}/);
  assert.match(src, /resendCooldownSec=\{WEB_RESEND_COOLDOWN_SEC\}/);
  assert.match(src, /webAuthError\(err/);
  assert.match(src, /webAuthNotice\(err\)/);
  assert.equal(src.split('mapError={mapError}').length - 1, 2, 'Auth and Code both map errors');
  assert.match(src, /mapNotice=\{mapNotice\}/);
  assert.match(src, /^\s*neutralRecovery\s*$/m);
  assert.match(src, /const CONSENT_MODE = consentModeFromFlag\(process\.env\.EXPO_PUBLIC_CONSENT_CHECKBOX\);/);
  assert.match(src, /const consent = \{ mode: CONSENT_MODE, checked: consentChecked, onChange: setConsentChecked \};/);
  assert.match(src, /consent=\{consent\}/);
  assert.match(src, /onAccountEmail=\{onAccountEmail\}/);
});

test('AuthSheet uses Modal directly and points at the code-first decision', () => {
  const src = read('src/components/auth/AuthSheet.tsx');
  assert.match(src, /import \{[^}]*\bModal\b[^}]*\} from 'react-native';/);
  assert.doesNotMatch(src, /from '\.\.\/\.\.\/ui\/overlay'/);
  assert.match(src, /TODO: code-first on web \(docs\/web-launch\/SIGNIN-DESIGN\.md, decision 1\)/);
});

test('store logout clears the intent and closes the sheet', () => {
  const src = read('src/store/store.tsx');
  assert.match(src, /import \{ clearIntent, dismissSignIn \} from '\.\.\/lib\/authRequest';/);
  const line = src.split(/\r?\n/).find((l) => l.includes('const logout = useCallback('));
  assert.ok(line, 'logout not found');
  assert.match(line, /clearIntent\(\);/);
  assert.match(line, /dismissSignIn\(\);/);
  assert.match(line, /signOutUser\(\);/);
});

test('Onboarding still imports from ./auth/ and passes none of the web-only options', () => {
  const src = read('src/components/Onboarding.tsx');
  assert.match(src, /import \{ Auth \} from '\.\/auth\/AuthForm';/);
  assert.match(src, /import \{ Code \} from '\.\/auth\/CodeForm';/);
  for (const prop of ['passwordMin', 'resendCooldownSec', 'mapError', 'mapNotice', 'neutralRecovery', 'consent', 'onAccountEmail']) {
    assert.ok(!src.includes(prop), `${prop} found in Onboarding.tsx`);
  }
});
