import assert from 'node:assert/strict';
import test from 'node:test';
import React, { act } from 'react';
import { JSDOM } from 'jsdom';
import { fixtureModule } from './helpers/fixture-module';

// Use React's real DOM renderer with small native-control adapters. This covers form
// state/events, not native layout, device keyboards, or a real Supabase connection.
async function form(join: (email: string) => Promise<unknown>) {
  const dom = new JSDOM('<!doctype html><div id="root"></div>', { url: 'https://waitlist.example.invalid' });
  const saved = new Map<string, PropertyDescriptor | undefined>();
  for (const [key, value] of Object.entries({ window: dom.window, document: dom.window.document, navigator: dom.window.navigator, IS_REACT_ACT_ENVIRONMENT: true })) {
    saved.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  }
  // Require after installing DOM globals so React initializes browser events correctly.
  const { createRoot } = require('react-dom/client');
  const pending: Promise<unknown>[] = [];
  const errors: unknown[] = [];
  const calls: string[] = [];
  const run = (callback: () => unknown) => { pending.push(Promise.resolve(callback()).catch(error => { errors.push(error); })); };
  const h = React.createElement;
  const { LaunchingSoon } = fixtureModule<{ LaunchingSoon: React.ComponentType<{ area: string }> }>('src/components/LaunchingSoon.tsx', {
    react: React,
    'react-native': {
      View: ({ children }: any) => h('div', null, children),
      Text: ({ children, accessibilityRole }: any) => h('span', { role: accessibilityRole === 'alert' ? 'alert' : undefined }, children),
      TextInput: ({ value, onChangeText, onSubmitEditing, editable }: any) => h('input', {
        value, disabled: editable === false,
        onChange: (event: any) => onChangeText(event.target.value),
        onKeyDown: (event: any) => { if (event.key === 'Enter') run(onSubmitEditing); },
      }),
    },
    'expo-router': { useRouter: () => ({ push: () => {} }) },
    '../theme/ThemeContext': { useC: () => ({}) },
    '../theme/theme': { type: () => ({}), serif: () => ({}), radius: {} },
    '../ui': { Icon: () => null, Btn: ({ label, loading, onPress }: any) => h('button', {
      disabled: !!loading, 'aria-busy': !!loading, onClick: () => run(onPress),
    }, label) },
    '../lib/waitlist': { joinWaitlist: (email: string) => { calls.push(email); return join(email); } },
  });
  const container = dom.window.document.getElementById('root')!;
  const root = createRoot(container);
  await act(async () => { root.render(h(LaunchingSoon, { area: 'Test area' })); });
  return {
    container, calls, errors,
    button: () => [...container.querySelectorAll('button')].find(button => button.textContent === 'Notify me at launch')!,
    async email(value: string) {
      const input = container.querySelector('input')!;
      await act(async () => {
        Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, 'value')!.set!.call(input, value);
        input.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
      });
    },
    enter() { container.querySelector('input')!.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); },
    async settle() { await act(async () => { await Promise.all(pending); }); },
    async close() {
      await act(async () => { root.unmount(); });
      dom.window.close();
      for (const [key, descriptor] of saved) {
        if (descriptor) Object.defineProperty(globalThis, key, descriptor);
        else Reflect.deleteProperty(globalThis, key);
      }
    },
  };
}

test('successful signup displays confirmation and removes the signup form', async () => {
  const f = await form(async () => ({ ok: true }));
  try {
    await f.email('person@example.invalid');
    await act(async () => { f.button().click(); });
    await f.settle();
    assert.deepEqual(f.calls, ['person@example.invalid']);
    assert.match(f.container.textContent!, /on the list/);
    assert.equal(f.container.querySelector('input'), null);
  } finally { await f.close(); }
});

test('invalid email and backend failures stay visible and allow a successful retry', async () => {
  const outcomes = [{ ok: false, reason: 'invalid_email' }, { ok: false, reason: 'failed' }, { ok: true }];
  const f = await form(async () => outcomes.shift());
  try {
    await act(async () => { f.button().click(); });
    await f.settle();
    assert.match(f.container.textContent!, /Enter a valid email/);
    await f.email('person@example.invalid');
    await act(async () => { f.button().click(); });
    await f.settle();
    assert.match(f.container.textContent!, /Something went wrong/);
    assert.equal(f.button().disabled, false);
    await act(async () => { f.button().click(); });
    await f.settle();
    assert.match(f.container.textContent!, /on the list/);
  } finally { await f.close(); }
});

test('an unexpected rejected signup clears busy state and can be retried', async () => {
  let attempt = 0;
  const f = await form(async () => { if (++attempt === 1) throw new Error('synthetic failure'); return { ok: true }; });
  try {
    await act(async () => { f.button().click(); });
    await f.settle();
    assert.equal(f.errors.length, 0, 'submit must handle the rejection');
    assert.match(f.container.textContent!, /Something went wrong/);
    assert.equal(f.button().disabled, false);
    await act(async () => { f.button().click(); });
    await f.settle();
    assert.match(f.container.textContent!, /on the list/);
  } finally { await f.close(); }
});

test('Enter and button submission in the same React batch issue only one signup', async () => {
  let finish!: (value: unknown) => void;
  const request = new Promise(resolve => { finish = resolve; });
  const f = await form(() => request);
  try {
    await f.email('person@example.invalid');
    await act(async () => { f.enter(); f.button().click(); f.enter(); });
    assert.equal(f.calls.length, 1);
    assert.equal(f.button().disabled, true);
    await act(async () => { finish({ ok: true }); });
    await f.settle();
    assert.match(f.container.textContent!, /on the list/);
  } finally { finish({ ok: true }); await f.settle(); await f.close(); }
});
