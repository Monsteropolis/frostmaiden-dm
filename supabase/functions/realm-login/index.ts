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

import { createClient } from 'npm:@supabase/supabase-js@2';
import { handleRealmRequest } from '../_shared/realm-auth.ts';

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
