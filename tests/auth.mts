// ============================================================
// AUTH TESTS — Brief 2's counterpart to tests/boundary.mts.
// Runs the REAL token-minting logic (supabase/functions/_shared/
// realm-auth.ts — the same file the deployed Edge Function wraps)
// against a real local Postgres, and proves:
//   A. the claim shape — a minted token carries exactly the
//      contract in src/backend/claims.ts (campaign_id /
//      character_id / is_dm), the thing every RLS rule keys off;
//   B. auth behavior — right password in, wrong password out,
//      ungated characters skip the password, unknown Realm codes
//      and strangers' campaigns are rejected with generic errors;
//   C. integration — a token minted by the real flow (not a
//      hand-forged test token) actually satisfies the Brief-1
//      boundary: writes its own journal/placements, cannot touch
//      anyone else's, cannot read a password hash.
// Wired into CI beside the boundary test; needs Docker +
// `npx supabase start` locally, like boundary.mts.
// ============================================================
import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { deriveRealmCode, normalizeRealmCode } from '../supabase/functions/_shared/realm-code.ts';
import { hashPassword, verifyPassword } from '../supabase/functions/_shared/password.ts';
import { REALM_TOKEN_TTL_SECONDS } from '../supabase/functions/_shared/jwt.ts';
import { handleRealmRequest } from '../supabase/functions/_shared/realm-auth.ts';

const URL = process.env.SUPABASE_TEST_URL ?? 'http://127.0.0.1:54321';
// Well-known local-dev demo credentials (public by definition; the local
// stack is throwaway). CI overrides from `supabase status`. The "service"
// key below unlocks nothing but the Docker container on this machine —
// the HOSTED project's secret key appears nowhere in this repo.
const ANON = process.env.SUPABASE_TEST_ANON_KEY ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';
const SERVICE = process.env.SUPABASE_TEST_SERVICE_KEY ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';
const SECRET = process.env.SUPABASE_TEST_JWT_SECRET ??
  'super-secret-jwt-token-with-at-least-32-characters-long';

let pass = 0, fail = 0;
function check(label: string, ok: boolean, extra = '') {
  ok ? pass++ : fail++;
  console.log(`${ok ? '  ✓' : '  ✗ FAIL'} ${label}${extra ? ' — ' + extra : ''}`);
}

// Every response body any client receives lands here; at the end we assert
// no password, hash, or DM secret ever crossed the wire.
const corpus: unknown[] = [];
function seen<T>(r: T): T { corpus.push(r); return r; }

function clientFor(token: string) {
  return createClient(URL, ANON, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function claimsOf(token: string): Record<string, unknown> {
  return JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString());
}

console.log('\n-- Pure pieces: code derivation & password hashing (no DB needed) --');

{
  const id = randomUUID();
  const code = deriveRealmCode(id);
  check('realm code is 6 chars of the unambiguous alphabet',
    /^[A-HJ-NP-Z2-9]{6}$/.test(code), code);
  check('realm code is stable (same id → same code)', deriveRealmCode(id) === code);
  check('realm code differs across campaigns', deriveRealmCode(randomUUID()) !== code);
  check('normalize survives what people type',
    normalizeRealmCode(` ${code.toLowerCase()} `) === code
    && normalizeRealmCode('ab-cd ef') === 'ABCDEF');
  const h = await hashPassword('WinterRose');
  check('password hash format + verify round-trip',
    h.startsWith('pbkdf2$') && await verifyPassword('WinterRose', h));
  check('wrong password fails verify', !(await verifyPassword('winterrose', h)));
  check('blank/malformed stored hashes never verify',
    !(await verifyPassword('anything', '')) && !(await verifyPassword('anything', 'garbage')));
}

// ---- reachability preflight (everything below needs the local stack) ------
try {
  await fetch(`${URL}/auth/v1/health`, { headers: { apikey: ANON } });
} catch {
  console.error(`\n✗ Cannot reach Supabase at ${URL}.`);
  console.error('  Local run needs Docker + `npx supabase start`; CI does this automatically.');
  process.exit(1);
}

// The service client — stands in for the Edge Function's runtime, which is
// the only place such a client legitimately exists.
const db = createClient(URL, SERVICE, { auth: { persistSession: false, autoRefreshToken: false } });

// ---- fixtures via the REAL provisioning path ------------------------------
console.log('\n-- DM provisioning (dm-login): first call claims, wrong secret bounces --');

const CAMPAIGN = randomUUID();
const DM_SECRET = 'dmsecret-0123456789abcdef';
const REALM = deriveRealmCode(CAMPAIGN);

const dmRes = seen(await handleRealmRequest(
  { action: 'dm-login', campaignId: CAMPAIGN, dmSecret: DM_SECRET, campaignName: 'Auth Test Camp' },
  db, SECRET));
check('dm-login provisions the campaign and mints a token',
  dmRes.status === 200 && typeof dmRes.body.token === 'string',
  String(dmRes.body.error ?? ''));
check('dm-login returns the derived realm code', dmRes.body.realmCode === REALM);

{
  const again = seen(await handleRealmRequest(
    { action: 'dm-login', campaignId: CAMPAIGN, dmSecret: DM_SECRET }, db, SECRET));
  check('same secret logs in again', again.status === 200);
  const wrong = seen(await handleRealmRequest(
    { action: 'dm-login', campaignId: CAMPAIGN, dmSecret: 'not-the-secret-at-all' }, db, SECRET));
  check('wrong DM secret is rejected', wrong.status === 401);
}

const dmToken = String(dmRes.body.token);
{
  const c = claimsOf(dmToken);
  check('DM token claim shape: campaign_id/character_id:null/is_dm:true, role authenticated',
    c.campaign_id === CAMPAIGN && c.character_id === null && c.is_dm === true
    && c.role === 'authenticated' && c.sub === 'dm');
}

// The DM's device pushes the roster + one hashed password (what the app does).
const dm = clientFor(dmToken);
{
  const roster = seen(await dm.from('characters').upsert([
    { id: 'pc1', campaign_id: CAMPAIGN, name: 'Brienne' },
    { id: 'pc2', campaign_id: CAMPAIGN, name: 'Wick' },
  ], { onConflict: 'campaign_id,id' }));
  check('DM token upserts the roster', !roster.error, roster.error?.message);
  const gate = seen(await dm.from('characters').upsert(
    { id: 'pc1', campaign_id: CAMPAIGN, name: 'Brienne', password_hash: await hashPassword('WinterRose') },
    { onConflict: 'campaign_id,id' }));
  check('DM token writes a password hash (write-only column)', !gate.error, gate.error?.message);
  const rosterAgain = seen(await dm.from('characters').upsert([
    { id: 'pc1', campaign_id: CAMPAIGN, name: 'Brienne' },
    { id: 'pc2', campaign_id: CAMPAIGN, name: 'Wick' },
  ], { onConflict: 'campaign_id,id' }));
  check('re-syncing the roster does NOT clear the hash (upsert omits the column)', !rosterAgain.error);
}

console.log('\n-- The login picker (characters) --');

{
  const r = seen(await handleRealmRequest({ action: 'characters', realmCode: REALM }, db, SECRET));
  const chars = (r.body.characters ?? []) as { id: string; name: string; gated: boolean }[];
  check('picker lists the party with 🔒 flags',
    r.status === 200 && chars.length === 2
    && chars.find((c) => c.id === 'pc1')?.gated === true
    && chars.find((c) => c.id === 'pc2')?.gated === false);
  check('picker response carries no hash material',
    !JSON.stringify(r.body).includes('pbkdf2'));
  const bad = seen(await handleRealmRequest({ action: 'characters', realmCode: 'ZZZZZZ' }, db, SECRET));
  check('unknown Realm code → 404, nothing revealed', bad.status === 404);
}

console.log('\n-- Player login: gated, ungated, and every wrong door --');

let playerToken = '';
{
  const good = seen(await handleRealmRequest(
    { action: 'login', realmCode: REALM, characterId: 'pc1', password: 'WinterRose' }, db, SECRET));
  check('gated character + right password → token', good.status === 200
    && typeof good.body.token === 'string', String(good.body.error ?? ''));
  playerToken = String(good.body.token);

  const c = claimsOf(playerToken);
  check('claim shape EXACT: campaign_id + character_id + is_dm:false',
    c.campaign_id === CAMPAIGN && c.character_id === 'pc1' && c.is_dm === false
    && c.role === 'authenticated' && c.sub === 'pc1');
  const iat = Number(c.iat), exp = Number(c.exp);
  check('short expiry — a game night, not a persistent login',
    exp - iat === REALM_TOKEN_TTL_SECONDS && exp * 1000 > Date.now());

  const wrong = seen(await handleRealmRequest(
    { action: 'login', realmCode: REALM, characterId: 'pc1', password: 'winterrose' }, db, SECRET));
  check('wrong password → rejected, generic message', wrong.status === 401
    && !String(wrong.body.error).toLowerCase().includes('exist'));
  const nopw = seen(await handleRealmRequest(
    { action: 'login', realmCode: REALM, characterId: 'pc1', password: '' }, db, SECRET));
  check('gated character + no password → rejected', nopw.status === 401);
  const open = seen(await handleRealmRequest(
    { action: 'login', realmCode: REALM, characterId: 'pc2', password: '' }, db, SECRET));
  check('ungated character + no password → token (blank = open, by design)',
    open.status === 200 && (claimsOf(String(open.body.token)).character_id === 'pc2'));
  const ghost = seen(await handleRealmRequest(
    { action: 'login', realmCode: REALM, characterId: 'pc9', password: 'x' }, db, SECRET));
  check('unknown character → same generic rejection', ghost.status === 401
    && ghost.body.error === wrong.body.error);
  const noRealm = seen(await handleRealmRequest(
    { action: 'login', realmCode: 'ZZZZZZ', characterId: 'pc1', password: 'WinterRose' }, db, SECRET));
  check('unknown Realm code → same generic rejection', noRealm.status === 401
    && noRealm.body.error === wrong.body.error);
}

console.log('\n-- Integration: the MINTED token against the Brief-1 boundary --');

{
  // A second campaign (the stranger) to prove isolation with real tokens too.
  const OTHER = randomUUID();
  const otherDm = seen(await handleRealmRequest(
    { action: 'dm-login', campaignId: OTHER, dmSecret: 'other-secret-0123456789' }, db, SECRET));
  const strangerRes = seen(await handleRealmRequest(
    { action: 'login', realmCode: deriveRealmCode(OTHER), characterId: 'px1', password: '' }, db, SECRET));
  check('setup — stranger campaign provisioned; its unknown character cannot log in',
    otherDm.status === 200 && strangerRes.status === 401);

  const alice = clientFor(playerToken);   // pc1, minted by the real flow

  const mine = seen(await alice.from('journal_entries')
    .insert({ campaign_id: CAMPAIGN, author_id: 'pc1', title: 'Day 1', body: 'MINTED_TOKEN_BODY' })
    .select('id').single());
  check('minted token writes its own journal entry', !mine.error, mine.error?.message);

  const forged = seen(await alice.from('journal_entries')
    .insert({ campaign_id: CAMPAIGN, author_id: 'pc2', title: 'forged', body: 'x' }));
  check('…cannot author as someone else', forged.error !== null);

  const place = seen(await alice.from('placements')
    .insert({ campaign_id: CAMPAIGN, owner_id: 'pc1', scene_id: 'camp', item_ref: 'lantern', x: 5, y: 5 })
    .select('id').single());
  check('minted token places a camp decoration', !place.error, place.error?.message);

  const hash = seen(await alice.from('characters').select('password_hash'));
  check('minted token cannot read password_hash', hash.error !== null);
  const star = seen(await alice.from('characters').select('*'));
  check('…nor via select *', star.error !== null);

  const campHijack = seen(await alice.from('campaigns')
    .update({ name: 'Hijacked' }).eq('id', CAMPAIGN).select('id'));
  check('minted player token cannot write the campaign row',
    !campHijack.error && campHijack.data?.length === 0);

  const crossRead = seen(await alice.from('journal_entries')
    .select('id').eq('campaign_id', OTHER));
  check('minted token sees nothing of another campaign',
    !crossRead.error && crossRead.data?.length === 0);

  const dmRead = seen(await dm.from('journal_entries')
    .select('body').eq('campaign_id', CAMPAIGN).eq('author_id', 'pc1').single());
  check('minted DM token reads the player\'s entry (Ben\'s decision)',
    dmRead.data?.body === 'MINTED_TOKEN_BODY', dmRead.error?.message);
}

{ // no credential material in anything any client ever received
  const blob = JSON.stringify(corpus);
  check('sentinel corpus — no hash/secret in ANY response',
    !blob.includes('pbkdf2') && !blob.includes(DM_SECRET) && !blob.includes('WinterRose'));
}

console.log(`\nAuth tests: ${pass} passed, ${fail} failed.`);
if (fail > 0) {
  console.error('🚨 AUTH BREACH — refusing to ship. The token minter or its rules are wrong.');
  process.exit(1);
}
process.exit(0);
