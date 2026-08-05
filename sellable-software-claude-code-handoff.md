# Handoff: Turning the Scheduler/CRM into a Sellable Downloadable Product

## What this is

A companion build to the existing local-PC handoff (`scheduler-crm-claude-code-handoff.md`), which covers turning the Claude.ai artifact into a real app running locally with a Node/Express + SQLite backend. That handoff is about Mathew's own internal tool. **This handoff is about a second, parallel build target: the same core software, packaged and licensed to sell to strangers as a downloadable product** through the plan already worked out (Lemon Squeezy checkout, $99 intro/$189 standard pricing, FB ads → landing page funnel).

Treat the local-PC handoff as the technical foundation — the Node/Express + SQLite architecture, the data model, the feature set — and this document as what needs to be added on top of it specifically to make it safe, trustworthy, and functional to hand to a paying stranger who has no relationship with Mathew and no reason to trust an unfamiliar installer.

## Goals

1. Package the app as a real installer a non-technical buyer can double-click and run — not a folder of code, not a terminal command.
2. Make sure the installer doesn't look like malware to someone who's never heard of Mathew or this product.
3. Add license key activation, tied to Lemon Squeezy, so a purchase automatically unlocks the software with no manual step from Mathew.
4. Give buyers a clear first-run experience and a visible way to protect their own data, since Mathew won't be there to help if something goes wrong.

## Packaging: Electron or Tauri

Wrap the existing React frontend + local Node/Express + SQLite backend (already scoped in the companion handoff) as a desktop app using Electron or Tauri, producing:
- A signed Windows installer (`.exe`/`.msi`)
- A signed macOS installer (`.dmg`)

**Code signing is not optional for this build target**, even though it's optional/nice-to-have for Mathew's own internal use. An unsigned installer trips Windows SmartScreen and macOS Gatekeeper, both of which present as security warnings to a stranger who has no reason to click through them. Budget for:
- A Windows code-signing certificate
- An Apple Developer Program account (needed for macOS notarization)

Both are ongoing annual costs (roughly $100–400/year combined) — worth Claude Code flagging clearly during setup rather than discovering after the first buyer support ticket about a "this app is dangerous" warning.

## License key activation (Lemon Squeezy)

- On first run, show an activation screen: enter the license key emailed automatically by Lemon Squeezy at purchase.
- Validate the key against **Lemon Squeezy's License API** on activation, and cache the validated state locally so the app still works if the machine is later offline (this is desktop software, not a hosted service — don't require a live connection every time it opens).
- A lightweight periodic re-check (e.g. on each app update check, or every N days while online) is reasonable; a hard requirement to be online constantly is not — that's a worse experience than the trust this is supposed to build.
- Keep the check meaningful but not adversarial: this is about stopping casual, unlimited copy-sharing, not building anti-piracy DRM that risks locking out legitimate buyers over false positives.

## Trial mode

Per the sales plan, buyers should be able to try before they buy rather than a blind purchase from an unknown solo seller. Simplest approach: a time-limited trial (e.g. 14 days) that runs fully-featured locally without a license key, then requires activation to continue. Lemon Squeezy supports trial-then-convert flows on the checkout side — confirm how that maps to this app's own local trial-tracking (e.g. a first-run timestamp stored locally) since the app itself needs to enforce the trial window even when it's not talking to Lemon Squeezy in real time.

## First-run experience for strangers

This app was originally built for Mathew's own use, where no onboarding was needed. A buyer with zero context needs more:
- A short first-run flow: activate license (or start trial) → quick "what this app does" orientation → land on an empty state that makes it obvious how to add the first business/customer/job, rather than a blank multi-pane screen.
- Point out the Excel export prominently early on (in onboarding or a persistent "back up your data" nudge) — since this is local-only storage, a buyer's data loss is a support and reputation risk Mathew doesn't want to inherit silently. Making backups an obvious, promoted feature rather than a buried one meaningfully reduces that risk.

## Product scope decision worth flagging back to Mathew

The existing tool supports multiple businesses via the Excel-style bottom tabs — built for Mathew's own use managing several client businesses at once. Most buyers of the standalone product will likely be a single tradie running one business. Worth deciding (or confirming with Mathew) whether to:
- **Keep multi-business support as-is** — it's already built, and it's a genuine differentiator ("run more than one business/ABN from one tool") worth keeping in the marketing.
- **Simplify the first-run experience** so a single-business buyer isn't confused by a tab-switching concept they don't need on day one — e.g. default to one business tab and only surface "add another business" once they've used the app a bit, rather than presenting the multi-tab bar as the very first thing a brand-new, single-business buyer sees.

Recommend the second option as a UI/onboarding detail rather than removing the underlying feature — cheap to do, avoids confusing the majority single-business buyer without losing the differentiator for buyers who do run more than one.

## Not in scope for this build

- The future Supabase multi-tenant / per-business-login work (documented in the companion local-PC handoff's "later" section) — that's about Mathew's own client-facing product down the line, not the sold-to-strangers desktop product covered here. Keep these two build targets' data models compatible where reasonable, but don't build the multi-tenant auth work into the sold product.
- Auto-update infrastructure — nice to have eventually so bug fixes reach buyers without a manual reinstall, but not required for a first sellable version. Flag as a fast-follow rather than a launch blocker.

## Suggested build order

1. Confirm the local-PC version (companion handoff) is working end-to-end first — this build target is additive packaging and licensing on top of it, not a parallel rebuild.
2. Set up the Lemon Squeezy product, confirm license key issuance and the License API response shape before wiring up in-app activation.
3. Build the license activation + trial screens.
4. Wrap with Electron/Tauri, get code signing working on a test build before worrying about polish — confirm a totally unfamiliar Windows and Mac machine can install and run it without a security warning derailing the experience.
5. Build the simplified first-run flow and the backup/export prompt.
6. Only after all of the above works end-to-end: revisit auto-updates and any further polish.
