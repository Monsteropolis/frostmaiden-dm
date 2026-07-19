// ============================================================
// REALM AUTH CLIENT — both sides of the login door.
//
// Player side (Realm page): plain fetch to the realm-login Edge
// Function; no SDK, no token needed to LOOK, a short-lived token
// to (later) write. Tokens live in module memory only — never
// localStorage — per Ben's "re-enter each session" decision.
//
// DM side (companion app): trades state.realm's {campaignId,
// dmSecret} for a DM token, then writes the auth stubs players
// log into: character id/name rows and password HASHES (hashed
// HERE, on the DM's device — plaintext never leaves the phone).
//
// The publishable key below the fold is browser-safe by design;
// the secret key exists only inside the Edge Function.
// ============================================================

import { SUPABASE_URL, SUPABASE_ANON_KEY, getSupabaseWithToken } from './supabase';
import { hashPassword } from '../../supabase/functions/_shared/password.ts';
import { decodeClaims } from './claims';

export { deriveRealmCode, normalizeRealmCode } from '../../supabase/functions/_shared/realm-code.ts';

const FN_URL = `${SUPABASE_URL}/functions/v1/realm-login`;

/** The campaigns row's display name — one campaign per install today. */
export const REALM_CAMPAIGN_NAME = 'Rime of the Frostmaiden';

export interface RealmCharacter { id: string; name: string; gated: boolean }

async function call(body: Record<string, unknown>): Promise<Record<string, unknown>> {
  let r: Response;
  try {
    r = await fetch(FN_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json', apikey: SUPABASE_ANON_KEY },
      body: JSON.stringify(body),
    });
  } catch {
    throw new Error('Could not reach the Realm server — check your connection.');
  }
  let data: Record<string, unknown>;
  try { data = await r.json(); } catch { data = {}; }
  if (!r.ok) {
    throw new Error(typeof data.error === 'string' ? data.error
      : `Realm server error (${r.status}).`);
  }
  return data;
}

// ---- player side ------------------------------------------------------------

/** Realm code → who's in the party (names + 🔒 flags; never hashes). */
export async function fetchRealmCharacters(realmCode: string): Promise<{
  campaignName: string; characters: RealmCharacter[];
}> {
  const d = await call({ action: 'characters', realmCode });
  return {
    campaignName: String(d.campaignName ?? ''),
    characters: (d.characters as RealmCharacter[]) ?? [],
  };
}

export interface RealmSession {
  token: string;
  characterId: string;
  characterName: string;
  campaignName: string;
  /** epoch ms — the UI bounces back to login past this moment */
  expiresAt: number;
}

/** Prove who you are; password only matters for gated characters. */
export async function realmLogin(
  realmCode: string, characterId: string, password: string,
): Promise<RealmSession> {
  const d = await call({ action: 'login', realmCode, characterId, password });
  const claims = decodeClaims(String(d.token ?? ''));
  if (!claims) throw new Error('Realm server returned an unreadable token.');
  return {
    token: String(d.token),
    characterId: String(d.characterId ?? characterId),
    characterName: String(d.characterName ?? ''),
    campaignName: String(d.campaignName ?? ''),
    expiresAt: claims.exp * 1000,
  };
}

// ---- DM side ----------------------------------------------------------------

let dmToken: string | null = null;
let dmTokenExp = 0;

/** DM token, minted on demand and cached in memory until near expiry.
 *  First-ever call provisions the campaigns row on the backend. */
export async function ensureDmToken(
  realm: { campaignId: string; dmSecret: string }, campaignName: string,
): Promise<string> {
  if (dmToken && Date.now() < dmTokenExp - 60_000) return dmToken;
  const d = await call({
    action: 'dm-login', campaignId: realm.campaignId, dmSecret: realm.dmSecret, campaignName,
  });
  const claims = decodeClaims(String(d.token ?? ''));
  if (!claims) throw new Error('Realm server returned an unreadable token.');
  dmToken = String(d.token);
  dmTokenExp = claims.exp * 1000;
  return dmToken;
}

/** Upsert the party's auth stubs (id + name ONLY — an upsert that omits
 *  password_hash leaves existing hashes untouched). Run before/alongside any
 *  password change so the login picker always has the current roster. */
export async function pushRealmRoster(
  realm: { campaignId: string; dmSecret: string }, campaignName: string,
  party: { id: string; name: string }[],
): Promise<void> {
  if (!party.length) return;
  const token = await ensureDmToken(realm, campaignName);
  const sb = await getSupabaseWithToken(token);
  const { error } = await sb.from('characters').upsert(
    party.map((p) => ({ id: p.id, campaign_id: realm.campaignId, name: p.name })),
    { onConflict: 'campaign_id,id' },
  );
  if (error) throw new Error(`Could not sync the party roster: ${error.message}`);
}

/** Set (or clear, with password '') a character's Realm password. The hash is
 *  computed here on the DM's device; the plaintext is never sent or stored.
 *  Returns the gated-state for the 🔒/🔓 marker.
 *
 *  A plain UPDATE, never an upsert: an upsert's `SET password_hash =
 *  excluded.password_hash` counts as a READ of that column to Postgres, and
 *  Brief 1 makes the hash unreadable to everyone, DM included — the write
 *  would bounce with "permission denied" (caught by tests/auth.mts). UPDATE
 *  writes the column without reading it. The row exists because callers sync
 *  the roster first; if it doesn't, say so instead of silently doing nothing. */
export async function setRealmPassword(
  realm: { campaignId: string; dmSecret: string }, campaignName: string,
  pc: { id: string; name: string }, password: string,
): Promise<boolean> {
  const token = await ensureDmToken(realm, campaignName);
  const sb = await getSupabaseWithToken(token);
  const password_hash = password ? await hashPassword(password) : '';
  const { data, error } = await sb.from('characters')
    .update({ password_hash })
    .eq('campaign_id', realm.campaignId).eq('id', pc.id)
    .select('id');
  if (error) throw new Error(`Could not save the password: ${error.message}`);
  if (!data?.length) throw new Error(`${pc.name} isn't synced to the Realm yet — sync the party and try again.`);
  return !!password;
}
