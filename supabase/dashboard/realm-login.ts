// ╔══════════════════════════════════════════════════════════╗
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
// ╚══════════════════════════════════════════════════════════╝

import { createClient } from 'npm:@supabase/supabase-js@2';

// ════ inlined from supabase/functions/_shared/realm-code.ts ════

// ============================================================
// REALM CODE — the stable, per-campaign code a player types to
// reach the login screen. NOT the TV room code: that one is
// ephemeral (a new pairing each night); this one is derived from
// the campaign id and never changes.
//
// Shared three ways — the DM app displays it, the Realm page
// normalizes what the player typed, and the Edge Function stamps
// it onto the campaigns row at provisioning — so all three MUST
// use this exact function. Pure TS, no platform APIs: it runs
// identically in the browser, Deno (Edge Function), and Node
// (tests/auth.mts).
// ============================================================

/** Same unambiguous alphabet as the TV room codes (no 0/O, no 1/I). */
export const REALM_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const REALM_CODE_LENGTH = 6;

/** FNV-1a 64-bit over the campaign uuid. Not a secret-keeper — the code is
 *  read off the TV on purpose — just a stable, human-typable fingerprint.
 *  The uuid itself is random, so the code is not guessable from outside. */
export function deriveRealmCode(campaignId: string): string {
  let h = 0xcbf29ce484222325n;               // FNV offset basis
  const prime = 0x100000001b3n;
  for (let i = 0; i < campaignId.length; i++) {
    h ^= BigInt(campaignId.charCodeAt(i));
    h = (h * prime) & 0xffffffffffffffffn;
  }
  let out = '';
  for (let i = 0; i < REALM_CODE_LENGTH; i++) {
    out += REALM_CODE_ALPHABET[Number(h & 31n)];  // 32 chars → 5 unbiased bits
    h >>= 5n;
  }
  return out;
}

/** What the player typed → canonical form (uppercase, alphabet chars only). */
export function normalizeRealmCode(raw: string): string {
  return raw.toUpperCase().replace(/[^A-Z2-9]/g, '');
}

// ════ inlined from supabase/functions/_shared/password.ts ════

// ============================================================
// PASSWORD HASHING — shared by the DM's device (which hashes a
// character password BEFORE it leaves the phone; plaintext is
// never sent or stored) and the realm-login Edge Function (which
// verifies a submitted password against the stored hash, server-
// side, as the only reader of characters.password_hash).
//
// Web Crypto only — no Node/Deno-specific APIs — so the same file
// runs in the browser, the Edge Function, and vite-node tests.
//
// Format: pbkdf2$<iterations>$<salt b64url>$<digest b64url>
// Blank is meaningful: '' (or null) stored = the character is
// ungated — anyone with the Realm code may pick them.
// ============================================================

const ITERATIONS = 100_000;

function toB64url(bytes: Uint8Array): string {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromB64url(s: string): Uint8Array {
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/'));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function derive(password: string, salt: Uint8Array, iterations: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: salt as BufferSource, iterations }, key, 256);
  return new Uint8Array(bits);
}

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const digest = await derive(password, salt, ITERATIONS);
  return `pbkdf2$${ITERATIONS}$${toB64url(salt)}$${toB64url(digest)}`;
}

/** Constant-time-ish compare; malformed or empty stored hashes never verify. */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split('$');
  if (parts.length !== 4 || parts[0] !== 'pbkdf2') return false;
  const iterations = Number(parts[1]);
  if (!Number.isInteger(iterations) || iterations < 1 || iterations > 1_000_000) return false;
  let salt: Uint8Array, expect: Uint8Array;
  try { salt = fromB64url(parts[2]); expect = fromB64url(parts[3]); } catch { return false; }
  const got = await derive(password, salt, iterations);
  if (got.length !== expect.length) return false;
  let diff = 0;
  for (let i = 0; i < got.length; i++) diff |= got[i] ^ expect[i];
  return diff === 0;
}

// ════ inlined from supabase/functions/_shared/jwt.ts ════

// ============================================================
// TOKEN MINTING — builds the HS256 JWT that row-level security
// keys off. The claim shape is THE contract (src/backend/claims.ts
// documents it; app.campaign_id()/character_id()/is_dm() in the
// migration read it; tests/auth.mts asserts it). Get a field wrong
// here and every RLS rule silently misbehaves — which is why the
// tests import THIS function rather than re-implementing it.
//
// Web Crypto only: runs in the Edge Function (Deno) and in
// vite-node tests (Node ≥18) unchanged.
// ============================================================

function b64urlJson(o: unknown): string {
  const bytes = new TextEncoder().encode(JSON.stringify(o));
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export interface MintableClaims {
  campaign_id: string;
  character_id: string | null;   // null on the DM token
  is_dm: boolean;
}

/** "Re-enter each session": long enough for a game night, never persistent. */
export const REALM_TOKEN_TTL_SECONDS = 6 * 60 * 60;

export async function mintRealmToken(
  jwtSecret: string, claims: MintableClaims, ttlSeconds = REALM_TOKEN_TTL_SECONDS,
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const head = b64urlJson({ alg: 'HS256', typ: 'JWT' });
  const body = b64urlJson({
    sub: claims.character_id ?? 'dm',
    role: 'authenticated',
    iat: now,
    exp: now + ttlSeconds,
    campaign_id: claims.campaign_id,
    character_id: claims.character_id,
    is_dm: claims.is_dm,
  });
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(jwtSecret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = new Uint8Array(await crypto.subtle.sign(
    'HMAC', key, new TextEncoder().encode(`${head}.${body}`)));
  let bin = '';
  for (const b of sig) bin += String.fromCharCode(b);
  const sigB64 = btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return `${head}.${body}.${sigB64}`;
}

// ════ inlined from supabase/functions/_shared/realm-auth.ts ════

// ============================================================
// REALM AUTH CORE — the token minter's brain, kept free of any
// HTTP/Deno plumbing so tests/auth.mts can exercise the EXACT
// code the deployed Edge Function runs (the function's index.ts
// is a thin wrapper: CORS + rate limit + this).
//
// It is handed a SERVICE-ROLE Supabase client (`db`) — the only
// component anywhere allowed to read password_hash / dm_token_hash.
// That client exists solely inside the Edge Function's runtime;
// the secret key never appears in the repo or the client bundle.
//
// Security notes:
//  - failures are GENERIC ("wrong code, character, or password") —
//    a guesser learns nothing about which part was wrong;
//  - passwords and hashes are never logged and never returned;
//  - blank stored hash = ungated (Ben's decision): the Realm code
//    alone admits that character.
// ============================================================


/** Structural slice of a service-role supabase-js client — keeps this file
 *  import-free of the SDK (browser, Deno and Node all bring their own). */
export interface RealmDb {
  // deno-lint-ignore no-explicit-any
  from(table: string): any;
}

export interface RealmResult { status: number; body: Record<string, unknown> }

const GENERIC = 'Wrong Realm code, character, or password.';
const ok = (body: Record<string, unknown>): RealmResult => ({ status: 200, body });
const err = (status: number, error: string): RealmResult => ({ status, body: { error } });

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// --- schema preflight (Wave 9 Part A) ----------------------------------------
// The DM-facing paths must never again swallow a database error into a
// generic shrug: this backend holds no Canonical secrets by construction, so
// naming the real failure leaks nothing and saves the whole Realm (the
// hosted project was missing one migration for weeks behind "Could not set
// up the campaign."). Player-facing auth failures stay GENERIC — this
// vocabulary is only ever used on the DM/provisioning side.

/** One preflight check: what was verified, whether it holds, and — when it
 *  doesn't — the exact dashboard step that repairs it. */
export interface SetupCheck { id: string; label: string; ok: boolean; fix?: string }

const FOUNDATION_SQL = '20260718000000_realm_foundation.sql';
const REALM_CODE_SQL = '20260719000000_realm_code.sql';
const GRANTS_SQL = '20260719000001_service_role_grants.sql';
const runFix = (file: string) =>
  `open supabase/migrations/${file} from the repo and run it in the Supabase dashboard's SQL Editor`;

/** Translate a Postgres/PostgREST error into the dashboard step that fixes
 *  it. Missing tables arrive as PGRST205 (PostgREST's schema cache) or 42P01
 *  (raw Postgres); a missing column is 42703; revoked privileges are 42501. */
export function fixForDbError(e: { code?: string; message: string }): string {
  if (e.code === 'PGRST205' || e.code === '42P01') {
    return `the Realm tables are missing — ${runFix(FOUNDATION_SQL)}`;
  }
  if (e.code === '42703') {
    return `the database is missing the realm_code column — ${runFix(REALM_CODE_SQL)}`;
  }
  if (e.code === '42501') {
    return `the database refused the login server permission — ${runFix(GRANTS_SQL)}`;
  }
  return `database error ${e.code ?? '?'}: ${e.message}`;
}

/** Verify the schema the auth paths depend on, one plain-language check per
 *  moving part. Served to the app by action 'setup-check' and run before the
 *  provisioning insert, so a half-migrated database names its own repair. */
export async function preflightSchema(db: RealmDb): Promise<SetupCheck[]> {
  const checks: SetupCheck[] = [];
  const run = async (id: string, label: string, q: PromiseLike<{ error: { code?: string; message: string } | null }>) => {
    let error: { code?: string; message: string } | null;
    try { error = (await q).error; } catch (e) { error = { message: e instanceof Error ? e.message : String(e) }; }
    checks.push(error ? { id, label, ok: false, fix: fixForDbError(error) } : { id, label, ok: true });
  };
  await run('campaigns-table', 'Campaigns table', db.from('campaigns').select('id').limit(1));
  await run('realm-code-column', 'Realm-code column', db.from('campaigns').select('realm_code').limit(1));
  await run('characters-table', 'Characters table', db.from('characters').select('id').limit(1));
  // A write probe that can never change data: UPDATE against an id no random
  // uuid can collide with still runs Postgres' privilege check, so missing
  // service_role grants show up as 42501 without touching a single row.
  await run('service-write', 'Login server can write', db.from('campaigns')
    .update({ name: 'preflight' }).eq('id', '00000000-0000-0000-0000-000000000000'));
  return checks;
}

async function findCampaignByCode(db: RealmDb, rawCode: unknown) {
  const code = normalizeRealmCode(String(rawCode ?? ''));
  if (!code) return null;
  const { data } = await db.from('campaigns')
    .select('id, name, realm_code').eq('realm_code', code).maybeSingle();
  return data ?? null;
}

/** action: 'characters' — the login picker. Names and gated-flags only;
 *  the hash itself never enters the response shape. */
async function listCharacters(db: RealmDb, body: Record<string, unknown>): Promise<RealmResult> {
  const campaign = await findCampaignByCode(db, body.realmCode);
  if (!campaign) return err(404, 'No party found with that Realm code.');
  const { data, error } = await db.from('characters')
    .select('id, name, password_hash').eq('campaign_id', campaign.id).order('id');
  if (error) return err(500, 'Could not load the party.');
  return ok({
    campaignName: campaign.name,
    characters: (data ?? []).map((c: { id: string; name: string; password_hash: string | null }) => ({
      id: c.id, name: c.name, gated: !!(c.password_hash && c.password_hash.length > 0),
    })),
  });
}

/** action: 'login' — the player proves who they are; on success a signed
 *  player token (is_dm always false) comes back, short-lived. */
async function playerLogin(db: RealmDb, jwtSecret: string, body: Record<string, unknown>): Promise<RealmResult> {
  const campaign = await findCampaignByCode(db, body.realmCode);
  if (!campaign) return err(401, GENERIC);
  const characterId = String(body.characterId ?? '');
  if (!characterId) return err(401, GENERIC);
  const { data: ch } = await db.from('characters')
    .select('id, name, password_hash')
    .eq('campaign_id', campaign.id).eq('id', characterId).maybeSingle();
  if (!ch) return err(401, GENERIC);
  const gated = !!(ch.password_hash && ch.password_hash.length > 0);
  if (gated) {
    const good = await verifyPassword(String(body.password ?? ''), ch.password_hash);
    if (!good) return err(401, GENERIC);
  }
  const token = await mintRealmToken(jwtSecret, {
    campaign_id: campaign.id, character_id: ch.id, is_dm: false,
  });
  return ok({
    token,
    characterId: ch.id,
    characterName: ch.name,
    campaignName: campaign.name,
    expiresInSeconds: REALM_TOKEN_TTL_SECONDS,
  });
}

/** action: 'dm-login' — the DM's device holds {campaignId, dmSecret},
 *  generated once and kept in its local state. First call provisions the
 *  campaigns row (stamping the derived realm_code); later calls verify the
 *  secret against dm_token_hash. The uuid is random and never displayed,
 *  so a stranger cannot aim at a campaign they don't already own. */
async function dmLogin(db: RealmDb, jwtSecret: string, body: Record<string, unknown>): Promise<RealmResult> {
  const campaignId = String(body.campaignId ?? '');
  const dmSecret = String(body.dmSecret ?? '');
  if (!UUID_RE.test(campaignId) || dmSecret.length < 16) return err(400, 'Malformed DM credentials.');
  const name = typeof body.campaignName === 'string' ? body.campaignName.slice(0, 120) : '';
  const realmCode = deriveRealmCode(campaignId);

  const { data: row, error: readErr } = await db.from('campaigns')
    .select('id, name, dm_token_hash, realm_code').eq('id', campaignId).maybeSingle();
  if (readErr) return err(500, `Could not read the campaign — ${fixForDbError(readErr)}`);

  if (!row) {
    // Provisioning writes next — preflight the schema so a half-migrated
    // database names its missing migration instead of a generic shrug.
    const bad = (await preflightSchema(db)).filter((c) => !c.ok);
    if (bad.length) {
      return err(500, `The Realm database isn't ready: ${bad.map((c) => c.fix).join('; ')}`);
    }
    const { error } = await db.from('campaigns').insert({
      id: campaignId, name, dm_token_hash: await hashPassword(dmSecret), realm_code: realmCode,
    });
    if (error) return err(500, `Could not set up the campaign — ${fixForDbError(error)}`);
  } else if (!row.dm_token_hash) {
    // Row exists but was never claimed (pre-auth provisioning) — claim it now.
    const { error } = await db.from('campaigns')
      .update({ dm_token_hash: await hashPassword(dmSecret), realm_code: realmCode })
      .eq('id', campaignId);
    if (error) return err(500, `Could not set up the campaign — ${fixForDbError(error)}`);
  } else {
    const good = await verifyPassword(dmSecret, row.dm_token_hash);
    if (!good) return err(401, 'This device does not hold the keys to that campaign.');
    if (row.realm_code !== realmCode || (name && row.name !== name)) {
      await db.from('campaigns')
        .update({ realm_code: realmCode, ...(name ? { name } : {}) }).eq('id', campaignId);
    }
  }

  const token = await mintRealmToken(jwtSecret, {
    campaign_id: campaignId, character_id: null, is_dm: true,
  });
  return ok({ token, realmCode, expiresInSeconds: REALM_TOKEN_TTL_SECONDS });
}

/** One entry point for every action the function serves. */
export async function handleRealmRequest(
  raw: unknown, db: RealmDb, jwtSecret: string,
): Promise<RealmResult> {
  if (raw === null || typeof raw !== 'object') return err(400, 'Malformed request.');
  const body = raw as Record<string, unknown>;
  switch (body.action) {
    case 'characters': return listCharacters(db, body);
    case 'login': return playerLogin(db, jwtSecret, body);
    case 'dm-login': return dmLogin(db, jwtSecret, body);
    // The one-screen setup check (Wave 9 A3): reports which dashboard steps
    // are done and which remain. Reveals table/column existence only — no
    // campaign data, no hashes — so it is safe to serve unauthenticated.
    case 'setup-check': return ok({ checks: await preflightSchema(db) });
    default: return err(400, 'Unknown action.');
  }
}

// ════ inlined from supabase/functions/realm-login/index.ts ════

// ============================================================
// realm-login — the ONLY door through the security boundary.
// Players (and the DM's device) call this to trade credentials
// for a short-lived signed token in the exact claim shape RLS
// understands (src/backend/claims.ts). All the decision-making
// lives in ../_shared/realm-auth.ts so tests/auth.mts can prove
// it; this file is only the HTTP skin: CORS, rate limiting, and
// the two server-side secrets.
//
// Secrets (Edge Function environment only — NEVER in the repo,
// NEVER in the client bundle):
//   SUPABASE_SERVICE_ROLE_KEY — auto-provided by Supabase; lets
//     this function (and nothing else) read password_hash.
//   REALM_JWT_SECRET — the project's legacy JWT secret; set once
//     with `supabase secrets set` (see supabase/README.md).
//
// Nothing here logs a password, a hash, or a token.
// ============================================================


const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

// Best-effort brute-force damper (per isolate, in memory): a short password
// should not be free to hammer. The threat model is a friendly table, so a
// sliding 10-minute window per IP is plenty — 20 credential attempts, 60
// list/refresh calls.
const WINDOW_MS = 10 * 60 * 1000;
const LIMITS: Record<string, number> = { login: 20, 'dm-login': 20, characters: 60 };
const hits = new Map<string, number[]>();

function rateLimited(ip: string, action: string): boolean {
  const limit = LIMITS[action] ?? 20;
  const key = `${ip}:${action}`;
  const now = Date.now();
  const recent = (hits.get(key) ?? []).filter((t) => now - t < WINDOW_MS);
  recent.push(now);
  hits.set(key, recent);
  if (hits.size > 5000) hits.clear();   // cap memory; resets the window, harmless
  return recent.length > limit;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  const json = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), {
      status, headers: { ...CORS, 'Content-Type': 'application/json' },
    });

  if (req.method !== 'POST') return json(405, { error: 'POST only.' });

  const jwtSecret = Deno.env.get('REALM_JWT_SECRET') ?? '';
  const url = Deno.env.get('SUPABASE_URL') ?? '';
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  if (!jwtSecret || !url || !serviceKey) {
    return json(500, { error: 'Function is not configured yet (missing secrets).' });
  }

  let body: unknown;
  try { body = await req.json(); } catch { return json(400, { error: 'Malformed request.' }); }

  const action = String((body as Record<string, unknown>)?.action ?? '');
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
  if (rateLimited(ip, action)) {
    return json(429, { error: 'Too many attempts — wait a few minutes and try again.' });
  }

  const db = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const result = await handleRealmRequest(body, db, jwtSecret);
  return json(result.status, result.body);
});
