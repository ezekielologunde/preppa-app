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

// Render the real components with React. Replace only native/platform dependencies
// so node:test can inspect the props delivered to React Native's Pressable without
// an emulator, a native bundler, or a new test-renderer dependency.
function loadButtons(): { Btn: any; Press: any; render(component: any, props: Props): Props } {
  const pressables: Props[] = [];
  const container = ({ children }: Props) => React.createElement(React.Fragment, null, children);
  const native = {
    Pressable: (props: Props) => { pressables.push(props); return container(props); },
    View: container,
    Text: container,
    ActivityIndicator: () => null,
    Animated: { View: container, Value: class { constructor(_value: number) {} } },
    StyleSheet: { flatten: (style: any) => Object.assign({}, ...[style].flat().filter(Boolean)) },
  };
  const modules: Record<string, unknown> = {
    react: React,
    'react-native': native,
    'expo-image': { Image: () => null },
    'expo-linear-gradient': { LinearGradient: container },
    '../theme/theme': { radius: { md: 12, pill: 999 }, shadow: { soft: {} }, type: () => ({}) },
    '../theme/ThemeContext': { useC: () => ({ primaryD: '#D4430D', ink: '#221E1B', surface: '#fff' }) },
    './Icon': { Icon: () => null },
    './useReducedMotion': { useReducedMotion: () => true },
  };
  const filename = resolve('src/ui/primitives.tsx');
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
  return {
    Btn: exports.Btn,
    Press: exports.Press,
    render(component: any, props: Props) {
      pressables.length = 0;
      renderToStaticMarkup(React.createElement(component, props));
      assert.equal(pressables.length, 1);
      return pressables[0];
    },
  };
}

test('Btn retains its name and button role while loading and after recovery', () => {
  const ui = loadButtons();
  const onPress = () => {};
  for (const loading of [false, true, false]) {
    const props = ui.render(ui.Btn, { label: 'Save changes', onPress, loading });
    assert.equal(props.accessibilityRole, 'button');
    assert.equal(props.accessibilityLabel, 'Save changes');
    assert.equal(props.disabled, loading);
    assert.equal(props.accessibilityState.disabled, loading);
    assert.equal(props.accessibilityState.busy, loading);
    assert.equal(props.onPress, loading ? undefined : onPress);
  }
});

test('Btn reports disabled independently of loading, including without a handler', () => {
  const ui = loadButtons();
  for (const loading of [false, true]) {
    const props = ui.render(ui.Btn, { label: 'Save changes', disabled: true, loading });
    assert.equal(props.accessibilityRole, 'button');
    assert.equal(props.disabled, true);
    assert.equal(props.accessibilityState.disabled, true);
    assert.equal(props.accessibilityState.busy, loading);
  }
});

test('Press preserves explicit roles and independent accessibility states', () => {
  const ui = loadButtons();
  for (const role of ['checkbox', 'radio', 'tab', 'none']) {
    const props = ui.render(ui.Press, {
      role, onPress: () => {}, selected: false, checked: 'mixed', expanded: false, busy: true,
    });
    assert.equal(props.accessibilityRole, role);
    assert.equal(props.accessibilityState.selected, false);
    assert.equal(props.accessibilityState.checked, 'mixed');
    assert.equal(props.accessibilityState.expanded, false);
    assert.equal(props.accessibilityState.busy, true);
    assert.equal(props.accessibilityState.disabled, false);
  }
  assert.equal(ui.render(ui.Press, {}).accessibilityRole, undefined);
  assert.equal(ui.render(ui.Press, { onPress: () => {} }).accessibilityRole, 'button');
});
