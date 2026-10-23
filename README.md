# Tenziki Tasks

A fast, minimal task manager. React 19 + Vite + Tailwind 4 + Framer Motion on the front end; a Cloudflare Worker with a D1 database on the back end, served at `todo.tenziki.com`.

- Works without an account: tasks are saved in the browser.
- Sign in with Google to sync across devices. Tasks created while signed out are moved into the account on first sign-in.
- **Bars:** your own named, coloured sections that tasks live in (they replace the old fixed categories). Add, rename, recolour, reorder, collapse and delete them. **Drag a task** by its grip handle to reorder it or move it to another bar (mouse, touch or keyboard), or use "Move to" in the task. Deleting a bar never deletes its tasks: they move to the first remaining bar.
- **Drag a task onto a tab** to change it: **Today** sets it due today, **Urgent** makes it High priority, **Done** marks it done, **Deleted** moves it to Deleted. Each shows an Undo, and the task keeps its bar and its place. Dropping a done task on Today or Urgent reopens it. While you drag, the tab bar floats into view so it is always within reach. With the keyboard: focus a task's grip, press Space to pick it up, ArrowUp to reach the tabs (Today first), ArrowLeft/Right to choose one, then Space to drop (Escape cancels).
- **Bars on/off:** the "Bars" switch next to the search box shows tasks as one plain list instead. It only changes the view (every task keeps its bar and order), is remembered per device, and tasks can still be dragged onto tabs in the plain list.
- Priorities, due dates (stored as real dates), notes (autosaved), search, filters, light/dark theme.
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
- 30 bars per account, names up to 40 characters, and at least one bar always remains.
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
npm run test:unit   # dates, offline queue, export, install help, bar ordering, tab-drop rules (fast, no server)
npm test            # API tests against a throwaway Worker + database (starts and stops its own)
npm run test:all
```

The API tests cover auth, session revocation, per-user isolation, validation, the Deleted section (including that permanent deletion is refused for tasks not in Deleted), the 30-day purge, the 3,000-task limit, and bars (creating, renaming, ordering, deleting without losing tasks, the 30-bar limit, and that you can never file a task into someone else's bar). They never touch your real local data or the remote database.

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

Migrations are in `migrations/`. The Worker expects all of them: it reads the `deleted_at` column (0002), the `sessions` table (0003) and the `lists` table and `list_id`/`position` columns (0004), so deploying code before migrating makes the API fail.

Sessions issued by older versions have no server-side record and are rejected, so everyone signs in once after the upgrade.

### Existing data

**Bars.** The first time an account loads its data after bars were introduced, the Worker creates its bars from the categories it already used (plus the standard Personal, Work, Fitness and Ideas) and files every existing task into the matching bar, keeping the old newest-first order. Nothing is lost; the old `category` column is kept but no longer used.

Earlier versions identified users by an unverified email-derived id (`google-<email>`). The first time someone signs in with Google, any rows under their verified email's old id are re-assigned to their real account automatically.

## Project layout

| Path | What it is |
| --- | --- |
| `src/worker.js` | API: Google sign-in, sessions, task CRUD, Deleted section (D1) |
| `src/bars.js` | Bars: creating/ordering/deleting them, ownership checks, seeding from old categories |
| `migrations/` | D1 schema |
| `public/_headers`, `public/sw.js` | Security headers; offline service worker |
| `src/context/` | Auth, tasks (optimistic updates, offline queue, live sync, undo), toasts |
| `src/components/` | UI |
| `src/components/DragBoard.jsx` | Drag and drop for the whole task area (tabs, bars, tasks) |
| `src/lib/` | API client, offline queue, dates, export, limits, bar and ordering logic (`lists.js`), tab-drop rules (`tabDrop.js`), the Bars switch (`barsPref.js`), shared task metadata |
| `src/index.css` | Design tokens (light/dark, checked for WCAG AA contrast) |
| `tests/` | API and unit tests |
| `scripts/make-icons.mjs` | Regenerates the PNG app icons |

## Known limits

- Sign-in uses Google only.
- With bars off, tasks can be dragged onto tabs but not reordered (ordering belongs to bars).
- Dragging into a bar works with the bars you can see: in Today, Urgent and Done only bars that have a matching task are shown, so to move a task into a hidden bar use "Move to" in the task or switch to All (which shows every bar, even empty ones).
- Conflicts are last-write-wins per change: if two devices edit the same task while offline, the later change to reach the server wins.
- The session token is kept in `localStorage`. The CSP and React's escaping guard against script injection; an httpOnly-cookie session would be a further hardening step.

## License

Licensed under the [PolyForm Noncommercial License 1.0.0](LICENSE). You are free to use, modify and share this for personal, hobby, educational, research and other noncommercial purposes.

**Commercial use** (selling it, building a paid product or service on it, or using it in a business) needs a separate license from the author. Commercial licenses are available: get in touch via [github.com/ayrball](https://github.com/ayrball) to discuss terms.
