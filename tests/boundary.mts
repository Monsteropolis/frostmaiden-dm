// ============================================================
// BOUNDARY TESTS — the backend's seam test, enforced in CI.
// Row-level security in supabase/migrations/* is the ONLY thing
// standing between a logged-in player and other people's data.
// This test logs in as players and as the DM (locally-minted
// JWTs in the exact claim shape of src/backend/claims.ts) and
// proves, against a real Postgres running the committed
// migrations:
//   1-6: everything a player must NOT be able to do is rejected
//        by the database (not by client politeness);
//   7-10: everything the design promises players DOES work;
//   plus: cross-campaign isolation, and a sentinel corpus — no
//        response anyone receives ever contains a password hash.
// Wired into CI ahead of deploy: loosening a rule fails the build.
//
// Runs against a local Supabase stack (`npx supabase start`);
// CI does this automatically. Not part of `npm run build` because
// it needs Docker.
// ============================================================
import { createHmac, randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

const URL = process.env.SUPABASE_TEST_URL ?? 'http://127.0.0.1:54321';
// Well-known local-dev demo credentials (public by definition; the local
// stack is throwaway). CI overrides from `supabase status` to be safe.
const ANON = process.env.SUPABASE_TEST_ANON_KEY ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';
const SECRET = process.env.SUPABASE_TEST_JWT_SECRET ??
  'super-secret-jwt-token-with-at-least-32-characters-long';

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

function clientFor(token: string) {
  return createClient(URL, ANON, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

// Every API response body anyone ever receives lands in this corpus; at the
// end we assert no password hash sentinel appears anywhere in it.
const corpus: unknown[] = [];
function seen<T>(r: T): T { corpus.push(r); return r; }

// ---- reachability preflight -----------------------------------------------
try {
  await fetch(`${URL}/auth/v1/health`, { headers: { apikey: ANON } });
} catch {
  console.error(`✗ Cannot reach Supabase at ${URL}.`);
  console.error('  Local run needs Docker + `npx supabase start`; CI does this automatically.');
  process.exit(1);
}

// ---- fixtures: two campaigns, two players, a DM, a stranger ---------------
const CAMP_A = randomUUID();
const CAMP_B = randomUUID();
const dmA = clientFor(mint({ campaign_id: CAMP_A, character_id: null, is_dm: true }));
const alice = clientFor(mint({ campaign_id: CAMP_A, character_id: 'pc1', is_dm: false }));
const bob = clientFor(mint({ campaign_id: CAMP_A, character_id: 'pc2', is_dm: false }));
const dmB = clientFor(mint({ campaign_id: CAMP_B, character_id: null, is_dm: true }));
const mallory = clientFor(mint({ campaign_id: CAMP_B, character_id: 'pc1', is_dm: false }));

{ // DM provisions campaign + character auth stubs (DM-only writes).
  const a = seen(await dmA.from('campaigns').insert({ id: CAMP_A, name: 'Camp A', dm_token_hash: 'x' }));
  const b = seen(await dmB.from('campaigns').insert({ id: CAMP_B, name: 'Camp B', dm_token_hash: 'x' }));
  const c = seen(await dmA.from('characters').insert([
    { id: 'pc1', campaign_id: CAMP_A, name: 'Alice', password_hash: 'BOUNDARY_HASH_ALICE' },
    { id: 'pc2', campaign_id: CAMP_A, name: 'Bob', password_hash: 'BOUNDARY_HASH_BOB' },
  ]));
  check('setup — DM creates campaigns and character stubs', !a.error && !b.error && !c.error,
    [a.error?.message, b.error?.message, c.error?.message].filter(Boolean).join('; '));
}

// Bob writes one private entry and one shared entry (used throughout).
const bobPriv = seen(await bob.from('journal_entries')
  .insert({ campaign_id: CAMP_A, author_id: 'pc2', title: 'Bob private', body: 'BOB_PRIVATE_BODY' })
  .select('id').single());
const bobShared = seen(await bob.from('journal_entries')
  .insert({ campaign_id: CAMP_A, author_id: 'pc2', title: 'Bob shared', body: 'BOB_SHARED_BODY', is_shared: true })
  .select('id').single());
check('setup — Bob writes a private and a shared entry', !bobPriv.error && !bobShared.error,
  [bobPriv.error?.message, bobShared.error?.message].filter(Boolean).join('; '));
const bobPrivId = bobPriv.data?.id as string;
const bobSharedId = bobShared.data?.id as string;

console.log('\n-- Denials: what a player must NOT be able to do --');

{ // 1. touch another character's journal entry
  const ins = seen(await alice.from('journal_entries')
    .insert({ campaign_id: CAMP_A, author_id: 'pc2', title: 'forged', body: 'x' }));
  check('1a. insert an entry authored by someone else → denied', ins.error !== null);
  const upd = seen(await alice.from('journal_entries')
    .update({ body: 'DEFACED' }).eq('id', bobPrivId).select('id'));
  check('1b. update another player\'s entry → denied (0 rows)', !upd.error && upd.data?.length === 0);
  const del = seen(await alice.from('journal_entries')
    .delete().eq('id', bobPrivId).select('id'));
  check('1c. delete another player\'s entry → denied (0 rows)', !del.error && del.data?.length === 0);
  const still = seen(await bob.from('journal_entries').select('body').eq('id', bobPrivId).single());
  check('1d. …and Bob\'s entry is provably untouched', still.data?.body === 'BOB_PRIVATE_BODY');
}

{ // 2. read another player's private entry
  const direct = seen(await alice.from('journal_entries').select('*').eq('id', bobPrivId));
  const broad = seen(await alice.from('journal_entries').select('id, title, body'));
  const leaked = (broad.data ?? []).some((r) => r.id === bobPrivId);
  check('2. read another player\'s private entry → returns nothing',
    !direct.error && direct.data?.length === 0 && !leaked);
}

{ // 3. write to characters
  const ins = seen(await alice.from('characters')
    .insert({ id: 'pc9', campaign_id: CAMP_A, name: 'Forged' }));
  check('3a. player inserts a character → denied', ins.error !== null);
  const upd = seen(await alice.from('characters')
    .update({ name: 'Renamed' }).eq('campaign_id', CAMP_A).eq('id', 'pc1').select('id'));
  check('3b. player updates a character (even their own) → denied (0 rows)',
    !upd.error && upd.data?.length === 0);
}

{ // 4. write to campaigns
  const upd = seen(await alice.from('campaigns')
    .update({ name: 'Hijacked' }).eq('id', CAMP_A).select('id'));
  check('4a. player updates the campaign → denied (0 rows)', !upd.error && upd.data?.length === 0);
  const ins = seen(await alice.from('campaigns').insert({ id: randomUUID(), name: 'Rogue' }));
  check('4b. player creates a campaign → denied', ins.error !== null);
}

{ // 5. password_hash is unreadable — for everyone, via any spelling
  const direct = seen(await alice.from('characters').select('password_hash'));
  check('5a. select password_hash → denied', direct.error !== null);
  const star = seen(await alice.from('characters').select('*'));
  check('5b. select * from characters (expands to the hash column) → denied', star.error !== null);
  const dm = seen(await dmA.from('characters').select('password_hash'));
  check('5c. even the DM token cannot read password_hash', dm.error !== null);
}

{ // 6. Canonical state simply does not exist here
  const canonical = ['party', 'quests', 'weather', 'sessions', 'npcs', 'monsters',
    'combat', 'travel', 'inventory', 'arcs', 'hp'];
  const found: string[] = [];
  for (const t of canonical) {
    const r = seen(await alice.from(t).select('*').limit(1));
    if (!(r.error && r.error.code === 'PGRST205')) found.push(t);
  }
  check('6. no HP/quest/weather/session table exists in this backend at all',
    found.length === 0, found.length ? `unexpectedly reachable: ${found.join(', ')}` : '');
}

console.log('\n-- Allowed: what the design promises players --');

{ // 7. placements are communal within the campaign
  const ins = seen(await alice.from('placements')
    .insert({ campaign_id: CAMP_A, owner_id: 'pc1', scene_id: 'camp', item_ref: 'lantern', x: 10, y: 20 })
    .select('id').single());
  check('7a. player places a decoration → allowed', !ins.error && !!ins.data?.id, ins.error?.message);
  const pid = ins.data?.id as string;
  const move = seen(await bob.from('placements')
    .update({ x: 55, y: 5 }).eq('id', pid).select('x'));
  check('7b. a DIFFERENT player moves it → allowed (communal camp)',
    !move.error && move.data?.length === 1 && move.data[0].x === 55, move.error?.message);
  const del = seen(await bob.from('placements').delete().eq('id', pid).select('id'));
  check('7c. a different player removes it → allowed (communal camp)',
    !del.error && del.data?.length === 1, del.error?.message);
}

{ // 8. own journal
  const ins = seen(await alice.from('journal_entries')
    .insert({ campaign_id: CAMP_A, author_id: 'pc1', title: 'Day 3', body: 'We reached Bremen.' })
    .select('id').single());
  check('8a. player writes their own journal entry → allowed', !ins.error, ins.error?.message);
  const upd = seen(await alice.from('journal_entries')
    .update({ body: 'We reached Bremen at dusk.' }).eq('id', ins.data?.id as string).select('id'));
  check('8b. player edits their own entry → allowed', !upd.error && upd.data?.length === 1);
}

{ // 9. shared entries are readable campaign-wide
  const r = seen(await alice.from('journal_entries').select('id, title').eq('id', bobSharedId));
  check('9. player reads another player\'s SHARED entry → allowed',
    !r.error && r.data?.length === 1 && r.data[0].title === 'Bob shared');
}

{ // 10. the DM reads everything (Ben's decision)
  const r = seen(await dmA.from('journal_entries').select('id, body').eq('id', bobPrivId));
  check('10. DM reads a player\'s PRIVATE entry → allowed',
    !r.error && r.data?.length === 1 && r.data[0].body === 'BOB_PRIVATE_BODY');
}

console.log('\n-- Wave 10: character_spells — a player owns their own tags --');

// Bob tags a spell known (his own row) — the fixture the isolation checks read.
const bobSpell = seen(await bob.from('character_spells')
  .insert({ campaign_id: CAMP_A, character_id: 'pc2', spell_index: 'fire-bolt', known: true })
  .select('id').single());
check('setup — Bob tags a spell known', !bobSpell.error, bobSpell.error?.message);

{ // B3.1 — a player writes their OWN spell tag → allowed
  const ins = seen(await alice.from('character_spells')
    .insert({ campaign_id: CAMP_A, character_id: 'pc1', spell_index: 'mage-hand', known: true })
    .select('id').single());
  check('B3.1 player tags their own spell → allowed', !ins.error && !!ins.data?.id, ins.error?.message);
}
{ // B3.2 — a player writes ANOTHER character's spell row → denied
  const ins = seen(await alice.from('character_spells')
    .insert({ campaign_id: CAMP_A, character_id: 'pc2', spell_index: 'forged', known: true }));
  check('B3.2 player tags a spell for someone else → denied', ins.error !== null);
  const broad = seen(await alice.from('character_spells').select('character_id, spell_index'));
  const leaked = (broad.data ?? []).some((r) => r.character_id === 'pc2');
  check('B3.2 …and cannot read another character\'s spell tags', !broad.error && !leaked);
}
{ // B3.3 — the DM reads every character's spell tags → allowed
  const r = seen(await dmA.from('character_spells').select('character_id, spell_index').eq('character_id', 'pc2'));
  check('B3.3 DM reads a player\'s spell tags → allowed',
    !r.error && r.data?.length === 1 && r.data[0].spell_index === 'fire-bolt');
}

console.log('\n-- Wave 10: item_locations — a player arranges their own gear --');

const bobLoc = seen(await bob.from('item_locations')
  .insert({ campaign_id: CAMP_A, character_id: 'pc2', item_id: 'it_bob', location: 'home' })
  .select('id').single());
check('setup — Bob stows an item at home base', !bobLoc.error, bobLoc.error?.message);

{ // C1.1 — a player writes their OWN item location → allowed
  const ins = seen(await alice.from('item_locations')
    .insert({ campaign_id: CAMP_A, character_id: 'pc1', item_id: 'it_alice', location: 'home' })
    .select('id').single());
  check('C1.1 player moves their own item to home → allowed', !ins.error && !!ins.data?.id, ins.error?.message);
}
{ // C1.2 — a player writes ANOTHER character's item location → denied
  const ins = seen(await alice.from('item_locations')
    .insert({ campaign_id: CAMP_A, character_id: 'pc2', item_id: 'it_forged', location: 'home' }));
  check('C1.2 player moves someone else\'s item → denied', ins.error !== null);
  const broad = seen(await alice.from('item_locations').select('character_id, item_id'));
  const leaked = (broad.data ?? []).some((r) => r.character_id === 'pc2');
  check('C1.2 …and cannot read another character\'s item locations', !broad.error && !leaked);
}
{ // C1.3 — the DM reads every character's item locations → allowed
  const r = seen(await dmA.from('item_locations').select('character_id, location').eq('character_id', 'pc2'));
  check('C1.3 DM reads a player\'s item locations → allowed',
    !r.error && r.data?.length === 1 && r.data[0].location === 'home');
}

console.log('\n-- Standing guarantees beyond the ten --');

{ // join picker works; cross-campaign isolation holds
  const names = seen(await alice.from('characters').select('id, name'));
  check('players read character id/name (join picker) → allowed',
    !names.error && names.data?.length === 2 &&
    names.data.every((r) => !('password_hash' in r)));
  const peek = seen(await mallory.from('journal_entries').select('id'));
  const peekP = seen(await mallory.from('placements').select('id'));
  check('a member of ANOTHER campaign sees none of it',
    !peek.error && peek.data?.length === 0 && !peekP.error && peekP.data?.length === 0);
  const plant = seen(await mallory.from('placements')
    .insert({ campaign_id: CAMP_A, owner_id: 'pc1', scene_id: 'camp', item_ref: 'x', x: 0, y: 0 }));
  check('…and cannot write into it either', plant.error !== null);
}

{ // the sentinel corpus: no hash ever crossed the wire in any response
  const blob = JSON.stringify(corpus);
  check('sentinel corpus — no password hash in ANY response received',
    !blob.includes('BOUNDARY_HASH'));
}

// ---- result ---------------------------------------------------------------
console.log(`\nBoundary tests: ${pass} passed, ${fail} failed.`);
if (fail > 0) {
  console.error('🚨 BOUNDARY BREACH — refusing to ship. A player could see or touch data that is not theirs.');
  process.exit(1);
}
process.exit(0);
