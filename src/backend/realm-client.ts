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

/** The Realm server couldn't be REACHED — different from it answering "no".
 *  Every UI that talks to the backend keys setup guidance off this class
 *  (Part A of Brief 3: a failed sync must not look like a quiet nothing). */
export class RealmUnreachableError extends Error {}

async function call(body: Record<string, unknown>): Promise<Record<string, unknown>> {
  let r: Response;
  try {
    r = await fetch(FN_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json', apikey: SUPABASE_ANON_KEY },
      body: JSON.stringify(body),
    });
  } catch {
    // A browser can't see WHY a cross-origin fetch died: an undeployed
    // function fails its CORS preflight (the gateway 404s it), which looks
    // exactly like a dead connection. One probe to an always-on endpoint of
    // the same project tells the two apart — this distinction is the whole
    // lesson of Brief 3 Part A.
    let backendUp = false;
    try {
      backendUp = (await fetch(`${SUPABASE_URL}/auth/v1/health`,
        { headers: { apikey: SUPABASE_ANON_KEY } })).ok;
    } catch { /* genuinely offline */ }
    throw new RealmUnreachableError(backendUp
      ? 'The Realm backend is up, but its realm-login function did not answer — most likely it is not deployed yet (or its "Verify JWT" setting is on).'
      : 'Could not reach the Realm server — check your connection.');
  }
  let data: Record<string, unknown>;
  try { data = await r.json(); } catch { data = {}; }
  if (!r.ok) {
    // Our function always answers {error: string}. A bare gateway body means
    // the call never reached it — say which setup step is missing, in words.
    if (typeof data.error === 'string') throw new Error(data.error);
    if (r.status === 404) {
      throw new RealmUnreachableError(
        'The Realm server is not deployed yet — the realm-login function was not found on the backend.');
    }
    if (r.status === 401) {
      throw new RealmUnreachableError(
        'The Realm server turned the call away at the gate — the realm-login function\'s "Verify JWT" setting must be OFF.');
    }
    throw new RealmUnreachableError(`Realm server error (${r.status}).`);
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

// ---- journal (Brief 3) ------------------------------------------------------
// Every function below takes the caller's own session token — player or DM —
// and NOTHING else. There is no privileged path: row-level security decides
// what each token may see, and tests/journal.mts drives these exact functions
// to prove it.

export interface JournalEntry {
  id: string;
  authorId: string;
  title: string;
  body: string;
  isShared: boolean;
  /** ISO timestamp from Postgres — set on insert, touched on update. */
  updatedAt: string;
}

const JOURNAL_COLS = 'id, author_id, title, body, is_shared, updated_at';

function rowToEntry(r: Record<string, unknown>): JournalEntry {
  return {
    id: String(r.id), authorId: String(r.author_id),
    title: String(r.title ?? ''), body: String(r.body ?? ''),
    isShared: !!r.is_shared, updatedAt: String(r.updated_at ?? ''),
  };
}

/** Fold setup-shaped failures (offline, tables missing) into
 *  RealmUnreachableError so every screen reuses the one guidance pattern
 *  Part A established; anything else keeps its real message. */
function throwDataError(what: string, error: { code?: string; message: string }): never {
  if (error.code === 'PGRST205') {
    throw new RealmUnreachableError(`${what} — the Realm tables are missing (the database migrations haven't run).`);
  }
  if (/fetch/i.test(error.message)) {
    throw new RealmUnreachableError('Could not reach the Realm server — check your connection.');
  }
  throw new Error(`${what}: ${error.message}`);
}

/** Everything the caller has written — private and shared both. */
export async function listMyJournal(token: string): Promise<JournalEntry[]> {
  const me = decodeClaims(token)?.character_id ?? '';
  const sb = await getSupabaseWithToken(token);
  const { data, error } = await sb.from('journal_entries')
    .select(JOURNAL_COLS).eq('author_id', me)
    .order('updated_at', { ascending: false });
  if (error) throwDataError('Could not load your journal', error);
  return (data ?? []).map(rowToEntry);
}

/** Every shared entry in the campaign, newest first. RLS scopes the campaign
 *  and hides private rows; the query just asks for the shared ones. */
export async function listSharedJournal(token: string): Promise<JournalEntry[]> {
  const sb = await getSupabaseWithToken(token);
  const { data, error } = await sb.from('journal_entries')
    .select(JOURNAL_COLS).eq('is_shared', true)
    .order('updated_at', { ascending: false });
  if (error) throwDataError('Could not load the shared journal', error);
  return (data ?? []).map(rowToEntry);
}

/** New entry, private unless isShared is set (sharing is a flag flip later —
 *  never a second copy). Author and campaign come from the token's claims. */
export async function writeJournalEntry(
  token: string, entry: { title: string; body: string; isShared?: boolean },
): Promise<JournalEntry> {
  const claims = decodeClaims(token);
  const sb = await getSupabaseWithToken(token);
  const { data, error } = await sb.from('journal_entries')
    .insert({
      campaign_id: claims?.campaign_id, author_id: claims?.character_id,
      title: entry.title, body: entry.body, is_shared: !!entry.isShared,
    })
    .select(JOURNAL_COLS).single();
  if (error) throwDataError('Could not save the entry', error);
  return rowToEntry(data as Record<string, unknown>);
}

/** Edit an entry's words. RLS restricts this to the author — updating someone
 *  else's entry comes back as zero rows, which we surface honestly. */
export async function updateJournalEntry(
  token: string, id: string, patch: { title?: string; body?: string },
): Promise<JournalEntry> {
  const sb = await getSupabaseWithToken(token);
  const { data, error } = await sb.from('journal_entries')
    .update({
      ...(patch.title !== undefined ? { title: patch.title } : {}),
      ...(patch.body !== undefined ? { body: patch.body } : {}),
    })
    .eq('id', id).select(JOURNAL_COLS);
  if (error) throwDataError('Could not save the edit', error);
  if (!data?.length) throw new Error('That entry could not be edited — only its author can.');
  return rowToEntry(data[0] as Record<string, unknown>);
}

/** The promote/demote toggle: flag an entry onto (or off) the shared page.
 *  One row changes one bit — there is deliberately no copy-to-shared path. */
export async function setShared(token: string, id: string, isShared: boolean): Promise<JournalEntry> {
  const sb = await getSupabaseWithToken(token);
  const { data, error } = await sb.from('journal_entries')
    .update({ is_shared: isShared }).eq('id', id).select(JOURNAL_COLS);
  if (error) throwDataError('Could not change sharing', error);
  if (!data?.length) throw new Error('That entry could not be changed — only its author can.');
  return rowToEntry(data[0] as Record<string, unknown>);
}

/** DM only: every entry in the campaign, private included (Ben's decision —
 *  the DM sees everything; RLS grants this to is_dm tokens alone). */
export async function listAllJournal(dmToken: string): Promise<JournalEntry[]> {
  const sb = await getSupabaseWithToken(dmToken);
  const { data, error } = await sb.from('journal_entries')
    .select(JOURNAL_COLS)
    .order('author_id').order('updated_at', { ascending: false });
  if (error) throwDataError('Could not load the party journals', error);
  return (data ?? []).map(rowToEntry);
}

/** id → display name for labelling entries with their author. Uses the same
 *  session token — characters' id/name are member-readable by design. */
export async function fetchCharacterNames(token: string): Promise<Record<string, string>> {
  const sb = await getSupabaseWithToken(token);
  const { data, error } = await sb.from('characters').select('id, name');
  if (error) throwDataError('Could not load the party roster', error);
  const names: Record<string, string> = {};
  for (const r of data ?? []) names[String(r.id)] = String(r.name);
  return names;
}
