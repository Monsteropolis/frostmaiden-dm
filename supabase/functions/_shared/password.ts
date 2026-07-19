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
