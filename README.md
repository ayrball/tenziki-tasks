# Tenziki Tasks

A fast, minimal task manager. React 19 + Vite + Tailwind 4 + Framer Motion on the front end; a Cloudflare Worker with a D1 database on the back end, served at `todo.tenziki.com`.

- Works without an account: tasks are saved in the browser.
- Sign in with Google to sync across devices. Tasks created while signed out are moved into the account on first sign-in.
- Categories, priorities, due dates (stored as real dates), notes (autosaved), search, filters, light/dark theme.
- **Deleted section:** deleting moves a task there (with Undo). Restore it, or delete it forever (two clicks). Anything left there is removed after 30 days.
- **Works offline:** installable as an app. Changes made offline are queued, survive a reload, and are sent in order when you're back online. Open tabs and devices pick up each other's changes automatically.
- Press `N` anywhere to add a task. Arrow keys move between the filter tabs. "Export my tasks" in the footer downloads everything as JSON.

## How auth works

1. The browser signs in with Google Identity Services and gets a Google ID token.
2. `POST /api/auth/google` verifies the token with Google (audience, issuer, expiry, verified email), creates a **session row in D1**, and returns a session token signed with `SESSION_SECRET` (HMAC-SHA256, 30 days).
3. Every `/api/tasks*` request needs `Authorization: Bearer <session token>`. The Worker checks the signature **and** that the session row is still valid, then takes the user id from the token only. Every query is scoped to that user, so one user can never read or change another's tasks.
4. **Signing out revokes the session on the server**, so a copied token stops working immediately. "Sign out of all devices" revokes all of an account's sessions.

## Limits

Defined once in `src/lib/limits.js` (the Worker enforces them, the UI explains them):

- 3,000 tasks per account (including Deleted). Creating more returns a clear error instead of silently dropping the oldest.
- Deleted tasks are removed for good after 30 days.
- Sessions last 30 days unless revoked.

## Security headers

`public/_headers` sets a strict Content-Security-Policy (own files, Google sign-in, Google Fonts and profile photos only; no inline scripts), HSTS, `X-Frame-Options: DENY`, `nosniff`, a referrer policy and a permissions policy. If you add a third-party script, font or API, add it to the CSP there.

## Running locally

```bash
npm install
npm run db:migrate:local   # create/update the local D1 tables (re-run after pulling new migrations)
npm run dev:api            # Worker + D1 on http://localhost:8787
npm run dev                # Vite on http://localhost:5173, proxies /api to the Worker
```

Open <http://localhost:5173>. Without a Google client id the app runs in local-only mode and the sign-in dialog says so.

`wrangler dev` and `npm test` read secrets from `.dev.vars` (git-ignored). On a fresh clone, copy `.dev.vars.example` to `.dev.vars` first (any throwaway `SESSION_SECRET` works locally). Put your `GOOGLE_CLIENT_ID` in it to try real sign-in locally (add `http://localhost:5173` to the client's authorized origins). The service worker only runs in production builds (`npm run build`, then `npm run dev:api` serves `dist/` at :8787).

## Tests

```bash
npm run test:unit   # dates, offline queue, export (fast, no server)
npm test            # API tests against a throwaway Worker + database (starts and stops its own)
npm run test:all
```

The API tests cover auth, session revocation, per-user isolation, validation, the Deleted section (including that permanent deletion is refused for tasks not in Deleted), the 30-day purge, and the 3,000-task limit. They never touch your real local data or the remote database.

## Setting up Google sign-in

1. In [Google Cloud Console](https://console.cloud.google.com/apis/credentials) create an **OAuth client ID** of type **Web application**.
2. Add **Authorized JavaScript origins**: `https://todo.tenziki.com` and, for local testing, `http://localhost:5173`.
3. Put the client id in `wrangler.jsonc` under `vars.GOOGLE_CLIENT_ID` (it is public).
4. Set a long random session secret (keep it private; rotating it signs everyone out):

   ```bash
   npx wrangler secret put SESSION_SECRET
   ```

## Deploying

```bash
npm run db:migrate:remote   # applies any new migrations (always run this BEFORE deploying)
npm run deploy              # builds and deploys the Worker + static assets
```

Migrations are in `migrations/` and are safe to re-run. The Worker expects all of them: it reads the `deleted_at` column (0002) and the `sessions` table (0003), so deploying code before migrating makes the API fail.

Sessions issued by older versions have no server-side record and are rejected, so everyone signs in once after the upgrade.

### Existing data

Earlier versions identified users by an unverified email-derived id (`google-<email>`). The first time someone signs in with Google, any rows under their verified email's old id are re-assigned to their real account automatically.

## Project layout

| Path | What it is |
| --- | --- |
| `src/worker.js` | API: Google sign-in, sessions, task CRUD, Deleted section (D1) |
| `migrations/` | D1 schema |
| `public/_headers`, `public/sw.js` | Security headers; offline service worker |
| `src/context/` | Auth, tasks (optimistic updates, offline queue, live sync, undo), toasts |
| `src/components/` | UI |
| `src/lib/` | API client, offline queue, dates, export, limits, shared task metadata |
| `src/index.css` | Design tokens (light/dark, checked for WCAG AA contrast) |
| `tests/` | API and unit tests |
| `scripts/make-icons.mjs` | Regenerates the PNG app icons |

## Known limits

- Sign-in uses Google only.
- Conflicts are last-write-wins per change: if two devices edit the same task while offline, the later change to reach the server wins.
- The session token is kept in `localStorage`. The CSP and React's escaping guard against script injection; an httpOnly-cookie session would be a further hardening step.
