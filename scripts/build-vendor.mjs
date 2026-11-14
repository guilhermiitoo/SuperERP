// Gera public/vendor a partir do npm: SDK do Firebase (ESM, sem CDN) e fontes.
// O resultado é versionado no repositório para que publicar não exija build.
// Rode `npm run vendor` depois de atualizar a dependência "firebase".
import { build } from 'esbuild';
import { cpSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const out = new URL('../public/vendor/', import.meta.url).pathname;
rmSync(out, { recursive: true, force: true });
mkdirSync(`${out}firebase`, { recursive: true });
mkdirSync(`${out}fonts`, { recursive: true });

const entries = {
  'firebase-app': 'firebase/app',
  'firebase-firestore-lite': 'firebase/firestore/lite',
  'firebase-auth': 'firebase/auth',
  'firebase-app-check': 'firebase/app-check',
};
const stubs = `${out}firebase/.entries/`;
mkdirSync(stubs, { recursive: true });
for (const [name, spec] of Object.entries(entries)) writeFileSync(`${stubs}${name}.js`, `export * from '${spec}';\n`);

await build({
  entryPoints: Object.keys(entries).map((n) => `${stubs}${n}.js`),
  outdir: `${out}firebase`,
  bundle: true, splitting: true, format: 'esm', platform: 'browser', target: 'es2020',
  minify: true, legalComments: 'none', chunkNames: 'chunk-[hash]',
  absWorkingDir: new URL('..', import.meta.url).pathname,
});
rmSync(stubs, { recursive: true, force: true });

const fonts = {
  'sofia-sans': ['sofia-sans-latin-wght-normal.woff2', 'sofia-sans-latin-ext-wght-normal.woff2'],
  'sofia-sans-condensed': ['sofia-sans-condensed-latin-wght-normal.woff2'],
};
for (const [pkg, files] of Object.entries(fonts)) {
  const dir = require.resolve(`@fontsource-variable/${pkg}/package.json`).replace('package.json', 'files/');
  for (const f of files) cpSync(dir + f, `${out}fonts/${f}`);
}
const version = require('firebase/package.json').version;
writeFileSync(`${out}VERSOES.txt`, `firebase ${version}\nSofia Sans / Sofia Sans Condensed (SIL Open Font License 1.1), via @fontsource-variable\n`);
console.log(`vendor gerado (firebase ${version})`);
