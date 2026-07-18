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

import { deriveRealmCode, normalizeRealmCode } from './realm-code.ts';
import { hashPassword, verifyPassword } from './password.ts';
import { mintRealmToken, REALM_TOKEN_TTL_SECONDS } from './jwt.ts';

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

  const { data: row } = await db.from('campaigns')
    .select('id, name, dm_token_hash, realm_code').eq('id', campaignId).maybeSingle();

  if (!row) {
    const { error } = await db.from('campaigns').insert({
      id: campaignId, name, dm_token_hash: await hashPassword(dmSecret), realm_code: realmCode,
    });
    if (error) return err(500, 'Could not set up the campaign.');
  } else if (!row.dm_token_hash) {
    // Row exists but was never claimed (pre-auth provisioning) — claim it now.
    const { error } = await db.from('campaigns')
      .update({ dm_token_hash: await hashPassword(dmSecret), realm_code: realmCode })
      .eq('id', campaignId);
    if (error) return err(500, 'Could not set up the campaign.');
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
    default: return err(400, 'Unknown action.');
  }
}
