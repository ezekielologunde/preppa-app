import { readdir, readFile } from 'node:fs/promises';
import { extname, join, relative } from 'node:path';

const root = process.cwd();
const targets = ['app', 'src'];
const failures = [];

async function walk(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) await walk(path);
    else if (extname(entry.name) === '.tsx') await check(path);
  }
}

async function check(path) {
  const source = await readFile(path, 'utf8');
  const pattern = /<TextInput(?=\s)[\s\S]*?\/>/g;
  for (const match of source.matchAll(pattern)) {
    if (/\baccessibilityLabel\s*=/.test(match[0])) continue;
    const line = source.slice(0, match.index).split(/\r?\n/).length;
    failures.push(`${relative(root, path)}:${line} TextInput is missing accessibilityLabel`);
  }
}

for (const target of targets) await walk(join(root, target));

if (failures.length) {
  console.error(failures.join('\n'));
  process.exit(1);
}

console.log('Accessibility input-name check passed');
