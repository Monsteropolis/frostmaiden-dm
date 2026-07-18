// ============================================================
// REALM TOKEN CLAIMS — the exact shape every row-level-security
// rule keys off. This is the contract between three parties:
//   1. the auth Edge Function (Brief 2) that MINTS the token,
//   2. the Postgres helpers app.campaign_id() / app.character_id()
//      / app.is_dm() that READ it (supabase/migrations/*),
//   3. tests/boundary.mts, which mints test tokens in this same
//      shape to prove the rules hold.
// Change it in one place and the boundary test breaks — on purpose.
// ============================================================

export interface RealmClaims {
  /** Standard subject: the character id, or "dm" for the DM token. */
  sub: string;
  /** Postgres role PostgREST switches into. Always "authenticated" —
   *  players and DM are told apart by is_dm, not by role. */
  role: 'authenticated';
  /** uuid of the campaigns row this token belongs to. */
  campaign_id: string;
  /** The player's character id (local party-member id, e.g. "pc3").
   *  null on a DM token — the DM authors nothing as a character. */
  character_id: string | null;
  /** DM token: may write campaigns/characters and read every journal. */
  is_dm: boolean;
  /** Issued-at / expiry, seconds since epoch (standard JWT). */
  iat: number;
  exp: number;
}

/** Decode a Realm token's claims for DISPLAY only (who am I logged in
 *  as, when does it expire). No signature check happens here — the
 *  database is the verifier; the client is never trusted. */
export function decodeClaims(token: string): RealmClaims | null {
  try {
    const payload = token.split('.')[1];
    const json = atob(payload.replace(/-/g, '+').replace(/_/g, '/'));
    return JSON.parse(json) as RealmClaims;
  } catch {
    return null;
  }
}
