import { readdir, readFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../dist/', import.meta.url));
const textExtensions = new Set(['.html', '.js', '.json', '.map', '.txt', '.css']);
const forbidden = [
  ['Stripe secret key', /\b(?:sk|rk)_(?:live|test)_[A-Za-z0-9]+/],
  ['private key', /-----BEGIN (?:EC |RSA )?PRIVATE KEY-----/],
  ['service-role environment name', /SUPABASE_SERVICE_ROLE_KEY/],
  ['service-role JWT claim', /["']role["']\s*:\s*["']service_role["']/],
];

async function files(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const nested = await Promise.all(entries.map((entry) => {
    const path = join(dir, entry.name);
    return entry.isDirectory() ? files(path) : [path];
  }));
  return nested.flat();
}

const hits = [];
for (const file of await files(root)) {
  if (!textExtensions.has(extname(file))) continue;
  const body = await readFile(file, 'utf8');
  for (const [label, pattern] of forbidden) {
    if (pattern.test(body)) hits.push(`${label}: ${file}`);
  }
}

if (hits.length) {
  console.error(`Build secret scan failed:\n${hits.join('\n')}`);
  process.exit(1);
}
console.log('Build secret scan passed');
