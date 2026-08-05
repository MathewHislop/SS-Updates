# Simple Scheduler

React frontend (Vite), Express + SQLite backend (`node:sqlite`, no native module compilation needed). Two ways to run it: the plain dev workflow below (for iterating on the code), or the packaged Electron desktop app (see "Packaging & licensing" further down) — that's the real sellable build.

## What's new in 1.1.0

- **Appointment time** — jobs now have a start time (`HH:MM`), not just a date, so more than one can be scheduled per day. Calendar day cells and every job listing now sort by time and show it.
- **Duration** — a fixed dropdown (15 min up to 8 hr, plus 1–5 day options) sets each job's length. An end time is computed and shown wherever a job appears (e.g. "9:00 AM – 10:30 AM (1.5 hrs)"). Picking a multi-day option (e.g. "2 days") creates that many independent full-workday job cards on consecutive dates, rather than one linked job.
- **Overlap warning** — creating/editing a job shows a non-blocking heads-up if its time range overlaps another job the same day. It never prevents saving — trades sometimes double-book on purpose.
- **Customer pricing** — the CRM customer card has a new "Pricing" section: a free-text note (e.g. "mate's rates") plus an editable list of per-service price overrides.
- Existing appointments created before this update were migrated automatically (backfilled to 09:00 / 60 min) — nothing to do manually, and this runs automatically for anyone who already had the app installed once the auto-updater delivers this version.
- **Not built**: pre-filling a job's price from a matching customer override — jobs don't have a price field at all yet, so this would be a bigger addition than fits here; flagged as a future item, not silently dropped.

## First-time setup

```bash
npm run install:all
```

This installs dependencies for the root, `server/`, and `client/` folders.

## Running it

```bash
npm run dev
```

Then open **http://localhost:5173** in your browser. Leave the terminal window open while you're using the app — closing it stops the server. To stop, press `Ctrl+C` in that terminal.

Two things start together:
- The API server on `http://localhost:4000`
- The web app on `http://localhost:5173` (this is what you open in your browser)

## Where your data lives

- `server/data/scheduler.db` — the SQLite database (businesses, customers, jobs, business profiles, activity/interaction logs)
- `server/uploads/` — uploaded files (contracts, photos, etc. from the Business Profile tab)

To back up your data, just copy those two things somewhere safe. To start fresh, stop the app and delete `server/data/scheduler.db` (it'll recreate itself with one empty "Business 1" tab on next start).

## What to click through to test it

1. **Calendar tab** — click "Add job" (top-right or on any day cell). Create a new customer inline, add a service/notes, save. Confirm it shows up on the calendar.
2. **CRM tab** — click a customer to see their job history, add a Note or Email log entry, edit/delete the customer.
3. **Business Profile tab** — fill in address/contact/links/notes (auto-saves on blur), drop a file in the Files section, download it back, then delete it. Add a Note/Email here too — these show up on the business's own activity timeline, separate from any one customer.
4. **Multiple businesses** — click the `+` next to the bottom tabs to add another business; double-click a tab to rename it; hover a tab to see the delete `×` (you can't delete the last one).
5. **Export to Excel** (top-right) — downloads one workbook covering every business (info, customers, jobs, activity log sheets each).
6. **Export week** (Calendar tab) — pick a date, downloads just that Mon–Sun week's schedule.
7. **Reload the page** at any point — everything you did should still be there, because it's now a real database, not browser storage.

## Notes on what changed from the original artifact

- All data now lives in `server/data/scheduler.db` (SQLite) instead of the artifact's `window.storage`. Uploaded files are saved as real files in `server/uploads/`, referenced by path in the database — no more base64-in-storage.
- Every feature from the original prototype is preserved: multi-business tabs, calendar, CRM with per-customer note/email/job activity log, business profile with its own separate activity log + file attachments, Excel export (full + weekly), inline customer creation from the job modal, service autocomplete, search.
- "Email" still just opens your default mail app via a `mailto:` link and logs that you sent it — there's no real email-sending integration, same as the original.

## Packaging & licensing

The app is wrapped with **Electron** (not Tauri) — the backend is already Node/Express, and Electron's main process is Node itself, so the whole server runs in-process with zero rewrite. Tauri would have meant either a Rust rewrite of the backend or bundling Node as an external sidecar; neither made sense on top of what's already built.

**Build commands** (run from the project root, after `npm run install:all`):

```bash
npm run electron:preview     # build client + launch the packaged-style app from source, for quick iteration
npm run dist:win              # unsigned, unpacked build → release/win-unpacked/Simple Scheduler.exe
npm run dist:win:installer    # unsigned single-file installer → release/Simple Scheduler Setup <version>.exe
npm run dist:mac              # mac build — can only actually run on a Mac; untestable from Windows
```

**A one-time Windows setting you'll likely need**: electron-builder downloads a combined mac+Windows signing-tools archive as part of building the Windows installer, and extracting it needs the "create symbolic links" privilege, which a normal Windows account doesn't have by default. If `npm run dist:win:installer` fails with `Cannot create symbolic link`, turn on **Settings → Privacy & Security → For developers → Developer Mode** once, then re-run the command. (I built today's test installer with a one-off flag working around this without changing any settings, but that flag also disables code signing, so it's not something to bake into the permanent build command — better to fix it properly via Developer Mode before your real signed build.)

### Where a packaged install's data lives

Unlike the dev workflow (`server/data/`, next to the source), the packaged app stores everything in the OS's standard per-user app-data folder — e.g. on Windows, `%APPDATA%\simple-scheduler\data\` (SQLite db + license/trial state) and `%APPDATA%\simple-scheduler\uploads\`. This is what makes the install survive updates and live in the "right" place. Back up the same way — copy that folder.

### Licensing (Lemon Squeezy)

- Uses Lemon Squeezy's **License API** (`/v1/licenses/activate`, `/validate`, `/deactivate`) directly — no Store ID or API key needed for this; those endpoints are designed to be called straight from an untrusted desktop app using only the customer's license key. I confirmed the exact request/response shapes against the real production API. **The only thing you still need to do is create the actual Product/Variant in your Lemon Squeezy dashboard** so real keys get issued at checkout — nothing else is blocked on that.
- The check is genuinely "is this license active right now" — `server/src/license.js` calls Lemon Squeezy's `validate` endpoint and gates access on `license_key.status === "active"`, re-checked roughly daily (cached locally so it still works offline). It never hardcodes a permanent local unlock. **This means switching from one-time purchase to a subscription later is purely a Lemon Squeezy dashboard change** — the app doesn't need to know or care which billing model produced that status.
- 14-day trial is enforced from a local timestamp (`license-state.json`), independent of the license check — starts on first-ever launch.
- Gating happens in the React app (blocks rendering the app until trial-active or licensed), not by blocking API routes server-side — a deliberate simplification given this product's threat model (a small solo-seller product, not DRM-grade protection). A determined user could bypass a client-side gate; hardening that further is possible later if it ever matters.

### Auto-updates

Uses `electron-updater` checking **GitHub Releases**. On startup, the app checks for a newer published release, downloads it silently in the background, and shows a small "Update ready · Restart" button (top bar + About panel) rather than forcing an interruption — the update installs next time the app restarts, whether via that button or a normal quit.

`electron-builder.json`'s `"publish"` block points at `MathewHislop/Small-Business-Scheduler` on GitHub.

To actually cut a release: bump `version` in `package.json`, set a `GH_TOKEN` env var (a GitHub personal access token with `repo` scope), then run `npm run release:win` — this builds and uploads the installer plus the metadata file `electron-updater` reads straight to a GitHub Release.

Two things worth knowing:
- The GitHub repo needs to be public for this to work simply (private repos need extra token-in-app plumbing). Given the app already enforces licensing independently of how someone gets the installer — the trial is open to anyone regardless — a public releases page isn't a real business risk here.
- Like the installer itself, updates aren't signed yet, so `verifyUpdateCodeSignature` is explicitly turned off in `electron/main.js` (with a `TODO` comment) — remove that line once you're signing for real, otherwise every update will fail its signature check.

### Not built yet (deliberately deferred)

- **Signed builds** — Windows signing is wired up (drop a cert via the standard `CSC_LINK`/`CSC_KEY_PASSWORD` env vars and it signs automatically), but untested since there's no cert yet. macOS signing/notarization config is scaffolded (`build/entitlements.mac.plist`, `build/notarize.js`, guarded by `APPLE_ID`/`APPLE_APP_SPECIFIC_PASSWORD`/`APPLE_TEAM_ID` env vars) but **can't be built or tested at all from this Windows machine** — that needs an actual Mac.
- **App icon** — no custom `.ico`/`.icns` supplied yet, so builds use Electron's default icon.
