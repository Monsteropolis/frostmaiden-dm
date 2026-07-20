# Realm setup — the one-time dashboard steps (no terminal needed)

The Realm login system is two halves. The **database** half is the tables
and security rules — its *foundation* is live, but newer updates ship as
small SQL files that each need one paste into the dashboard (Step 3 below).
The **login server** half is a small program called `realm-login` that has
to be uploaded to Supabase once.

> **Already deployed the function, but Sync says it "could not set up the
> campaign"?** You're only missing Step 3 — the two SQL pastes. Do Step 3,
> then tap Sync again. The app's **🩺 Check Realm setup** button (next to
> Sync) will tell you exactly which steps are done and which remain.

Everything below happens in your web browser at
[supabase.com/dashboard](https://supabase.com/dashboard) — sign in and open
the **frostmaiden** project. Ten minutes, six steps, once ever.

---

## Step 1 — copy the signing secret

The login server needs the project's secret signing key so the tokens it
hands out are trusted by the database.

1. In the left sidebar, click the **gear icon (Project Settings)**.
2. Click **JWT Keys** (it may be under a "Configuration" heading).
3. Find **Legacy JWT Secret**, click to reveal it, and **copy** it.

> That value is a password. Don't paste it anywhere except Step 2, and don't
> send it to anyone — including into a chat.

## Step 2 — store it where the login server can read it

1. In the left sidebar, click **Edge Functions**.
2. Open the **Secrets** page (a tab or link on that screen).
3. Add a new secret — **Key** must be exactly:

   ```
   REALM_JWT_SECRET
   ```

   **Value**: paste what you copied in Step 1. Save.

## Step 3 — update the database (two quick SQL pastes)

The database needs every file in the repo's `supabase/migrations/` folder to
have been run, in filename order. The foundation one is already live; the
two newer ones are not, and the Realm sync **cannot work without them**.

For each of these two files, in this order:

1. [supabase/migrations/20260719000000_realm_code.sql](https://github.com/Monsteropolis/frostmaiden-dm/blob/main/supabase/migrations/20260719000000_realm_code.sql)
2. [supabase/migrations/20260719000001_service_role_grants.sql](https://github.com/Monsteropolis/frostmaiden-dm/blob/main/supabase/migrations/20260719000001_service_role_grants.sql)

do this:

1. Open the file on GitHub (links above), click the **copy icon** to copy
   its whole contents.
2. In the Supabase dashboard's left sidebar, click **SQL Editor**.
3. Paste, then click **Run** (bottom right). A green "Success" (even
   "Success. No rows returned") means it worked.

Both files are safe to run more than once — re-running them changes nothing.

## Step 4 — upload the login server

1. Still under **Edge Functions**, click **Deploy a new function** →
   **Via Editor**.
2. Name the function exactly:

   ```
   realm-login
   ```

3. The editor opens with example code — select all of it and delete it.
4. Open this file on GitHub:
   [supabase/dashboard/realm-login.ts](https://github.com/Monsteropolis/frostmaiden-dm/blob/main/supabase/dashboard/realm-login.ts)
   — click the **Raw** button (or the copy icon), select everything, copy,
   and paste it into the dashboard editor.
5. **Turn OFF the "Verify JWT" option.** Depending on the dashboard version
   this appears as a toggle in the deploy screen, or under the function's
   **Details/Settings** after it deploys — it may be labelled *"Verify JWT
   with legacy secret"* or *"Enforce JWT verification."* It must be **off**:
   this function's whole job is to check passwords for people who don't have
   a token yet, so the gatekeeper can't demand a token first.
6. Click **Deploy function** and wait for the confirmation.

## Step 5 — check it worked (10 seconds)

Open this address in a new browser tab:

```
https://lzzrwoduheivmvnnfpaj.supabase.co/functions/v1/realm-login
```

- **`{"error":"POST only."}`** — perfect. The server is up. Go to Step 6.
- **`{"code":"NOT_FOUND", ...}`** — the function name isn't exactly
  `realm-login`. Rename or redeploy with the exact name.
- **Anything about "Invalid JWT" / "Missing authorization"** — the
  Verify JWT option from Step 4.5 is still on. Open the function in the
  dashboard, find that setting, turn it off.

## Step 6 — the real test, from your phone

1. Open the DM app → **Session** tab → scroll to **Realm login**.
2. Tap **🔄 Sync party to Realm**.
3. You should see **"Party synced — players can now enter the code and pick
   their character."**

If instead it says *"…not configured yet (missing secrets)"*, the secret
name in Step 2 isn't exactly `REALM_JWT_SECRET` — fix the name and tap Sync
again (no redeploy needed).

Once Sync is green: set character passwords on each character's Edit page
(optional), and players can sign in on the Realm page with the Realm code
shown next to the Sync button. Journals light up for everyone the moment
they're signed in.

---

*For developers: the pasted file is generated from
`supabase/functions/realm-login/` by `scripts/bundle-realm-login.mts`; CI
fails if it drifts from the real sources. The CLI deploy path in
`supabase/README.md` still works from any logged-in dev machine.*
