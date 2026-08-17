# Plumb — UI/UX

Design language and its implementation for Site Sparrow (Electron + React desktop client;
React Native companion planned).

Read before any real work:
- `design-system.md` — the living system: colour tokens, contrast rules, brand mark usage.
- `decisions-log.md` — what was decided and why, newest first. Don't relitigate without
  reading the reasoning.
- `lessons-learned.md` — created when there's a lesson worth keeping.

## Fast facts

- Brand colours are defined **once**, in `client/src/index.css` `:root`, as RGB channel
  triplets. `client/tailwind.config.js` only maps them to utility names.
- **Colour values are provisional** pending final logo artwork.
- Brand artwork is expected at `client/public/brand/site-sparrow-logo.svg` (lockup) and
  `client/public/brand/site-sparrow-mark.svg` (bird only). `client/src/Logo.jsx` loads
  them and degrades to a plain coloured square if absent.
- Out of Plumb's scope: `electron/`, `electron-builder.json`, `build/`, appId, repo name,
  auto-update — those are Sentinel's.
