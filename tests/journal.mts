// ============================================================
// JOURNAL TESTS — Brief 3's promise, proven through the UI's OWN
// data helpers. boundary.mts already proves the RLS rules with
// raw queries; this file drives the exact functions the Realm
// page and DM app call (src/backend/realm-client.ts), so a
// client-side mistake that routes around the boundary — a stray
// privileged key, a forgotten filter — fails CI too.
//
//   - a player writes/edits only their own entries;
//   - a player reads their own (all) + others' SHARED only;
//   - the promote toggle: share → visible to the party, unshare →
//     gone again (one row, one flag — never a second copy);
//   - the DM reads everything, private included;
//   - no response a non-DM receives ever contains another
//     player's private entry (sentinel corpus);
//   - and no client source file carries a privileged key at all.
//
// Runs against a local Supabase stack (`npx supabase start`);
// CI does this automatically, exactly like boundary.mts.
// ============================================================
import { createHmac, randomUUID } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { createClient } from '@supabase/supabase-js';

// The client module reads these AT IMPORT — set them first, import after,
// so the very same code the browser ships talks to the throwaway stack.
process.env.SUPABASE_TEST_URL ??= 'http://127.0.0.1:54321';
process.env.SUPABASE_TEST_ANON_KEY ??=
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';
const URL = process.env.SUPABASE_TEST_URL;
const ANON = process.env.SUPABASE_TEST_ANON_KEY;
const SECRET = process.env.SUPABASE_TEST_JWT_SECRET ??
  'super-secret-jwt-token-with-at-least-32-characters-long';

const {
  listMyJournal, listSharedJournal, writeJournalEntry, updateJournalEntry,
  setShared, listAllJournal, fetchCharacterNames,
} = await import('../src/backend/realm-client');

let pass = 0, fail = 0;
function check(label: string, ok: boolean, extra = '') {
  ok ? pass++ : fail++;
  console.log(`${ok ? '  ✓' : '  ✗ FAIL'} ${label}${extra ? ' — ' + extra : ''}`);
}

// ---- token minting: same claim shape as src/backend/claims.ts -------------
function mint(claims: { campaign_id: string; character_id: string | null; is_dm: boolean }): string {
  const now = Math.floor(Date.now() / 1000);
  const enc = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const head = enc({ alg: 'HS256', typ: 'JWT' });
  const body = enc({
    sub: claims.character_id ?? 'dm',
    role: 'authenticated',
    iat: now, exp: now + 3600,
    ...claims,
  });
  const sig = createHmac('sha256', SECRET).update(`${head}.${body}`).digest('base64url');
  return `${head}.${body}.${sig}`;
}

// ---- reachability preflight -----------------------------------------------
try {
  await fetch(`${URL}/auth/v1/health`, { headers: { apikey: ANON } });
} catch {
  console.error(`✗ Cannot reach Supabase at ${URL}.`);
  console.error('  Local run needs Docker + `npx supabase start`; CI does this automatically.');
  process.exit(1);
}

// ---- fixtures: campaign A (Alice, Bob + a DM), campaign B (Mallory) -------
const CAMP_A = randomUUID();
const CAMP_B = randomUUID();
const dmToken = mint({ campaign_id: CAMP_A, character_id: null, is_dm: true });
const aliceToken = mint({ campaign_id: CAMP_A, character_id: 'pc1', is_dm: false });
const bobToken = mint({ campaign_id: CAMP_A, character_id: 'pc2', is_dm: false });
const malloryToken = mint({ campaign_id: CAMP_B, character_id: 'pc1', is_dm: false });

{ // provisioning is the DM's job (raw inserts, as boundary.mts proved they work)
  const dmA = createClient(URL, ANON, { global: { headers: { Authorization: `Bearer ${dmToken}` } }, auth: { persistSession: false, autoRefreshToken: false } });
  const dmB = createClient(URL, ANON, { global: { headers: { Authorization: `Bearer ${mint({ campaign_id: CAMP_B, character_id: null, is_dm: true })}` } }, auth: { persistSession: false, autoRefreshToken: false } });
  const a = await dmA.from('campaigns').insert({ id: CAMP_A, name: 'Camp A', dm_token_hash: 'x' });
  const b = await dmB.from('campaigns').insert({ id: CAMP_B, name: 'Camp B', dm_token_hash: 'x' });
  const c = await dmA.from('characters').insert([
    { id: 'pc1', campaign_id: CAMP_A, name: 'Alice' },
    { id: 'pc2', campaign_id: CAMP_A, name: 'Bob' },
  ]);
  check('setup — campaigns and character stubs in place', !a.error && !b.error && !c.error,
    [a.error?.message, b.error?.message, c.error?.message].filter(Boolean).join('; '));
}

// Everything Bob or Mallory ever receives (returns AND error messages) lands
// here; at the end it must not contain Alice's never-shared sentinel body.
const foreignCorpus: unknown[] = [];
const sawB = <T,>(r: T): T => { foreignCorpus.push(r); return r; };
const ALICE_PRIVATE = 'JRNL_ALICE_PRIVATE_SENTINEL';

console.log('\n-- Writing: only your own hand --');

const alicePriv = await writeJournalEntry(aliceToken, { title: 'Dear diary', body: ALICE_PRIVATE });
check('alice writes a private entry (default) → saved private',
  alicePriv.authorId === 'pc1' && !alicePriv.isShared);
const alicePromo = await writeJournalEntry(aliceToken, { title: 'Day 3', body: 'JRNL_ALICE_PROMOTED' });
const aliceShared = await writeJournalEntry(aliceToken, { title: 'For the party', body: 'JRNL_ALICE_SHARED', isShared: true });
check('alice writes a shared entry → saved shared', aliceShared.isShared);
const bobPriv = await writeJournalEntry(bobToken, { title: 'Bob thoughts', body: 'JRNL_BOB_PRIVATE' });
check('bob writes his own private entry', bobPriv.authorId === 'pc2' && !bobPriv.isShared);

{ // bob tries to touch alice's entries through the same helpers the UI uses
  let editMsg = '', shareMsg = '';
  try { sawB(await updateJournalEntry(bobToken, alicePriv.id, { body: 'DEFACED' })); }
  catch (e) { editMsg = sawB(e instanceof Error ? e.message : String(e)); }
  check('bob edits alice\'s entry → refused', editMsg.includes('author'), editMsg);
  try { sawB(await setShared(bobToken, alicePriv.id, true)); }
  catch (e) { shareMsg = sawB(e instanceof Error ? e.message : String(e)); }
  check('bob force-SHARES alice\'s private entry → refused', shareMsg.includes('author'), shareMsg);
  const still = (await listMyJournal(aliceToken)).find((e) => e.id === alicePriv.id);
  check('…and alice\'s entry is provably untouched and still private',
    still?.body === ALICE_PRIVATE && still?.isShared === false);
}

{ // alice edits her own — allowed, and the words actually change
  const edited = await updateJournalEntry(aliceToken, alicePromo.id, { body: 'JRNL_ALICE_PROMOTED, at dusk' });
  check('alice edits her own entry → allowed', edited.body === 'JRNL_ALICE_PROMOTED, at dusk');
}

console.log('\n-- Reading: mine = everything of mine; shared = exactly the shared --');

{
  const mine = await listMyJournal(aliceToken);
  check('alice\'s MINE tab: all three of hers, private and shared both',
    mine.length === 3 && mine.every((e) => e.authorId === 'pc1') &&
    mine.some((e) => e.isShared) && mine.some((e) => !e.isShared));
  const bobShared = sawB(await listSharedJournal(bobToken));
  check('bob\'s SHARED tab: alice\'s shared entry is there, with author id',
    bobShared.some((e) => e.id === aliceShared.id && e.authorId === 'pc1'));
  check('…and no private entry of anyone\'s — not even bob\'s own',
    bobShared.every((e) => e.isShared) && !bobShared.some((e) => e.id === alicePriv.id || e.id === bobPriv.id));
  const names = sawB(await fetchCharacterNames(bobToken));
  check('character names resolve for labelling', names.pc1 === 'Alice' && names.pc2 === 'Bob');
}

console.log('\n-- The promote toggle: one flag, no copies --');

{
  await setShared(aliceToken, alicePromo.id, true);
  const bobSees = sawB(await listSharedJournal(bobToken));
  check('alice shares → the SAME entry appears on bob\'s Shared tab',
    bobSees.some((e) => e.id === alicePromo.id));
  check('…as a flag flip, not a duplicate row',
    bobSees.filter((e) => e.authorId === 'pc1').length === 2);
  await setShared(aliceToken, alicePromo.id, false);
  const gone = sawB(await listSharedJournal(bobToken));
  check('alice unshares → it\'s gone from the party again',
    !gone.some((e) => e.id === alicePromo.id));
}

console.log('\n-- The DM reads everything; players never widen their view --');

{
  const all = await listAllJournal(dmToken);
  check('DM sees every entry in the campaign, private included',
    all.length === 4 && all.some((e) => e.id === alicePriv.id) && all.some((e) => e.id === bobPriv.id));
  const bobAll = sawB(await listAllJournal(bobToken));
  check('the DM helper under a PLAYER token narrows to their own + shared',
    !bobAll.some((e) => e.id === alicePriv.id));
  const mallory = sawB(await listSharedJournal(malloryToken));
  check('another campaign\'s player sees nothing of it', mallory.length === 0);
}

{ // the sentinel corpus: Alice's never-shared words never reached Bob or Mallory
  const blob = JSON.stringify(foreignCorpus);
  check('sentinel corpus — no foreign response ever contained a private entry',
    !blob.includes(ALICE_PRIVATE));
}

console.log('\n-- No privileged key anywhere in the client --');

{ // journal writes ride the per-session token, never a privileged one — and
  // a privileged key can't even exist in the shipped source to be misused.
  const offenders: string[] = [];
  for (const f of readdirSync('src', { recursive: true }) as string[]) {
    if (!/\.(ts|tsx|css)$/.test(f)) continue;
    const text = readFileSync(join('src', f), 'utf8');
    if (/sb_secret_/i.test(text)) offenders.push(`${f}: secret API key`);
    for (const line of text.split('\n')) {
      if (!line.includes('service_role')) continue;
      const t = line.trim();
      if (!t.startsWith('//') && !t.startsWith('*') && !t.startsWith('/*')) {
        offenders.push(`${f}: service_role outside a comment`);
      }
    }
  }
  check('no service_role / secret key in any src/ file', offenders.length === 0, offenders.join('; '));
}

// ---- result ---------------------------------------------------------------
console.log(`\nJournal tests: ${pass} passed, ${fail} failed.`);
if (fail > 0) {
  console.error('🚨 JOURNAL BOUNDARY FAILURE — refusing to ship. The UI could show someone words that are not theirs to read.');
  process.exit(1);
}
process.exit(0);
