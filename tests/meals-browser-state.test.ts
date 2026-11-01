import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import test from 'node:test';
import { runInNewContext } from 'node:vm';

const require = createRequire(resolve('package.json'));
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const ts = require('typescript');
type Props = Record<string, any>;
type State = { data: Props[] | null; loading: boolean; error: Error | null };

// The cache distinguishes no successful result (null) from a successful empty
// result ([]). Render the real browser at that hook boundary without API calls.
function renderBrowser(state: State, initialCat?: string) {
  const notices: Props[] = [];
  const buttons: Props[] = [];
  const grids: Props[][] = [];
  const invalidated: string[] = [];
  let spinners = 0;
  const container = ({ children }: Props) => React.createElement(React.Fragment, null, children);
  const modules: Record<string, unknown> = {
    react: React,
    'react-native': {
      View: container, Text: container, ScrollView: container, TextInput: () => null,
      ActivityIndicator: () => { spinners++; return null; },
    },
    '../data/data': { cookOf: () => ({ name: 'Test kitchen' }) },
    '../data/hooks': { useMeals: () => state },
    '../theme/ThemeContext': { useC: () => ({}) },
    '../theme/theme': { type: () => ({}), radius: {} },
    '../ui': {
      Icon: () => null, Press: container, Sheet: () => null,
      Btn: (props: Props) => { buttons.push(props); return null; },
    },
    '../ui/layout': {
      Empty: (props: Props) => { notices.push(props); return props.action ?? null; },
    },
    './cards': { MealGrid: ({ meals }: Props) => { grids.push(meals); return null; } },
    '../data/cache': { invalidate: (key: string) => invalidated.push(key) },
  };
  const filename = resolve('src/components/MealsBrowser.tsx');
  const { outputText } = ts.transpileModule(readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React, esModuleInterop: true },
    fileName: filename,
  });
  const exports: Props = {};
  runInNewContext(outputText, {
    exports,
    require: (name: string) => {
      assert.ok(name in modules, `Unexpected component dependency: ${name}`);
      return modules[name];
    },
  }, { filename });
  renderToStaticMarkup(React.createElement(exports.MealsBrowser, { initialCat }));
  return { notices, buttons, grids, invalidated, spinners };
}

const failed = new Error('offline');
const meal = { id: 'meal-1', name: 'Stew', tags: ['Comfort'], price: 12, protein: 35, kcal: 450 };

test('cached empty catalog keeps refresh recovery instead of claiming the first load failed', () => {
  const ui = renderBrowser({ data: [], loading: false, error: failed });
  assert.deepEqual(ui.notices.map((notice) => notice.title), ['Meals may be out of date', 'No matches']);
  const refresh = ui.buttons.find((button) => button.label === 'Refresh');
  assert.ok(refresh);
  refresh.onPress();
  assert.deepEqual(ui.invalidated, ['catalog:live']);
  assert.equal(ui.spinners, 0);
});

test('filters matching zero cached meals do not hide refresh failure or its retry', () => {
  const ui = renderBrowser({ data: [meal], loading: false, error: failed }, 'Seafood');
  assert.deepEqual(ui.notices.map((notice) => notice.title), ['Meals may be out of date', 'No matches']);
  assert.equal(ui.buttons.filter((button) => button.label === 'Refresh').length, 1);
  assert.equal(ui.grids.length, 0);
});

test('uncached failure still offers an initial-load retry without a stale-data claim', () => {
  const ui = renderBrowser({ data: null, loading: false, error: failed });
  assert.deepEqual(ui.notices.map((notice) => notice.title), ['Couldn’t load meals']);
  assert.equal(ui.buttons[0].label, 'Try again');
  ui.buttons[0].onPress();
  assert.deepEqual(ui.invalidated, ['catalog:live']);
});

test('successful empty results and initial loading remain distinct', () => {
  const empty = renderBrowser({ data: [], loading: false, error: null });
  assert.deepEqual(empty.notices.map((notice) => notice.title), ['No matches']);
  assert.equal(empty.buttons.length, 0);
  const loading = renderBrowser({ data: null, loading: true, error: null });
  assert.equal(loading.spinners, 1);
  assert.equal(loading.notices.length, 0);
});

test('refresh failure preserves matching cached meals alongside recovery', () => {
  const ui = renderBrowser({ data: [meal], loading: false, error: failed });
  assert.deepEqual(ui.notices.map((notice) => notice.title), ['Meals may be out of date']);
  assert.deepEqual(ui.grids, [[meal]]);
  assert.equal(ui.buttons[0].label, 'Refresh');
});
