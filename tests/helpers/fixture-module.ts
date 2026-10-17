import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';

// Execute the actual source, with explicit boundaries for platform modules/configuration.
// Unexpected imports fail: tests cannot load app credentials, storage, or a live client.
export function fixtureModule<T>(file: string, imports: Record<string, unknown>): T {
  const module = { exports: {} };
  const code = ts.transpileModule(readFileSync(resolve(file), 'utf8'), {
    fileName: file,
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React },
  }).outputText;
  vm.runInNewContext(code, {
    module, exports: module.exports,
    require(name: string) {
      if (!Object.hasOwn(imports, name)) throw new Error(`Unexpected fixture import: ${name}`);
      return imports[name];
    },
  }, { filename: file, timeout: 1000 });
  return module.exports as T;
}

export const plain = <T>(value: T): T => JSON.parse(JSON.stringify(value));
