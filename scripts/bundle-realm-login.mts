// ============================================================
// DASHBOARD BUNDLE — realm-login as ONE file.
//
// The Edge Function is deployed through the Supabase dashboard's
// in-browser editor (Ben has no terminal), and that editor takes
// a single file — but the real function is five: index.ts plus
// the _shared/ modules the client and tests import too. This
// script inlines them, in dependency order, into
// supabase/dashboard/realm-login.ts for copy-paste deploys.
//
//   npx vite-node scripts/bundle-realm-login.mts          # regenerate
//   npx vite-node scripts/bundle-realm-login.mts --check  # CI freshness gate
//
// The check mode fails the build when someone edits a _shared
// module and forgets to regenerate — the pasted function must
// never drift from the code the tests prove.
// ============================================================
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const FN = join(root, 'supabase', 'functions');
const OUT = join(root, 'supabase', 'dashboard', 'realm-login.ts');

// Dependency order: leaves first, the HTTP skin last.
const SOURCES = [
  '_shared/realm-code.ts',
  '_shared/password.ts',
  '_shared/jwt.ts',
  '_shared/realm-auth.ts',
  'realm-login/index.ts',
];

const externals = new Set<string>();
const sections: string[] = [];
for (const rel of SOURCES) {
  const raw = readFileSync(join(FN, rel), 'utf8');
  const kept = raw.split('\n').filter((line) => {
    const m = line.match(/^import\s.*from\s+'([^']+)';\s*$/);
    if (!m) return true;
    if (m[1].startsWith('.')) return false;   // inlined — drop the import
    externals.add(line.trim());               // npm:/jsr: import — hoist to top
    return false;
  });
  const body = kept.join('\n').trim();
  if (/from\s+'\./.test(body)) {
    console.error(`✗ ${rel}: a relative import survived stripping (multi-line import?).`);
    console.error('  Keep imports in supabase/functions/* on one line, or teach this script better.');
    process.exit(1);
  }
  sections.push(`// ════ inlined from supabase/functions/${rel} ════\n\n${body}`);
}

const banner = `// ╔══════════════════════════════════════════════════════════╗
// ║  GENERATED FILE — do not edit here.                        ║
// ║                                                            ║
// ║  This is supabase/functions/realm-login (index.ts plus its ║
// ║  _shared modules) flattened into one file so it can be     ║
// ║  pasted into the Supabase dashboard's Edge Function editor ║
// ║  and deployed without a terminal. See REALM_SETUP.md at    ║
// ║  the repo root for the click-by-click deploy steps.        ║
// ║                                                            ║
// ║  Edit the real sources, then regenerate:                   ║
// ║    npx vite-node scripts/bundle-realm-login.mts            ║
// ║  CI fails if this file is stale (--check).                 ║
// ╚══════════════════════════════════════════════════════════╝`;

const bundle = [banner, [...externals].sort().join('\n'), sections.join('\n\n')].join('\n\n') + '\n';

if (process.argv.includes('--check')) {
  let current = '';
  try { current = readFileSync(OUT, 'utf8'); } catch { /* missing counts as stale */ }
  if (current !== bundle) {
    console.error('✗ supabase/dashboard/realm-login.ts is stale.');
    console.error('  Regenerate with: npx vite-node scripts/bundle-realm-login.mts — and commit the result.');
    process.exit(1);
  }
  console.log('✓ dashboard bundle matches the sources');
} else {
  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, bundle);
  console.log(`Wrote ${OUT.replace(root, '.')}`);
}
