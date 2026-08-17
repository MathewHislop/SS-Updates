# Sentinel — Decisions Log

Electron shell (main process, preload, packaging, auto-update). Newest first.

---

## 2026-08-17 — "Site Sparrow" rebrand is display-name-only; all identifiers frozen

**Context.** v1.1.0 already shipped to real customers. Rebranding from "Simple
Scheduler" to "Site Sparrow" touches several strings that *look* cosmetic but are
actually load-bearing identity for installed users.

**Decision.** Changed display text only:

- `electron-builder.json` → `productName: "Site Sparrow"`, plus explicit
  `nsis.shortcutName` and `nsis.uninstallDisplayName`.
- `electron/main.js` → `APP_DISPLAY_NAME` constant driving `BrowserWindow.title`
  and a new `app.setAboutPanelOptions({ applicationName })`.

**Explicitly NOT changed, and why:**

| Identifier | Value (frozen) | Breaks if changed |
|---|---|---|
| `appId` | `com.simplescheduler.desktop` | NSIS uninstaller registry key + electron-updater identity → side-by-side install, not in-place upgrade |
| `publish` block | `MathewHislop/Small-Business-Scheduler` | the update feed existing installs poll |
| `package.json` `name` | `simple-scheduler` | `app.getName()` → `app.getPath("userData")` |
| `package.json` `productName` | **must stay absent** | same as above |
| `app.setName()` | never called | same as above |

**The non-obvious one.** The most dangerous edit in this rebrand is *not* `appId`
— it is adding a `productName` to the root `package.json`. Verified empirically
with a throwaway Electron harness:

```
name only                        -> app.getName()="simple-scheduler"
                                    userData=%APPDATA%\simple-scheduler
name + productName:"Site Sparrow"-> app.getName()="Site Sparrow"
                                    userData=%APPDATA%\Site Sparrow
```

That silently orphans every customer's SQLite DB, license/trial state and
uploads; the app comes up looking brand new with no error. `electron-builder.json`'s
`productName` does **not** have this effect — the packaged app reads its own
`package.json`, which electron-builder copies without injecting `productName`.
Guard comments now live at `electron/main.js:5-16` and `:44-50`.

**Rejected.** Putting a `_comment_*` key in `electron-builder.json` to document
the appId freeze — its JSON schema is `additionalProperties: false`, so any
comment key fails the build. Documentation lives in code comments and here instead.

---

## 2026-08-17 — Icon pipeline uses app-builder-bin, no new dependencies

**Decision.** `build/generate-icons.js` (+ `npm run icons`) converts
`build/site-sparrow-icon-source.png` (committed master) into `build/icon.png`,
`icon.ico`, `icon.icns`. It shells out to `require("app-builder-bin").appBuilderPath`
— the same binary electron-builder already uses internally for icon conversion,
already in the lockfile.

**Rejected:** `electron-icon-builder`, `sharp`, `png2icons` (all new deps needing
approval; a rebrand does not justify new supply-chain surface). ImageMagick is not
installed on this machine — note that `which convert` finds
`C:\Windows\system32\convert`, the *filesystem* utility, not ImageMagick.

**Gotcha recorded:** `app-builder icon` silently returns `{"icons":null,"isFallback":true}`
and writes nothing when given a relative `--input`. Absolute paths only.

**Known limitation:** cannot rasterise SVG. If the master arrives as SVG it must be
exported to a 1024x1024 transparent PNG first.

---

## Standing open item — builds are unsigned

`electron/main.js` sets `autoUpdater.verifyUpdateCodeSignature = false` (TODO-tagged).
Unsigned installers have no publisher certificate to verify against, so an update
downloaded over the wire is trusted on transport security alone. Untouched by the
rebrand, still open. Resolving it requires a code-signing certificate — an
approval-gated credential. Re-raise before any release that widens distribution.
