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
