import assert from 'node:assert/strict';
import test from 'node:test';
import { validateServiceEnvironment } from '../src/lib/environmentSafety';

const fixture = { production: false, url: 'https://test.supabase.co', anonKey: 'fixture-test', stripeKey: 'pk_test_fixture', liveUrl: 'https://live.supabase.co', liveAnonKey: 'fixture-live' };
test('isolated HTTPS and local Supabase environments are allowed', () => {
  validateServiceEnvironment(fixture);
  validateServiceEnvironment({ ...fixture, url: 'http://127.0.0.1:54321' });
});
test('preview cannot bypass production protection through URL spelling', () => {
  for (const url of ['https://live.supabase.co', 'https://live.supabase.co/', 'https://LIVE.supabase.co', 'https://live.supabase.co:443/']) {
    assert.throws(() => validateServiceEnvironment({ ...fixture, url }), /production services/);
  }
});
test('production credentials remain blocked even with a different endpoint', () => {
  assert.throws(() => validateServiceEnvironment({ ...fixture, anonKey: fixture.liveAnonKey }), /production services/);
  assert.throws(() => validateServiceEnvironment({ ...fixture, stripeKey: 'pk_live_fixture' }), /production services/);
});
test('malformed and ambiguous backend endpoints fail before client creation', () => {
  for (const url of ['bad', 'ftp://test.supabase.co', 'http://test.supabase.co', 'https://user:password@test.supabase.co', 'https://test.supabase.co/rest/v1', 'https://test.supabase.co?key=value', 'https://test.supabase.co#fragment']) {
    assert.throws(() => validateServiceEnvironment({ ...fixture, url }), /Invalid Supabase URL/);
  }
  for (const field of ['url', 'anonKey', 'stripeKey']) assert.throws(() => validateServiceEnvironment({ ...fixture, [field]: '' }), /not configured/);
});
test('explicit production configuration can use its production backend', () => {
  validateServiceEnvironment({ ...fixture, production: true, url: fixture.liveUrl, anonKey: fixture.liveAnonKey, stripeKey: 'pk_live_fixture' });
});
test('production fails closed on test, secret and malformed payment keys', () => {
  for (const stripeKey of ['pk_test_fixture', 'sk_live_fixture', 'rk_live_fixture', 'pk_live_', ' pk_live_fixture', 'pk_live_fixture\n']) {
    assert.throws(() => validateServiceEnvironment({ ...fixture, production: true, url: fixture.liveUrl, anonKey: fixture.liveAnonKey, stripeKey }), /live Stripe publishable key/);
  }
});
test('preview accepts only a nonempty test publishable key', () => {
  for (const stripeKey of ['sk_test_fixture', 'rk_test_fixture', 'pk_test_', 'invalid']) {
    assert.throws(() => validateServiceEnvironment({ ...fixture, stripeKey }), /test Stripe publishable key/);
  }
});
