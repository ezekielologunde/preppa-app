// Wiring for the B extraction (SIGNIN-DESIGN.md, work breakdown B): the sign-in forms live in
// src/components/auth/ and onboarding imports them from there.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const ROOT = join(__dirname, '..');
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');
const NEW = ['src/components/auth/authUi.tsx', 'src/components/auth/AuthForm.tsx', 'src/components/auth/CodeForm.tsx'];

test('Onboarding imports the sign-in pieces from ./auth/', () => {
  const src = read('src/components/Onboarding.tsx');
  assert.match(src, /import \{ Spinner, Title, Lead \} from '\.\/auth\/authUi';/);
  assert.match(src, /import \{ Auth \} from '\.\/auth\/AuthForm';/);
  assert.match(src, /import \{ Code \} from '\.\/auth\/CodeForm';/);
  for (const name of ['Auth', 'Code', 'Spinner', 'Title', 'Lead', 'useShake']) {
    assert.doesNotMatch(src, new RegExp(`function ${name}\\(`), `${name} is still defined in Onboarding.tsx`);
  }
});

for (const file of NEW) {
  test(`${file} has no console calls and no literal em dash`, () => {
    const src = read(file);
    assert.ok(!src.includes('console.'), 'console. found');
    assert.ok(!src.includes('\u2014'), 'literal em dash found');
  });
}

test('supabase client still has detectSessionInUrl: false', () => {
  assert.match(read('src/lib/supabase.ts'), /detectSessionInUrl: false/);
});
