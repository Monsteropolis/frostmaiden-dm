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
