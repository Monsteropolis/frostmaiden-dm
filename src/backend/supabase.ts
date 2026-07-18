// ============================================================
// SUPABASE CLIENT — the Realm backend (auth stubs, camp
// decorations, player journals). A SEPARATE store from Canonical
// state: nothing Canonical (HP, quests, weather, secrets) exists
// in this backend, so nothing here can leak it. The DM/player
// seam remains projectPlayerView() and only projectPlayerView().
//
// The URL and anon key are committed on purpose — the anon key
// is designed to ship in public web apps. Security lives in
// Postgres row-level security (see supabase/migrations/*, proven
// by tests/boundary.mts on every CI run). A service_role key
// must NEVER appear in this repo, the client, or the build.
//
// Like PeerJS, the SDK is lazy-imported: the DM app pays nothing
// until a backend feature is actually used.
// ============================================================
import type { SupabaseClient } from '@supabase/supabase-js';

export const SUPABASE_URL = 'https://lzzrwoduheivmvnnfpaj.supabase.co';
export const SUPABASE_ANON_KEY = 'sb_publishable_1ARBfLgqEz7KEEereACCCA_gMBs2wUt';

let client: SupabaseClient | null = null;

/** Anonymous client (no player token). Enough for health checks; every
 *  table read/write requires a Realm token — see getSupabaseWithToken. */
export async function getSupabase(): Promise<SupabaseClient> {
  if (!client) {
    const { createClient } = await import('@supabase/supabase-js');
    client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return client;
}

/** Client acting as a logged-in campaign member. `token` is the JWT minted
 *  by the auth Edge Function (Brief 2) carrying the claims in claims.ts;
 *  row-level security decides what it may see and touch. */
export async function getSupabaseWithToken(token: string): Promise<SupabaseClient> {
  const { createClient } = await import('@supabase/supabase-js');
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
