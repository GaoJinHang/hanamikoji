import { execSync } from 'node:child_process';
import { existsSync, rmSync, cpSync, readdirSync, statSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pkgDir = path.resolve(__dirname, '..');
const distDir = path.join(pkgDir, 'dist');
const distCjsDir = path.join(pkgDir, 'dist-cjs');
const buildInfoFiles = [
  path.join(pkgDir, 'tsconfig.build.tsbuildinfo'),
  path.join(pkgDir, 'tsconfig.build.cjs.tsbuildinfo'),
];

for (const file of buildInfoFiles) {
  if (existsSync(file)) rmSync(file, { force: true });
}

for (const dir of [distDir, distCjsDir]) {
  if (existsSync(dir)) rmSync(dir, { recursive: true, force: true });
}

execSync('tsc -p tsconfig.build.json', { cwd: pkgDir, stdio: 'inherit' });
execSync('tsc -p tsconfig.build.cjs.json', { cwd: pkgDir, stdio: 'inherit' });

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) out.push(...walk(full));
    else out.push(full);
  }
  return out;
}

function rewriteEsm(code) {
  const withImports = code
    .replace(/(from\s+['"])(\.{1,2}\/[^'"]+)(['"])/g, (m, a, s, b) => /\.[cm]?js$/.test(s) ? m : `${a}${s}.js${b}`)
    .replace(/(import\s+['"])(\.{1,2}\/[^'"]+)(['"])/g, (m, a, s, b) => /\.[cm]?js$/.test(s) ? m : `${a}${s}.js${b}`);
  return withImports;
}

function rewriteCjs(code) {
  return code
    .replace(/(require\(['"])(\.{1,2}\/[^'"]+)(['"]\))/g, (m, a, s, b) => /\.[cm]?js$/.test(s) ? m : `${a}${s}.cjs${b}`)
    .replace(/sourceMappingURL=(.+?)\.js\.map/g, 'sourceMappingURL=$1.cjs.map');
}

for (const file of walk(distDir)) {
  if (!file.endsWith('.js')) continue;
  const raw = readFileSync(file, 'utf8');
  writeFileSync(file, rewriteEsm(raw));
}

for (const file of walk(distCjsDir)) {
  const rel = path.relative(distCjsDir, file);
  let targetRel = rel;
  if (rel.endsWith('.js')) targetRel = rel.slice(0, -3) + '.cjs';
  else if (rel.endsWith('.js.map')) targetRel = rel.slice(0, -7) + '.cjs.map';
  else continue;
  const target = path.join(distDir, targetRel);
  mkdirSync(path.dirname(target), { recursive: true });
  if (file.endsWith('.js')) {
    const raw = rewriteCjs(readFileSync(file, 'utf8'));
    writeFileSync(target, raw);
  } else {
    const raw = readFileSync(file, 'utf8').replace(/\.js/g, '.cjs');
    writeFileSync(target, raw);
  }
}

rmSync(distCjsDir, { recursive: true, force: true });
console.log('Dual build complete:', pkgDir);
